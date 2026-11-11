/** 初回の文書ロードだけを対象にし、内部ページからのTOP復帰は案内しない。 */
export function entryPrompt(href: string, referrer: string, navigationType: string, documentHref: string): 'registered' | 'consult' | null {
  const url = new URL(href);
  const initial = new URL(documentHref);
  if (url.pathname !== '/' || initial.pathname !== '/' || navigationType === 'back_forward') return null;
  if (['tab', 'action', 'member', 'contact', 'ad', 'billing', 'meeting'].some(key => url.searchParams.has(key))) return null;
  if (url.searchParams.get('welcome') === 'registered' || ['invited', 'early'].includes(url.searchParams.get('login') ?? '')) return 'registered';
  if (navigationType !== 'reload' && referrer) {
    const previous = new URL(referrer);
    if (previous.origin === url.origin && !/^\/(login|register|api\/auth)(\/|$)/.test(previous.pathname)) return null;
  }
  return 'consult';
}
