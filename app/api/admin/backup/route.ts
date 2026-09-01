import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getAdmin } from '@/app/admin-auth';
import { dumpDatabase, getBackup, isBackupToken, listBackups, runBackup } from '@/db/backup';

/**
 * データの控え。
 *
 * 入れるのは2通りだけ。**管理者としてログインしているか、合言葉を持っているか。**
 * 合言葉は毎日の自動実行（GitHub Actions）のためのもので、ブラウザが無くても
 * 起こせるようにするため。どちらでもなければ、この道があること自体を伏せる
 * （401ではなく404を返す）。
 */
async function allowed() {
  if (await getAdmin()) return true;
  const authorization = (await headers()).get('authorization') ?? '';
  return authorization.startsWith('Bearer ') && isBackupToken(authorization.slice(7).trim());
}

/**
 * GET … 一覧を見る（`?list=1`）／その日の控えを落とす（`?date=2026-09-01`）／
 * いまの中身をそのまま落とす（引数なし）。
 */
export async function GET(request: Request) {
  if (!await allowed()) return new Response('Not found', { status: 404 });
  const url = new URL(request.url);

  if (url.searchParams.get('list')) {
    return NextResponse.json({ backups: await listBackups() });
  }

  const date = url.searchParams.get('date') ?? '';
  if (date) {
    const object = await getBackup(date);
    if (!object) return NextResponse.json({ error: 'この日の控えはありません。' }, { status: 404 });
    return new Response(object.body, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'content-disposition': `attachment; filename="tasuki-${date}.json"`,
        'cache-control': 'no-store',
      },
    });
  }

  // 引数なしは「いまこの瞬間の中身」。R2には置かず、そのまま渡す。
  const { body } = await dumpDatabase();
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="tasuki-${new Date().toISOString().slice(0, 10)}.json"`,
      'cache-control': 'no-store',
    },
  });
}

/** POST … 控えを取ってR2へ置く。毎日の自動実行と、管理画面の「いますぐ取る」。 */
export async function POST() {
  if (!await allowed()) return new Response('Not found', { status: 404 });
  try {
    return NextResponse.json(await runBackup());
  } catch (error) {
    // **失敗は黙って飲み込まない。** 取れていないことに気づけないのがいちばん怖い。
    return NextResponse.json({ error: error instanceof Error ? error.message : 'バックアップに失敗しました。' }, { status: 500 });
  }
}
