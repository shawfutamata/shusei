import { env } from 'cloudflare:workers';
import { ensureDatabase } from './data';

/**
 * データベースの控えを取る。
 *
 * **消えたら取り返しがつかないものが入っている。** 会員の名簿、案件、
 * オファーのやり取り、お支払いの記録。誤操作でも、事故でも、一度消えたら
 * 元には戻らない。だから毎日、丸ごと写しを取って別の場所（R2）に置く。
 *
 * 守りは3枚重ねにしてある。
 *   1. D1のTime Travel … 直近30日なら、どの時点にも戻せる（Cloudflareの機能。
 *      設定はいらない。戻し方は docs/backup-ja.md）。
 *   2. ここ … 毎日R2へ書き出す。表ごと消してしまったときは、こちらから戻す。
 *   3. 手元へのダウンロード … 管理画面から取れる。**Cloudflareのアカウント
 *      そのものを失う事故に備えるには、これしかない。** 月に一度でも、
 *      手元かクラウドの別の場所に置いておくと安心。
 */

/** R2の中の置き場。会員の写真と同じ入れ物だが、**外から読める道は無い**。 */
const PREFIX = 'backups/';
/** 毎日ぶんを残す日数。これより古い日ぶんは、月初だけ残して消す。 */
const KEEP_DAILY_DAYS = 30;
/** 月初ぶんを残す月数。 */
const KEEP_MONTHLY_MONTHS = 12;

/**
 * 控えに入れない表。
 *
 * **ログインの鍵は写さない。** mobile_sessions はいま入っている人の合鍵そのもので、
 * 控えを1つ手に入れた人が全員になりすませてしまう。mobile_auth_codes も同じ筋。
 * どちらも短い命のもので、戻したところで値打ちが無い（事故のあとは入り直せばよい）。
 */
const SKIP_TABLES = ['mobile_sessions', 'mobile_auth_codes'];

export type BackupEntry = { key: string; date: string; size: number; uploadedAt: string };
export type BackupResult = { key: string; tables: number; rows: number; bytes: number; removed: string[] };

/**
 * 中身を全部読んで、1つのJSONにする。
 *
 * 写真や動画はR2にあり、ここには入らない（入っているのは文字だけ）ので、
 * 会員数がそれなりに増えても収まる大きさで済む。
 */
export async function dumpDatabase() {
  await ensureDatabase();
  // D1が自分で使う表は写さない。戻すときに邪魔になる。
  const tables = (await env.DB.prepare(`SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name NOT LIKE 'd1_%'
    ORDER BY name`).all<{ name: string }>()).results
    .map((row) => row.name)
    .filter((name) => !SKIP_TABLES.includes(name));

  const data: Record<string, unknown[]> = {};
  let rows = 0;
  for (const table of tables) {
    // 表の名前はsqlite_masterから来たもので、外から入る値ではない。
    // それでも二重引用符でくくって、名前の解釈で崩れないようにしておく。
    const result = await env.DB.prepare(`SELECT * FROM "${table.replace(/"/g, '""')}"`).all();
    data[table] = result.results;
    rows += result.results.length;
  }
  const body = JSON.stringify({
    format: 'tasuki-backup',
    version: 1,
    createdAt: new Date().toISOString(),
    tables,
    data,
  });
  return { body, tables: tables.length, rows };
}

/** 書き出してR2へ置き、古い分を片づける。 */
export async function runBackup(now = new Date()): Promise<BackupResult> {
  const { body, tables, rows } = await dumpDatabase();
  const key = `${PREFIX}${now.toISOString().slice(0, 10)}.json`;
  await env.AVATARS.put(key, body, {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
    customMetadata: { tables: String(tables), rows: String(rows) },
  });
  const removed = await pruneBackups(now);
  return { key, tables, rows, bytes: new TextEncoder().encode(body).length, removed };
}

/** 置いてある控えの一覧。新しい順。 */
export async function listBackups(): Promise<BackupEntry[]> {
  const listed = await env.AVATARS.list({ prefix: PREFIX, limit: 400 });
  return listed.objects
    .map((object) => ({
      key: object.key,
      date: object.key.slice(PREFIX.length).replace(/\.json$/, ''),
      size: object.size,
      uploadedAt: object.uploaded.toISOString(),
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** 1つ取り出す。管理画面からのダウンロードに使う。 */
export function getBackup(date: string) {
  // 日付以外は受け取らない。**R2の中のほかの物（会員の写真）を読ませない。**
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Promise.resolve(null);
  return env.AVATARS.get(`${PREFIX}${date}.json`);
}

/**
 * 古い控えを片づける。
 *
 * 直近30日は毎日ぶんを残し、それより古いものは**月初の1本だけ**残す。
 * 全部残すと際限なく増え、全部消すと「気づかないまま壊れていた」ときに
 * 戻れる時点が無くなる。
 */
async function pruneBackups(now: Date) {
  const dailyFrom = new Date(now.getTime() - KEEP_DAILY_DAYS * 86400000).toISOString().slice(0, 10);
  const monthlyFrom = new Date(now.getTime() - KEEP_MONTHLY_MONTHS * 31 * 86400000).toISOString().slice(0, 10);
  const removed: string[] = [];
  for (const entry of await listBackups()) {
    if (entry.date >= dailyFrom) continue;
    if (entry.date >= monthlyFrom && entry.date.endsWith('-01')) continue;
    await env.AVATARS.delete(entry.key);
    removed.push(entry.date);
  }
  return removed;
}

/**
 * 定期実行の合図が本物か。
 *
 * 管理画面から押すぶんにはログインで足りるが、毎日の自動実行にはブラウザが
 * 無い。そのための合言葉（BACKUP_TOKEN）。**設定していなければ、この道は
 * 開かない**（空文字と突き合わせて通ってしまわないように）。
 *
 * 突き合わせは長さの差で早く抜けない書き方にしてある。1文字ずつ違いを
 * 足し合わせるので、当たっている文字数が時間から読み取れない。
 */
export function isBackupToken(value: string) {
  const secret = String(env.BACKUP_TOKEN || '');
  if (!secret || !value || value.length !== secret.length) return false;
  let diff = 0;
  for (let index = 0; index < secret.length; index += 1) {
    diff |= secret.charCodeAt(index) ^ value.charCodeAt(index);
  }
  return diff === 0;
}
