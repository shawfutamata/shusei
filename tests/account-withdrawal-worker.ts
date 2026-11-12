import { deleteMobileAccount, ensureDatabase } from '../db/data';
import { env } from 'cloudflare:workers';
import { storeLineAuthorization, requestLineDeauthorization } from '../db/line-authorization';
import { removeLineAccount } from '../db/line-accounts';
const worker = { async fetch(request: Request) {
  try {
    await ensureDatabase();
    const { member, action } = await request.json() as { member?: string; action?: string };
    if (member && action === 'unlink') {
      const account = await env.DB.prepare('SELECT line_user_id AS subject FROM line_accounts WHERE member_id=?').bind(member).first<{ subject: string }>();
      if (!account) throw new Error('missing fixture LINE account');
      await storeLineAuthorization(member, account.subject, `fixture-access-${account.subject}`, 3600);
      if (await requestLineDeauthorization(member) !== 'accepted') throw new Error('deauthorization not accepted');
      await removeLineAccount(member);
    } else if (member) await deleteMobileAccount({ userId: member, email: `${member}@example.test`, displayName: member, fullName: member });
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 400 }); }
} };

export default worker;
