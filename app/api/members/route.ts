import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { searchMembers } from '@/db/data';

// 会員を探す。**会員だけが見られる**（requireActiveMember を必ず通す）。
// 連絡先は返さない。誰に声をかけるか決めるのに要るぶんだけ返す。
export async function GET(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const url = new URL(request.url);
  const members = await searchMembers(gate.user.userId, {
    keyword: url.searchParams.get('q') ?? '',
    industry: url.searchParams.get('industry') ?? '',
    prefecture: url.searchParams.get('prefecture') ?? '',
  });
  return NextResponse.json({ members });
}
