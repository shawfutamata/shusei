/** Only return to this site's paths after authentication. */
export function safeReturnPath(value: string | null) {
  const path = (value ?? '').trim();
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/\\')) return '';
  return path.slice(0, 200);
}

export function memberLoginPath(back: string, error = '') {
  const params = new URLSearchParams();
  const returnTo = safeReturnPath(back);
  if (returnTo && !returnTo.startsWith('/login/member')) params.set('return_to', returnTo);
  if (error) params.set('login', error);
  return `/login/member${params.size ? `?${params}` : ''}`;
}
