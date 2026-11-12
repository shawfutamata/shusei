// 本体とは別にデプロイする。秘密値は両WorkerのLINE_NOTIFY_CRON_TOKENへ入れる。
// 公式LINEや本番会員へ送る機能は、本体のLINE_NOTIFICATIONS_ENABLEDが明示的にtrueのときだけ動く。
const worker = {
  async scheduled(_event: ScheduledController, env: Cloudflare.Env, context: ExecutionContext) {
    if (!env.TASUKI || !env.LINE_NOTIFY_CRON_TOKEN) throw new Error('LINE notification retry worker is not configured');
    context.waitUntil((async () => {
      const response = await env.TASUKI.fetch('https://tasuki.club/api/admin/line-notifications', {
        method: 'POST', headers: { authorization: `Bearer ${env.LINE_NOTIFY_CRON_TOKEN}` },
      });
      if (!response.ok) throw new Error(`LINE notification retry failed: ${response.status}`);
    })());
  },
};
export default worker;
