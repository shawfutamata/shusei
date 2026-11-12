import { env } from 'cloudflare:workers';
import { getAdmin } from '@/app/admin-auth';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff' };
const userIdPattern = /^U[0-9a-f]{32}$/;
const reply = (body: Record<string, unknown>, status = 200) => Response.json(body, { status, headers });

/** 保存済みの資格情報で公式Botだけを確認する。通知・token発行・設定保存はしない。 */
export async function GET() {
  try {
    // LINEの公開フラグとは独立だが、既存の運営認証を省略しない。
    if (!await getAdmin()) return reply({ ok: false, error: 'not_found' }, 404);
    const token = env.LINE_MESSAGING_CHANNEL_TOKEN || '';
    const officialId = env.LINE_OFFICIAL_ACCOUNT_ID || '';
    const configuredBotId = env.LINE_BOT_USER_ID || '';
    if (!/^[A-Za-z0-9._~+/-]+=*$/.test(token) || token.length > 16384
      || !/^@[A-Za-z0-9._-]{1,100}$/.test(officialId)
      || (configuredBotId && !userIdPattern.test(configuredBotId))) {
      return reply({ ok: false, error: 'configuration_incomplete' }, 503);
    }
    const response = await fetch('https://api.line.me/v2/bot/info', {
      method: 'GET', redirect: 'manual', cache: 'no-store',
      headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(5000),
    });
    if (response.status !== 200) return reply({ ok: false, error: 'line_unavailable' }, 502);
    // 外部本文は例外・ログ・エラー応答へ渡さず、読み取り量も小さく制限する。
    const reader = response.body?.getReader();
    if (!reader) return reply({ ok: false, error: 'invalid_line_response' }, 502);
    const chunks: Uint8Array[] = []; let size = 0;
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32768) { await reader.cancel(); return reply({ ok: false, error: 'invalid_line_response' }, 502); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const data: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!data || typeof data !== 'object' || Array.isArray(data)) return reply({ ok: false, error: 'invalid_line_response' }, 502);
    const bot = data as Record<string, unknown>;
    if (typeof bot.userId !== 'string' || !userIdPattern.test(bot.userId) || bot.basicId !== officialId) {
      return reply({ ok: false, error: 'bot_identity_mismatch' }, 502);
    }
    const botIdMatches = configuredBotId ? configuredBotId === bot.userId : null;
    const result = { botUserId: bot.userId, basicId: officialId, botIdMatches };
    if (botIdMatches === false) return reply({ ok: false, error: 'configured_bot_id_mismatch', ...result }, 409);
    return reply({ ok: true, ...result });
  } catch {
    return reply({ ok: false, error: 'connection_check_failed' }, 503);
  }
}
