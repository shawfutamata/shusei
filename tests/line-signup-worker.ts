// この入口は隔離D1の試験専用。本番ルートには含めない。
import { ensureDatabase } from '../db/data';
import { dumpDatabase } from '../db/backup';
import { requestLineSignup, verifyLineSignup, verifiedLineSignup } from '../db/line-signup';
import { POST } from '../app/api/auth/line/registration/route';
const worker = { async fetch(request: Request) {
  if (new URL(request.url).pathname === '/api/auth/line/registration') return POST(request);
  try {
    const body = await request.json() as Record<string, unknown>;
    await ensureDatabase();
    switch (body.action) {
      case 'request': return Response.json(await requestLineSignup({ name: body.name, email: body.email, invite: body.invite, consent: body.consent, lineConsent: body.lineConsent, mailConsent: body.mailConsent, draftId: body.draftId }, typeof body.browserToken === 'string' ? body.browserToken : undefined));
      case 'verify': await verifyLineSignup(String(body.draftId || ''), String(body.browserToken || ''), String(body.code || '')); break;
      case 'verified': return Response.json(await verifiedLineSignup(String(body.draftId || ''), typeof body.browserToken === 'string' ? body.browserToken : undefined));
      case 'backup': return Response.json(await dumpDatabase());
    }
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Failed' }, { status: 400 }); }
} };

export default worker;
