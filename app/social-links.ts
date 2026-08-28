// Facebookのプロフィールリンクだけを受け付ける。
// 会員が自由にURLを貼れる場所なので、他所へ飛ばすリンクや javascript: を通さない。
const allowedHosts = new Set([
  'facebook.com', 'www.facebook.com', 'm.facebook.com', 'web.facebook.com',
  'fb.com', 'www.fb.com', 'fb.me',
]);

/**
 * 入力を検査して、保存してよい形に整える。
 * 受け付けないものは空文字を返す（＝未設定として扱う）。
 */
export function cleanFacebookUrl(raw: unknown) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  // 「facebook.com/xxx」のようにスキーマ無しで入れる人が多いので補う。
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return '';
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
  if (!allowedHosts.has(url.hostname.toLowerCase())) return '';
  url.protocol = 'https:';
  url.hash = '';
  const path = url.pathname.replace(/\/+$/, '');
  if (!path || path === '/') return '';
  return `${url.origin}${path}${url.search}`.slice(0, 200);
}

/** 画面に出す短い表示名。https://www.facebook.com/ を落とす。 */
export function facebookLabel(url: string) {
  return url.replace(/^https:\/\/(www\.|m\.|web\.)?/, '').replace(/^facebook\.com\//, '');
}
