import { getAdmin } from '@/app/admin-auth';
import { adminAnalytics, adminMembers, adminRequests } from '@/db/admin';

// 名簿や一覧をCSVで書き出す。Excelやスプレッドシートで開いて、
// 声かけや案内の作業にそのまま使えるようにするため。
export async function GET(request: Request) {
  if (!await getAdmin()) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'members';

  let rows: (string | number)[][];
  let name: string;
  if (type === 'dormant') {
    const analytics = await adminAnalytics(Number(url.searchParams.get('days') ?? 90));
    name = '動いていない会員';
    rows = [['名前', '会社', '会場', 'メール', '最後の動き', '何日前'],
      ...analytics.dormant.map((row) => [row.displayName, row.company, row.venue, row.email, row.lastActive, row.daysSince])];
  } else if (type === 'requests') {
    const list = await adminRequests('', 1000);
    name = '探しごと';
    rows = [['見出し', '種類', '状況', '期限', '投稿者', 'メール', 'オファー', 'やり取り', '投稿日'],
      ...list.map((row) => [row.title, row.category, row.status, row.deadline, row.authorName, row.authorEmail,
        row.introCount, row.commentCount, row.createdAt.slice(0, 10)])];
  } else {
    const list = await adminMembers('', 1000);
    name = '会員';
    rows = [['名前', '会社', '会場', 'メール', '状態', 'プラン', 'オファー', '投稿', '登録日'],
      ...list.map((row) => [row.displayName, row.company, row.venue, row.email,
        row.canUse ? '利用中' : '停止中', row.plan, row.introCount, row.requestCount, row.createdAt.slice(0, 10)])];
  }

  // BOMを付ける。付けないとExcelがUTF-8と気づかず、日本語が化ける。
  const csv = `﻿${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`;
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(`TASUKI-${name}-${today}.csv`)}`,
      'cache-control': 'no-store',
    },
  });
}

/**
 * 1マスぶんを安全な形にする。
 *
 * `=` `+` `-` `@` で始まる文字列は、表計算ソフトが**式として実行する**。
 * 会員が書いた文字がそのまま入るので、頭に `'` を足して式にならないようにする。
 */
function cell(value: string | number) {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
