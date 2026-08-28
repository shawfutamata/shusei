import { facebookLabel } from './social-links';

/** プロフィールに登録されたFacebookへの導線。未設定なら何も出さない。 */
export default function FacebookLink({ url, name }: { url: string; name: string }) {
  if (!url) return null;
  return <a className="facebook-link" href={url} target="_blank" rel="noopener noreferrer nofollow" onClick={(event) => event.stopPropagation()} aria-label={`${name}さんのFacebookを開く`}>
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path fill="currentColor" d="M22 12.06C22 6.5 17.52 2 12 2S2 6.5 2 12.06c0 5.02 3.66 9.18 8.44 9.94v-7.03H7.9v-2.91h2.54V9.85c0-2.52 1.5-3.91 3.77-3.91 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.78-1.63 1.57v1.89h2.78l-.45 2.91h-2.33V22c4.78-.76 8.44-4.92 8.44-9.94z" /></svg>
    <span>{facebookLabel(url)}</span>
  </a>;
}
