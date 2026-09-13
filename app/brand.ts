// サービス名は変更の可能性があるので、表示名はここ1箇所に置く。
// 名前を変えるときは、このファイルと mobile/src/constants/brand.ts だけを直す。
//
// 名前を変えても据え置くもの:
//   - iOSのbundle ID / Androidのpackage / EASのproject（付け替えると別アプリ扱いになる）
//   - Workersのサービス名（wrangler.jsonc の name。変えるとURLと既存の結線が変わる）
//   - localStorageのキー（変えると会員の閲覧履歴とお気に入りが消える）
//   - assets/givehub/ のファイル名（中身は同じ画像）
export const serviceName = 'TASUKI';

export const serviceTagline = 'こんな人、探しています。';

/**
 * 公開URL。OGPの画像URLや、アプリから開くリンクの土台になる。
 * Cloudflare Workers の既定URL（*.workers.dev）はそのまま残り、独自ドメインを上に載せる。
 * ここを変えたら、Stripeのwebhook宛先とGoogleのリダイレクトURIも登録し直すこと。
 */
export const serviceUrl = 'https://tasuki.club';

/**
 * 会員番号の見せ方。`members.member_no`（ただの連番）に頭を付けて、
 * 名簿や請求書で「TSK-0007番の方」と言えるようにする。
 *
 * **番号そのものは変えない。** サービス名を変えるときは、ここの頭だけ直す。
 * 4桁でゼロ詰めしてあるのは、名簿に並べたときに桁が揃うようにするため。
 * 1万人を超えたら5桁になるだけで、番号は振り直さない。
 */
export const memberNoPrefix = 'TSK';

export function memberNoLabel(memberNo: number) {
  return memberNo > 0 ? `${memberNoPrefix}-${String(memberNo).padStart(4, '0')}` : '';
}
