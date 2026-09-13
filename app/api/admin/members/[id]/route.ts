import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminMemberDetail, adminSetMemberActive } from '@/db/admin';

// 会員1人ぶんの詳細。一覧の行を押したときに読む。
// **一覧には載せない。** 200人ぶんの投稿と広告まで毎回引くと、一覧が開かなくなる。
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await getAdmin()) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const { id } = await context.params;
  const detail = await adminMemberDetail(id);
  if (!detail) return NextResponse.json({ error: '見つかりませんでした。' }, { status: 404 });
  return NextResponse.json(detail);
}

// 会員の利用を止める／戻す。
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return NextResponse.json({ error: '権限がありません。' }, { status: 404 });
  const { id } = await context.params;
  // 自分を止めると、そのまま管理画面から締め出される。手前で止める。
  if (id === admin.userId) {
    return NextResponse.json({ error: 'ご自身の利用は止められません。' }, { status: 400 });
  }
  const { active } = await request.json() as { active?: boolean };
  await adminSetMemberActive(id, active === true);
  return NextResponse.json({ ok: true });
}
