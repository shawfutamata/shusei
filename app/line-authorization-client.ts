/** 認証だけを開始する。通知・解除の完了と取り違えず、遷移は呼出元の生存確認後に行う。 */
export async function requestLineAuthorization(input: { action: 'link' | 'preferences' | 'unlink_recovery'; message?: boolean; offer?: boolean }, controller: AbortController): Promise<string> {
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const fields = new URLSearchParams({ action: input.action, consent: 'yes' });
    if (input.message) fields.set('message', 'yes');
    if (input.offer) fields.set('offer', 'yes');
    const response = await fetch('/api/auth/line/start', { method: 'POST', credentials: 'same-origin', redirect: 'error', cache: 'no-store', signal: controller.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: fields.toString() });
    const result: unknown = await response.json();
    if (!response.ok || !result || typeof result !== 'object' || !('authorizeUrl' in result) || typeof result.authorizeUrl !== 'string') throw new Error('line_start_failed');
    const destination = new URL(result.authorizeUrl);
    if (destination.origin !== 'https://access.line.me' || destination.pathname !== '/oauth2/v2.1/authorize' || destination.username || destination.password || destination.hash) throw new Error('line_start_destination');
    if (controller.signal.aborted) throw new Error('line_start_aborted');
    return destination.href;
  } finally { clearTimeout(timeout); }
}
