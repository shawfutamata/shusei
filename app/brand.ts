// サービス名は変更の可能性があるので、表示名はここ1箇所に置く。
// 名前を変えるときは、このファイルと mobile/src/constants/brand.ts だけを直す。
//
// 名前を変えても据え置くもの:
//   - iOSのbundle ID / Androidのpackage / EASのproject（付け替えると別アプリ扱いになる）
//   - Sitesの配信ドメイン（既存のremoteを維持する）
//   - localStorageのキー（変えると会員の閲覧履歴とお気に入りが消える）
//   - assets/givehub/ のファイル名（中身は同じ画像）
export const serviceName = 'TASUKI';

export const serviceTagline = 'こんな人、探しています。';

/**
 * 公開URL。OGPの画像URLや、アプリから開くリンクの土台になる。
 * Sitesの配信ドメイン（*.chatgpt.site）はそのまま残し、独自ドメインを上に載せている。
 * ここを変えたら、Stripeのwebhook宛先とGoogleのリダイレクトURIも登録し直すこと。
 */
export const serviceUrl = 'https://tasuki.club';
