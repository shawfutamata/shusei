import { NextResponse } from 'next/server';
import { PAYWALL } from '@/db/data';

/**
 * 例外を、画面が扱える形の400にして返す。
 *
 * プラン不足のときだけ `paywall: true` を付ける。文言そのもので見分けると、
 * 言葉を直したとたんに案内が出なくなるため、印（PAYWALL）で判定している。
 * 印は画面に出す前に取り除く。
 */
export function errorResponse(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  if (message.startsWith(PAYWALL)) {
    return NextResponse.json({ error: message.slice(PAYWALL.length), paywall: true }, { status: 400 });
  }
  return NextResponse.json({ error: message }, { status: 400 });
}
