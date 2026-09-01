import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { getMemberProfile } from '@/db/data';

/**
 * ほかの会員のプロフィール。**会員だけが見られる。**
 * メールアドレスは返さない（db/data.ts の getMemberProfile を見よ）。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await params;
  const profile = await getMemberProfile(id);
  if (!profile) return NextResponse.json({ error: 'この会員は見つかりませんでした。' }, { status: 404 });
  return NextResponse.json(profile);
}
