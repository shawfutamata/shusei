import { env } from 'cloudflare:workers';
import { ensureDatabase, getMobileSessionAccess, startMemberSessionByEmail, hashMobileSecret, deleteMobileAccount } from '../db/data';
import { prepareLineAuthorization, storeLineAuthorization, recoverLineDeauthorization, checkLineAuthorization, requestLineDeauthorization, type LinePrivacyGrantProof } from '../db/line-authorization';
const worker = { async fetch(request: Request) {
  try {
    await ensureDatabase(); const input = await request.json() as Record<string, unknown>; const member = String(input.member || 'test-member');
    if (input.action === 'init') {
      await env.DB.batch([
        env.DB.prepare("INSERT OR IGNORE INTO members(id,email,display_name,membership_status,created_at) VALUES(?,?,?,'active',?)").bind(member, 'test@example.com', 'test', new Date().toISOString()),
        env.DB.prepare("INSERT OR IGNORE INTO line_accounts(member_id,provider_id,line_user_id,linked_at,consent_version) VALUES(?,?,?,?,?)").bind(member, 'test-provider', 'U' + 'a'.repeat(32), new Date().toISOString(), 'fixture'),
      ]); return Response.json(true);
    }
    if (input.action === 'store') { await storeLineAuthorization(member, String(input.subject || 'U' + 'a'.repeat(32)), String(input.token || 'test-access-token-never-real'), Number(input.expiresIn ?? 3600)); return Response.json(true); }
    if (input.action === 'prepareAtomic') {
      const subject = String(input.subject || 'U' + 'a'.repeat(32));
      const prepared = await prepareLineAuthorization(member, subject, String(input.token || 'test-access-token-never-real'), Number(input.expiresIn ?? 3600));
      const statements = [
        env.DB.prepare("INSERT INTO members(id,email,display_name,membership_status,created_at) VALUES(?,?,?,'active',?)").bind(member, `${member}@example.test`, member, new Date().toISOString()),
        env.DB.prepare('INSERT INTO line_accounts(member_id,provider_id,line_user_id,linked_at,consent_version) VALUES(?,?,?,?,?)').bind(member, 'test-provider', String(input.linkedSubject || subject), new Date().toISOString(), 'fixture'),
        prepared,
      ];
      if (input.failBatch) statements.push(env.DB.prepare("INSERT INTO members(id,email,display_name,created_at) VALUES('test-member','duplicate@example.test','duplicate','test')"));
      const result = await env.DB.batch(statements);
      return Response.json(result[2].meta.changes);
    }
    if (input.action === 'recover' || input.action === 'recoverThenDeauthorize') {
      await recoverLineDeauthorization(member, String(input.subject || 'U' + 'a'.repeat(32)), String(input.token || 'test-recovery-token-never-real'), Number(input.expiresIn ?? 3600), input.proof as LinePrivacyGrantProof | undefined);
      return Response.json(input.action === 'recoverThenDeauthorize' ? await requestLineDeauthorization(member, input.proof as LinePrivacyGrantProof | undefined) : true);
    }
    if (input.action === 'session') {
      const linked = await env.DB.prepare('SELECT email FROM members WHERE id=?').bind(member).first<{ email: string }>();
      if (!linked) throw new Error('missing member');
      const session = await startMemberSessionByEmail(linked.email);
      if (input.line) await env.DB.prepare('INSERT INTO line_sessions(token_hash,member_id) VALUES(?,?)').bind(await hashMobileSecret(session.token), member).run();
      return Response.json(session);
    }
    if (input.action === 'access') return Response.json(await getMobileSessionAccess(String(input.sessionToken), { skipLineAuthorization: input.skipLineAuthorization === true }));
    if (input.action === 'withdraw') {
      const access = await getMobileSessionAccess(String(input.sessionToken));
      if (!access) throw new Error('missing session');
      await deleteMobileAccount(access.user); return Response.json(true);
    }
    if (input.action === 'check') return Response.json(await checkLineAuthorization(member));
    if (input.action === 'deauthorize') return Response.json(await requestLineDeauthorization(member, input.proof as LinePrivacyGrantProof | undefined));
    return Response.json(null);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'error' }, { status: 400 }); }
} };

export default worker;
