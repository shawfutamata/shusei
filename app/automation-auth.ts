import { env } from 'cloudflare:workers';

/**
 * 定期実行の合図が本物か。**バックアップと、日次の集計メールなど、
 * 「ブラウザの無い自動実行」全般で使う共通の合言葉。**
 *
 * 管理画面から押すぶんにはログインで足りるが、GitHub Actionsなどブラウザの
 * 無い自動実行にはそれが無い。そのための合言葉（BACKUP_TOKEN）。
 * 名前はバックアップ用のまま据え置いてある。用途が増えるたびに秘密を
 * 増やすと、管理者が `wrangler secret put` を何度もやることになるため。
 *
 * **設定していなければ、この道は開かない**（空文字と突き合わせて通って
 * しまわないように）。突き合わせは長さの差で早く抜けない書き方にしてある。
 * 1文字ずつ違いを足し合わせるので、当たっている文字数が時間から読み取れない。
 */
export function isAutomationToken(value: string) {
  const secret = String(env.BACKUP_TOKEN || '');
  if (!secret || !value || value.length !== secret.length) return false;
  let diff = 0;
  for (let index = 0; index < secret.length; index += 1) {
    diff |= secret.charCodeAt(index) ^ value.charCodeAt(index);
  }
  return diff === 0;
}
