import { requestLinePrivacyCode, confirmLinePrivacyAction, type PrivacyPurpose } from '../db/line-privacy';
import { lineEmailNoticeAllowed } from '../db/line-email-consent';
import { ensureDatabase, getMobileSessionAccess, hashMobileSecret, startMemberSessionByEmail, addIntroductionMessage, createIntroduction, createRequest, sendPendingOfferDigest } from '../db/data';
import { createLineFlow, consumeLineFlow, linkLineAccount, loginWithLine, registerWithLine, setLinePreferences, unlinkLineAccount, lineAccountStatus, stopLineEmailNotices } from '../db/line-accounts';
import { sendLineNotice, flushLineNotifications, processLineWebhook } from '../db/line-notifications';
import { exchangeLineCode, validLineSignature } from '../app/line-auth';
import { createDirectSignupDraft } from '../db/meeting-accounts';
import { dumpDatabase } from '../db/backup';
import { env } from 'cloudflare:workers';
import { LINE_DATA_CONSENT_VERSION } from '../app/line-data-consent';
const worker = { async fetch(request: Request) {
  const body = await request.json() as Record<string, unknown>;
  try {
    await ensureDatabase();
    const member = String(body.member || 'member-a'), sub = String(body.sub || `U${'a'.repeat(32)}`);
    const identity = { sub, accessToken: `fixture-access-${sub}`, expiresIn: 3600 };
    let result: unknown = { ok: true };
    switch (body.action) {
      case 'privacyRequest': await requestLinePrivacyCode(member, body.purpose as PrivacyPurpose); break;
      case 'privacyConfirm': {
        const access = await getMobileSessionAccess(String(body.token)); if (!access) throw new Error('No session');
        await confirmLinePrivacyAction(access.user, body.purpose as PrivacyPurpose, String(body.code)); break;
      }
      case 'flow': result = await createLineFlow({ mode: 'login', memberId: '', sessionHash: '', returnTo: String(body.returnTo || '/'), draftId: '' }); break;
      case 'consume': result = await consumeLineFlow(String(body.state), String(body.browser)); break;
      case 'link': await linkLineAccount(member, identity); break;
      case 'login': result = await loginWithLine(identity); break;
      case 'google': result = await startMemberSessionByEmail(String(body.email)); break;
      case 'access': result = await getMobileSessionAccess(String(body.token)); break;
      case 'hash': result = await hashMobileSecret(String(body.token)); break;
      case 'status': result = await lineAccountStatus(member, String(body.token || '')); break;
      case 'preferences': await setLinePreferences(member, body.message === true, body.offer === true, body.proof as { subject: string } | undefined); break;
      case 'unlink': await unlinkLineAccount(member, String(body.token)); break;
      case 'notice': await sendLineNotice(member, body.kind === 'offer' ? 'offer' : 'message', String(body.key)); break;
      case 'flush': result = await flushLineNotifications(); break;
      case 'webhook': await processLineWebhook(body.events as Parameters<typeof processLineWebhook>[0]); break;
      case 'signature': result = await validLineSignature(String(body.raw), String(body.signature)); break;
      case 'exchange': result = await exchangeLineCode('fake', 'v'.repeat(64), 'nonce'); break;
      case 'legacyDraft': result = await createDirectSignupDraft({ consent: true, authProvider: 'google' }); break;
      case 'draft': {
        // account単体試験の確認済みfixture。実OTPとbrowser拘束はline-signup-runtimeで検証する。
        if (body.lineConsent !== true) throw new Error('line_consent');
        const id = crypto.randomUUID(), now = Date.now();
        await env.DB.prepare(`INSERT INTO line_signup_drafts(id,name,email,invite,mail_consent,consent_version,consent_at,browser_hash,code_hash,code_expires_at,expires_at,requested_at,verified_at)
          VALUES(?,?,?,?,?,?,?,'fixture-browser','',0,?,?,?)`)
          .bind(id, String(body.name || '本人が入力した名前'), String(body.email || 'new@example.com'), String(body.invite || ''), body.mailConsent === true ? 1 : 0,
            LINE_DATA_CONSENT_VERSION, new Date(now).toISOString(), now + 600000, now, body.verified === false ? 0 : now).run();
        result = id; break;
      }
      case 'register': result = await registerWithLine(identity, String(body.draft)); break;
      case 'emailAllowed': result = await lineEmailNoticeAllowed(member); break;
      case 'stopEmail': await stopLineEmailNotices(member); break;
      case 'backup': result = await dumpDatabase(); break;
      case 'message': {
        const access = await getMobileSessionAccess(String(body.token)); if (!access) throw new Error('No session');
        result = await addIntroductionMessage(access.user, `dm:${String(body.recipient || 'member-a')}`, 'これは非公開の取引本文です'); break;
      }
      case 'digest': result = await sendPendingOfferDigest(); break;
      case 'request': {
        const access = await getMobileSessionAccess(String(body.token)); if (!access) throw new Error('No session');
        result = await createRequest(access.user, { category: 'project', title: '試験用案件', description: '外部送信なしの試験', budgetLabel: '', budgetBand: '', area: '', industryTags: ['システム開発'], deadline: '' }); break;
      }
      case 'offer': {
        const access = await getMobileSessionAccess(String(body.token)); if (!access) throw new Error('No session');
        result = await createIntroduction(access.user, { requestId: String(body.requestId || 'fixture-request'), personName: '非公開の紹介相手', personCompany: '非公開企業', relationship: '知人', fitReason: '秘密の条件' }); break;
      }
    }
    return Response.json(result ?? null);
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 400 }); }
} };
export default worker;
