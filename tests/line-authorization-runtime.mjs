import { mockStatelessToken } from './line-stateless-fixture.mjs';
// 実D1とセッション認可を隔離検証。本番・実LINEに触れない。
import { Miniflare } from 'miniflare';
import { Response } from 'undici';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const dir = mkdtempSync(join(tmpdir(), 'tasuki-line-authorization-'));
await build({ entryPoints: [resolve('tests/line-authorization-worker.ts')], outfile: join(dir, 'worker.js'), bundle: true, format: 'esm', platform: 'node', external: ['cloudflare:workers'], tsconfig: resolve('tsconfig.json'), define: { 'import.meta.env.DEV': 'false' } });
let verifyStatus = 200, issueStatus = 200, deauthStatus = 204, verifyCalls = 0, issueCalls = 0, deauthCalls = 0, onIssue = async () => {}, onVerify = async () => {}, onUserinfo = async () => {}, onDeauth = async () => {};
const member = 'test-member', subject = 'U' + 'a'.repeat(32);
let userinfoSubject = subject;
const deauthTokens = [];
const mf = new Miniflare({ modules: true, modulesRoot: dir, scriptPath: join(dir, 'worker.js'), compatibilityDate: '2026-05-22', compatibilityFlags: ['nodejs_compat'], d1Databases: { DB: 'authorization-test' }, r2Buckets: ['AVATARS'], bindings: { AUTH_CODE_PEPPER: 'test-only', LINE_PROVIDER_ID: 'test-provider', LINE_LOGIN_CHANNEL_ID: 'test-channel', LINE_LOGIN_CHANNEL_SECRET: 'test-secret', LINE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'), LINE_TOKEN_KEY_VERSION: 'v1' }, outboundService: async request => {
  const url = new URL(request.url); assert.equal(url.hostname, 'api.line.me', 'no real outbound requests');
  if (url.pathname === '/oauth2/v3/token') {
    issueCalls++; const response = await mockStatelessToken(request, 'test-channel', 'test-secret', 'fake-channel-token');
    await onIssue(); return issueStatus === 200 ? response : new Response('{}', { status: issueStatus });
  }
  if (url.pathname === '/oauth2/v2.1/verify') { verifyCalls++; await onVerify(); return Response.json({ client_id: 'test-channel', expires_in: 3600, scope: 'openid profile' }, { status: verifyStatus }); }
  if (url.pathname === '/oauth2/v2.1/userinfo') { await onUserinfo(); return Response.json({ sub: userinfoSubject }); }
  if (url.pathname === '/user/v1/deauthorize') { assert.equal(request.headers.get('authorization'), 'Bearer fake-channel-token'); deauthCalls++; deauthTokens.push((await request.json()).userAccessToken); await onDeauth(); return new Response(null, { status: deauthStatus }); }
  throw new Error('unmocked endpoint');
} });
try {
  const worker = await mf.getWorker(), db = await mf.getD1Database('DB');
  const call = async (action, data = {}) => { const response = await worker.fetch('https://fixture/', { method: 'POST', body: JSON.stringify({ action, ...data }) }); return { status: response.status, result: await response.json() }; };
  const good = async (action, data = {}) => { const response = await call(action, data); assert.equal(response.status, 200, JSON.stringify(response)); return response.result; };
  const row = () => db.prepare('SELECT * FROM line_authorizations WHERE member_id=?').bind(member).first();
  const optin = async () => { await db.prepare('UPDATE line_accounts SET notify_message=1,notify_offer=1 WHERE member_id=?').bind(member).run();
    await db.prepare("INSERT OR IGNORE INTO mobile_sessions(token_hash,member_id,created_at,last_seen_at,expires_at) VALUES('fixture-session',?,?,?,?)").bind(member, new Date().toISOString(), new Date().toISOString(), new Date(Date.now()+600000).toISOString()).run();
    await db.prepare("INSERT OR IGNORE INTO line_sessions(token_hash,member_id) VALUES('fixture-session',?)").bind(member).run(); };
  const notifications = async () => (await db.prepare('SELECT notify_message FROM line_accounts WHERE member_id=?').bind(member).first()).notify_message;
  await good('init'); assert.equal(await good('check'), 'invalid'); await good('store');
  assert.doesNotMatch(JSON.stringify(await row()), /test-access-token-never-real/); assert.equal(await good('check'), 'valid');
  assert.equal((await call('store', { member: 'missing-member' })).status, 400); assert.equal((await call('store', { subject: 'U'+'b'.repeat(32) })).status, 400); assert.equal((await call('store', { expiresIn: 0 })).status, 400);
  // 紐付けの存在前に準備し、新会員・紐付け・暗号credentialを同じtransactionで作る。
  userinfoSubject = 'U' + 'b'.repeat(32);
  assert.equal(await good('prepareAtomic', { member: 'atomic-member', subject: userinfoSubject }), 1);
  assert.ok(await db.prepare("SELECT 1 FROM line_authorizations WHERE member_id='atomic-member'").first());
  userinfoSubject = 'U' + 'c'.repeat(32);
  assert.equal((await call('prepareAtomic', { member: 'atomic-rollback', subject: userinfoSubject, failBatch: true })).status, 400);
  assert.equal(await db.prepare("SELECT 1 FROM members WHERE id='atomic-rollback'").first(), null, 'failed batch rolls back new member and binding');
  assert.equal(await db.prepare("SELECT 1 FROM line_authorizations WHERE member_id='atomic-rollback'").first(), null);
  assert.equal(await good('prepareAtomic', { member: 'atomic-mismatch', subject: userinfoSubject, linkedSubject: 'U' + 'd'.repeat(32) }), 0, 'statement rechecks linked subject at execution');
  assert.equal(await db.prepare("SELECT 1 FROM line_authorizations WHERE member_id='atomic-mismatch'").first(), null);
  userinfoSubject = 'U' + 'f'.repeat(32);
  assert.equal((await call('store')).status, 400, 'caller cannot save a token for another LINE subject');
  userinfoSubject = subject;
  await optin(); verifyStatus=503; assert.equal(await good('check'), 'unavailable'); assert.equal(await notifications(), 1); assert.equal((await row()).status, 'active', 'network failure is not consent revocation');
  verifyStatus=400; assert.equal(await good('check'), 'invalid'); assert.equal(await notifications(), 0); assert.equal((await row()).status, 'reauth_required'); assert.equal(await db.prepare("SELECT * FROM mobile_sessions WHERE token_hash='fixture-session'").first(), null);
  verifyStatus=200; await good('store'); await optin(); await db.prepare('UPDATE line_authorizations SET expires_at=0').run(); const before=verifyCalls; assert.equal(await good('check'), 'invalid'); assert.equal(verifyCalls,before,'local expiry fails closed'); assert.equal(await notifications(),0);
  await good('store'); await optin(); onVerify=async()=>{ await db.prepare("UPDATE line_authorizations SET revision='newer-auth' WHERE member_id=?").bind(member).run(); }; assert.equal(await good('check'),'invalid','stale successful verification cannot authorize newer revision'); onVerify=async()=>{};
  await good('store'); await optin(); deauthStatus=503; assert.equal(await good('deauthorize'),'unavailable'); assert.equal(await notifications(),0); assert.equal((await row()).status,'deauthorize_pending'); assert.notEqual((await row()).ciphertext,''); assert.equal(await good('check'),'invalid');
  deauthStatus=400; assert.equal(await good('deauthorize'),'reauth_required','invalid token is not proof that LINE grant was canceled'); assert.notEqual((await row()).ciphertext,'');
  deauthStatus=204; assert.equal(await good('deauthorize'),'accepted'); assert.equal((await row()).ciphertext,''); assert.equal((await row()).iv,''); const prior=deauthCalls; assert.equal(await good('deauthorize'),'accepted'); assert.equal(deauthCalls,prior,'accepted local stage is idempotent');
  assert.equal((await call('store')).status,400,'normal login cannot overwrite completed deauthorization before cleanup');
  await db.prepare('DELETE FROM line_authorizations').run(); await good('store'); onDeauth=async()=>{await db.prepare("UPDATE line_authorizations SET revision='new-auth-during-external-call',ciphertext='different-credential' WHERE member_id=?").bind(member).run();}; assert.equal(await good('deauthorize'),'unavailable'); assert.notEqual((await row()).ciphertext,'','newer authorization is not silently erased'); onDeauth=async()=>{};
  assert.equal((await call('store')).status,400,'normal login cannot overwrite pending deauthorization');
  await db.prepare('DELETE FROM line_authorizations').run(); await good('store'); await db.prepare("UPDATE line_authorizations SET iv='tampered'").run(); assert.equal(await good('check'),'unavailable','key/ciphertext problem is not proof of cancellation');
  await db.prepare('DELETE FROM line_authorizations').run(); await good('store');
  const beforeParallel = deauthCalls, beforeParallelIssuance = issueCalls;
  const concurrent = await Promise.all(Array.from({length:8},()=>good('deauthorize')));
  assert.ok(concurrent.includes('accepted')); assert.equal(deauthCalls,beforeParallel+1,'concurrent deauthorization sends one external request'); assert.equal(issueCalls, beforeParallelIssuance + 1, 'concurrent lease permits one stateless issuance');
  await db.prepare('DELETE FROM line_authorizations').run(); await good('store');
  onDeauth=async()=>{await db.prepare("UPDATE line_authorizations SET revision='new-lease-same-token',deauthorize_lease_until=0 WHERE member_id=?").bind(member).run();};
  assert.equal(await good('deauthorize'),'accepted','confirmed external success survives a lease change for the same sealed credential'); onDeauth=async()=>{};

  // 実際のsession読取はLINE経由だけを公式検証する。Google/メール経由へ障害を波及させない。
  await db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run(); await good('store');
  const independent = await good('session');
  const line = await good('session', { line: true });
  const access = (session, extra = {}) => good('access', { sessionToken: session.token, ...extra });
  const independentCalls = verifyCalls;
  assert.equal((await access(independent)).user.userId, member); assert.equal(verifyCalls, independentCalls, 'independent sessions do not call LINE');
  assert.equal((await access(line)).user.userId, member); assert.equal(verifyCalls, independentCalls + 1);
  verifyStatus = 503;
  assert.equal(await access(line), null, 'LINE outage fails closed for app access');
  const beforeSkip = verifyCalls;
  assert.equal((await access(line, { skipLineAuthorization: true })).user.userId, member, 'privacy-only raw cookie lookup bypasses remote verification');
  assert.equal((await access(independent)).user.userId, member);
  assert.equal(verifyCalls, beforeSkip, 'privacy lookup and independent login do not request LINE');
  verifyStatus = 400;
  assert.equal(await access(line), null, 'revoked LINE token rejects its app session');
  assert.equal(await access(line, { skipLineAuthorization: true }), null, 'privacy lookup cannot resurrect a deleted LINE session');
  assert.equal((await access(independent)).user.userId, member, 'independent session survives LINE revocation');
  verifyStatus = 200; await good('store');
  const expires = await good('session', { line: true });
  await db.prepare('UPDATE line_authorizations SET expires_at=0 WHERE member_id=?').bind(member).run();
  const beforeExpiry = verifyCalls; assert.equal(await access(expires), null); assert.equal(verifyCalls, beforeExpiry, 'local token expiry rejects without network');
  await good('store');
  const raceSession = await good('session', { line: true });
  onVerify = async () => { await db.prepare('DELETE FROM mobile_sessions WHERE token_hash IN(SELECT token_hash FROM line_sessions WHERE member_id=?)').bind(member).run(); };
  assert.equal(await access(raceSession), null, 'session removed during remote verification cannot authorize from a stale lookup'); onVerify = async () => {};
  const withdrawal = await call('withdraw', { sessionToken: independent.token });
  assert.equal(withdrawal.status, 400); assert.match(withdrawal.result.error, /先にLINE連携を解除/);
  assert.ok(await db.prepare('SELECT 1 FROM members WHERE id=?').bind(member).first());
  assert.ok(await db.prepare('SELECT 1 FROM line_accounts WHERE member_id=?').bind(member).first(), 'withdrawal never silently deletes an active LINE binding');

  // 期限切れtokenの解除回復は、通常認証や通知を一度も再開せず新しいtokenだけに差し替える。
  assert.equal((await call('recover')).status, 400, 'active authorization cannot enter recovery');
  await db.prepare("UPDATE line_authorizations SET status='reauth_required' WHERE member_id=?").bind(member).run();
  await optin(); await good('recover', { token: 'reauth-recovery-access-token' });
  assert.equal((await row()).status, 'deauthorize_pending', 'reauth-required recovery transitions only to pending'); assert.equal(await notifications(), 0);
  await optin(); deauthStatus = 400; assert.equal(await good('deauthorize'), 'reauth_required');
  const oldCredential = (await row()).ciphertext;
  assert.equal((await call('recover', { subject: 'U' + 'b'.repeat(32) })).status, 400, 'recovery cannot change linked subject');
  userinfoSubject = 'U' + 'f'.repeat(32);
  assert.equal((await call('recover')).status, 400); assert.equal((await row()).ciphertext, oldCredential, 'recovery rejects a new token belonging to another LINE user');
  userinfoSubject = subject;
  await db.prepare('UPDATE line_authorizations SET deauthorize_lease_until=? WHERE member_id=?').bind(Date.now() + 30000, member).run();
  const beforeLease = verifyCalls;
  assert.equal((await call('recover')).status, 400); assert.equal(verifyCalls, beforeLease, 'live lease rejects recovery before API calls');
  await db.prepare('UPDATE line_authorizations SET deauthorize_lease_until=0 WHERE member_id=?').bind(member).run();
  verifyStatus = 503; assert.equal((await call('recover')).status, 400); assert.equal((await row()).ciphertext, oldCredential);
  verifyStatus = 200;
  onVerify = async () => { await db.prepare("UPDATE line_authorizations SET revision='lease-claimed-during-recovery',deauthorize_lease_until=? WHERE member_id=?").bind(Date.now() + 30000, member).run(); };
  assert.equal((await call('recover')).status, 400); assert.equal((await row()).ciphertext, oldCredential, 'concurrent claim cannot be overwritten'); onVerify = async () => {};
  await db.prepare('UPDATE line_authorizations SET deauthorize_lease_until=0 WHERE member_id=?').bind(member).run();
  await optin();
  await good('recover', { token: 'recovery-user-access-token' });
  assert.equal((await row()).status, 'deauthorize_pending'); assert.notEqual((await row()).ciphertext, oldCredential);
  assert.equal(await notifications(), 0); assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM line_sessions WHERE member_id=?').bind(member).first()).count, 0);
  assert.equal(await good('check'), 'invalid'); assert.equal((await access(independent)).user.userId, member);
  assert.equal((await call('store')).status, 400, 'recovery keeps ordinary re-login disabled until unlink is complete');
  deauthStatus = 204; assert.equal(await good('deauthorize'), 'accepted'); assert.equal(deauthTokens.at(-1), 'recovery-user-access-token');
  assert.equal((await call('recover')).status, 400, 'completed deauthorization cannot reopen a credential');
  // credentialがない旧連携も、本人確認済みの解除OAuthからpending専用で補修できる。
  await db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run();
  const beforeMissingMismatch = verifyCalls;
  assert.equal((await call('recover', { subject: 'U' + 'e'.repeat(32) })).status, 400); assert.equal(verifyCalls, beforeMissingMismatch);
  onVerify = async () => { await db.prepare("UPDATE line_accounts SET consent_version='relinked-during-recovery' WHERE member_id=?").bind(member).run(); };
  assert.equal((await call('recover')).status, 400); assert.equal(await row(), null, 'missing-credential recovery cannot cross a changed link'); onVerify = async () => {};
  onVerify = async () => {
    await db.prepare(`INSERT INTO line_authorizations(member_id,provider_id,channel_id,subject,ciphertext,iv,key_version,expires_at,status,revision,updated_at)
      VALUES(?,'test-provider','test-channel',?,'concurrent-new-credential','fixture-iv','v1',?,'active','concurrent-auth',?)`).bind(member, subject, Date.now() + 600000, Date.now()).run();
  };
  assert.equal((await call('recover')).status, 400); assert.equal((await row()).status, 'active');
  assert.equal((await row()).ciphertext, 'concurrent-new-credential', 'concurrent normal authorization is never replaced by missing-credential recovery'); onVerify = async () => {};
  await db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run();
  await optin(); await good('recover', { token: 'missing-credential-recovery-token' });
  assert.equal((await row()).status, 'deauthorize_pending'); assert.equal(await notifications(), 0);
  assert.equal((await db.prepare('SELECT COUNT(*) AS count FROM line_sessions WHERE member_id=?').bind(member).first()).count, 0);
  assert.equal(await good('check'), 'invalid', 'missing-credential recovery never enables normal authorization');
  assert.equal(await good('deauthorize'), 'accepted'); assert.equal(deauthTokens.at(-1), 'missing-credential-recovery-token');

  // privacy grantは最初の読取だけでなく、外部検証後の更新と外部解除の送信直前にも有効でなければならない。
  const proof = { tokenHash: 'a'.repeat(64), purpose: 'unlink' };
  const issueProof = (grantMember = member, purpose = 'unlink', expiresAt = Date.now() + 600000) => db.prepare(`INSERT INTO line_privacy_grants(token_hash,member_id,purpose,expires_at,created_at) VALUES(?,?,?,?,?)
    ON CONFLICT(token_hash) DO UPDATE SET member_id=excluded.member_id,purpose=excluded.purpose,expires_at=excluded.expires_at`)
    .bind(proof.tokenHash, grantMember, purpose, expiresAt, Date.now()).run();
  const invalidateProof = async mode => {
    if (mode === 'cancel') await db.prepare('DELETE FROM line_privacy_grants WHERE token_hash=?').bind(proof.tokenHash).run();
    else await db.prepare('UPDATE line_privacy_grants SET expires_at=0 WHERE token_hash=?').bind(proof.tokenHash).run();
  };
  await db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run(); await good('store'); await optin();
  const initialProofRow = await row(), initialProofCalls = deauthCalls, initialProofIssues = issueCalls;
  for (const [grantMember, purpose, expiresAt] of [[member, 'unlink', 0], [member, 'withdraw', Date.now()+600000], ['atomic-member', 'unlink', Date.now()+600000]]) {
    await issueProof(grantMember, purpose, expiresAt);
    assert.equal(await good('deauthorize', { proof }), 'unavailable'); assert.deepEqual(await row(), initialProofRow);
  }
  await invalidateProof('cancel');
  assert.equal(await good('deauthorize', { proof }), 'unavailable'); assert.deepEqual(await row(), initialProofRow);
  assert.equal((await call('deauthorize', { proof: { tokenHash: '', purpose: 'unlink' } })).status, 400, 'supplied malformed proof never becomes an optional-proof bypass');
  assert.equal(deauthCalls, initialProofCalls); assert.equal(issueCalls, initialProofIssues); assert.equal(await notifications(), 1, 'invalid grant cannot even acquire the local deauthorization lease');

  for (const missing of [false, true]) {
    for (const phase of ['verify', 'userinfo']) {
      for (const invalidation of ['cancel', 'expire']) {
        await db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run();
        if (!missing) { await good('store'); await db.prepare("UPDATE line_authorizations SET status='reauth_required' WHERE member_id=?").bind(member).run(); }
        await optin(); await issueProof();
        const before = await row(), callsBefore = deauthCalls;
        if (phase === 'verify') onVerify = () => invalidateProof(invalidation);
        else onUserinfo = () => invalidateProof(invalidation);
        assert.equal((await call('recoverThenDeauthorize', { proof })).status, 400, `${missing ? 'insert' : 'update'}: grant ${invalidation} during ${phase} prevents continuation`);
        onVerify = async () => {}; onUserinfo = async () => {};
        assert.deepEqual(await row(), before, 'expired/revoked proof cannot write any credential');
        assert.equal(await notifications(), 1); assert.equal(deauthCalls, callsBefore, 'no external deauthorization after grant cancellation/expiry');
      }
    }
  }

  // 隔離DB triggerでlease取得直後の取消/期限切れを模擬し、最終送信前の再確認を検証する。
  for (const invalidation of ['cancel', 'expire']) {
    await db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run(); await good('store'); await issueProof();
    await db.prepare(`CREATE TRIGGER test_cancel_grant_after_lease AFTER UPDATE OF status ON line_authorizations
      WHEN NEW.status='deauthorize_pending' BEGIN ${invalidation === 'cancel' ? 'DELETE FROM line_privacy_grants' : 'UPDATE line_privacy_grants SET expires_at=0'} WHERE token_hash='${proof.tokenHash}'; END`).run();
    const before = deauthCalls, issuesBefore = issueCalls;
    try { assert.equal(await good('deauthorize', { proof }), 'unavailable'); }
    finally { await db.prepare('DROP TRIGGER test_cancel_grant_after_lease').run(); }
    assert.equal(deauthCalls, before, 'grant revoked after lease prevents actual API send'); assert.equal(issueCalls, issuesBefore, 'pre-issuance guard blocks credential issuance too'); assert.equal((await row()).deauthorize_lease_until, 0);
  }
  // 新しいネットワーク待機の間に本人確認・lease・credentialが変わっても解除を送らない。
  const changesDuringIssue = [
    ['grant canceled', () => invalidateProof('cancel')],
    ['grant expired', () => invalidateProof('expire')],
    ['grant purpose changed', () => issueProof(member, 'withdraw')],
    ['grant member changed', () => issueProof('atomic-member')],
    ...['ciphertext', 'iv', 'key_version', 'provider_id', 'channel_id', 'subject', 'revision'].map(column =>
      [column + ' changed', () => db.prepare(`UPDATE line_authorizations SET ${column}='changed-during-issuance' WHERE member_id=?`).bind(member).run()]),
    ['lease expired', () => db.prepare('UPDATE line_authorizations SET deauthorize_lease_until=0 WHERE member_id=?').bind(member).run()],
    ['status changed', () => db.prepare("UPDATE line_authorizations SET status='active' WHERE member_id=?").bind(member).run()],
    ['linked identity changed', () => db.prepare("UPDATE line_accounts SET line_user_id='another-subject' WHERE member_id=?").bind(member).run()],
    ['authorization removed', () => db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run()],
    ['concurrent completion with canceled grant', async () => {
      await db.prepare("UPDATE line_authorizations SET status='deauthorized',ciphertext='',iv='',deauthorize_lease_until=0 WHERE member_id=?").bind(member).run();
      await invalidateProof('cancel');
    }],
  ];
  for (const [name, mutate] of changesDuringIssue) {
    await db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run(); await good('store'); await issueProof();
    const sendsBefore = deauthCalls, issuesBefore = issueCalls;
    onIssue = mutate;
    try { assert.equal(await good('deauthorize', { proof }), 'unavailable', name); }
    finally { onIssue = async () => {}; await db.prepare('UPDATE line_accounts SET line_user_id=? WHERE member_id=?').bind(subject, member).run(); }
    assert.equal(issueCalls, issuesBefore + 1, name + ': one issuance without retry');
    assert.equal(deauthCalls, sendsBefore, name + ': no deauthorize call');
    assert.doesNotMatch(JSON.stringify(await row()), /fake-channel-token/, 'stateless token never persisted');
  }
  await db.prepare('DELETE FROM line_authorizations WHERE member_id=?').bind(member).run(); await good('store'); await issueProof();
  const failedIssueSends = deauthCalls, failedIssueCount = issueCalls;
  issueStatus = 503; assert.equal(await good('deauthorize', { proof }), 'unavailable'); issueStatus = 200;
  assert.equal(deauthCalls, failedIssueSends); assert.equal(issueCalls, failedIssueCount + 1);
  assert.equal((await row()).status, 'deauthorize_pending'); assert.equal((await row()).deauthorize_lease_until, 0);
  assert.notEqual((await row()).ciphertext, '', 'unknown issuance result preserves sealed user credential for deliberate recovery');
  await issueProof(); assert.equal(await good('recoverThenDeauthorize', { proof }), 'accepted', 'valid grant allows recovery and official deauthorization');
  await invalidateProof('cancel'); assert.equal(await good('deauthorize', { proof }), 'unavailable', 'canceled proof does not return a completion signal for local cleanup');
  await db.prepare('DELETE FROM line_accounts WHERE member_id=?').bind(member).run(); assert.equal(await row(),null,'unlink cascades encrypted authorization');
  assert.equal(await good('withdraw', { sessionToken: independent.token }), true, 'account withdrawal works after official deauthorization and separate local unlink');
  assert.equal(await db.prepare('SELECT 1 FROM members WHERE id=?').bind(member).first(), null);
  console.log('PASS: atomic credential preparation, verification/identity binding, expiry/revocation session checks, independent login preservation, privacy-only lookup, no silent linked-account withdrawal, pending-only recovery with lease/revision protection, 204-only deauthorization, stateless issuance cancellation/expiry/identity/lease races, concurrency and same-credential success preservation.');
} finally { await mf.dispose(); rmSync(dir,{recursive:true,force:true}); }
