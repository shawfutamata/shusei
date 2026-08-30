import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { adminSetMemberActive } from '@/db/admin';

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
