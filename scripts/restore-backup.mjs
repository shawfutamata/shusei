#!/usr/bin/env node
/**
 * 控え（JSON）から、戻すためのSQLを作る。
 *
 * **このスクリプトは何も書き換えない。** 作るのはSQLのファイルだけで、
 * それを本番へ流すかどうかは人が決める。戻す作業は取り返しがつかないので、
 * 「中身を目で見てから流す」という一段を必ず挟む。
 *
 *   node scripts/restore-backup.mjs tasuki-2026-09-01.json > restore.sql
 *   # 中身を確かめてから
 *   npx wrangler d1 execute tasuki --remote --file=restore.sql
 *
 * 表ごとに DELETE してから入れ直す形にしてある（丸ごと差し替え）。
 * 一部だけ戻したいときは、出来上がったSQLから要る表の行だけ抜き出す。
 */
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('使い方: node scripts/restore-backup.mjs <控えのJSON> > restore.sql');
  process.exit(1);
}

const dump = JSON.parse(readFileSync(path, 'utf8'));
if (dump.format !== 'tasuki-backup') {
  console.error('これは TASUKI の控えではないようです（format が違います）。');
  process.exit(1);
}

/** SQLに埋める値。**文字列は必ずくくって、中の引用符を二重にする。** */
function literal(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

const out = [];
out.push(`-- ${path} から作りました（控えを取った時刻: ${dump.createdAt}）`);
out.push('-- 流す前に、いまのデータの控えをもう1本取っておいてください。');
out.push('PRAGMA defer_foreign_keys = true;');

for (const table of dump.tables) {
  const rows = dump.data[table] ?? [];
  out.push('');
  out.push(`-- ${table}（${rows.length}件）`);
  out.push(`DELETE FROM "${table}";`);
  for (const row of rows) {
    const columns = Object.keys(row);
    if (!columns.length) continue;
    out.push(`INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(', ')}) VALUES (${columns.map((c) => literal(row[c])).join(', ')});`);
  }
}

process.stdout.write(out.join('\n') + '\n');
