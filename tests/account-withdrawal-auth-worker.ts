import { deleteMobileAccount, ensureDatabase, getMobileSessionAccess, hashMobileSecret, startMemberSessionByEmail, upsertMember } from '../db/data';
import { consumeLineFlow, createLineFlow, linkLineAccount, loginWithLine, registerWithLine, unlinkLineAccount } from '../db/line-accounts';
import { createDirectSignupDraft, verifyMeetingCode } from '../db/meeting-accounts';
import type { SessionUser } from '../app/session-user';
import { env } from 'cloudflare:workers';
import { LINE_DATA_CONSENT_VERSION } from '../app/line-data-consent';
const worker = { async fetch(request: Request) {
  try {
    await ensureDatabase();
    const body = await request.json() as { action: string; member: string; email: string; token: string; state: string; browser: string; sub: string; draft: string; user: SessionUser };
    let result: unknown = null;
    switch (body.action) {
      case 'session': result = await startMemberSessionByEmail(body.email); break;
      case 'access': result = await getMobileSessionAccess(body.token); break;
      case 'delete': await deleteMobileAccount({ userId: body.member, email: body.email, displayName: 'Member', fullName: 'Member' }); break;
      case 'stale-upsert': await upsertMember(body.user); break;
      case 'line-link': await linkLineAccount(body.member, { sub: body.sub, accessToken: `fixture-access-${body.sub}`, expiresIn: 3600 }); break;
      case 'line-login': result = await loginWithLine({ sub: body.sub, accessToken: `fixture-access-${body.sub}`, expiresIn: 3600 }); break;
      case 'line-unlink': await unlinkLineAccount(body.member, body.token); break;
      case 'flow': result = await createLineFlow({ mode: body.member ? 'link' : 'login', memberId: body.member || '', sessionHash: body.token ? await hashMobileSecret(body.token) : '', returnTo: '/', draftId: '' }); break;
      case 'signup-flow': result = await createLineFlow({ mode: 'signup', memberId: '', sessionHash: '', returnTo: '/', draftId: body.draft }); break;
      case 'consume': result = await consumeLineFlow(body.state, body.browser); break;
      case 'draft': result = await createDirectSignupDraft({ consent: true, authProvider: 'google' }); break;
      case 'line-draft': {
        // LINE account試験専用の独立メール確認済みfixture。実OTPは別suiteで検証する。
        const id = crypto.randomUUID(), now = Date.now();
        await env.DB.prepare(`INSERT INTO line_signup_drafts(id,name,email,mail_consent,consent_version,consent_at,browser_hash,code_hash,code_expires_at,expires_at,requested_at,verified_at)
          VALUES(?,?,?,0,?,?,'fixture-browser','',0,?,?,?)`).bind(id, '本人が入力した名前', body.email, LINE_DATA_CONSENT_VERSION, new Date(now).toISOString(), now + 600000, now, now).run();
        result = id; break;
      }
      case 'line-register': result = await registerWithLine({ sub: body.sub, accessToken: `fixture-access-${body.sub}`, expiresIn: 3600 }, body.draft); break;
      case 'hash-registration': result = await hashMobileSecret(`direct:${body.email}:123456`); break;
      case 'verify-registration': result = await verifyMeetingCode('direct', body.email, '123456'); break;
    }
    return Response.json(result);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 400 }); }
} };
export default worker;
