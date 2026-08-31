import { env } from 'cloudflare:workers';

/**
 * 動作確認用の「マスターアカウント」。
 *
 * ここに載っているメールアドレスは、**ランクを最上位・プランをいちばん上**
 * として扱う。招待人数も支払いも要らない。運営が全部の機能をひと通り触って
 * 確かめるための口。
 *
 * 管理画面に入れるかどうか（`ADMIN_EMAILS` / app/admin-auth.ts）とは切り離して
 * ある。管理画面を見る人と、会員として全機能を使う人は別の話なので、片方を
 * 開けたらもう片方も開く、という作りにしない。
 *
 * 増やすときは Cloudflare の環境変数 `MASTER_EMAILS`（カンマ区切り）に足す。
 * 下の組み込みぶんと合わせて効く。組み込みで1つ持っているのは、環境変数を
 * 入れ忘れても確認用の口が必ず1つ残るようにするため。
 *
 * **画面を出し分けるだけでは足りない。** 実際の判定はサーバー側（db/data.ts）
 * で、プランとランクそのものを差し替える形にしてある。
 */
const builtInMasterEmails = ['swp0121swp@gmail.com'];

export function masterEmails() {
  const fromEnv = String(env.MASTER_EMAILS || '').split(',');
  return [...new Set([...builtInMasterEmails, ...fromEnv].map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

export function isMasterEmail(email: string) {
  return masterEmails().includes(String(email || '').trim().toLowerCase());
}
