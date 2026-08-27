import { NextResponse } from 'next/server';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { updateMemberProfile } from '@/db/data';

const allowedBands = ['', 'revenue_10_30', 'revenue_30_70', 'revenue_70_100', 'revenue_100_plus'];

export async function PATCH(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return NextResponse.json({ error: 'ログインが必要です。' }, { status: 401 });
  const body = await request.formData();
  const company = clean(body.get('company'), 80);
  const venue = clean(body.get('venue'), 60);
  const positionTitle = clean(body.get('positionTitle'), 60);
  const badge = clean(body.get('badge'), 40);
  const businessArea = clean(body.get('businessArea'), 60);
  const annualRevenueBand = clean(body.get('annualRevenueBand'), 30);
  const avatar = body.get('avatar');
  if (!company || !venue) {
    return NextResponse.json({ error: '会社名と所属会場を入力してください。' }, { status: 400 });
  }
  if (!allowedBands.includes(annualRevenueBand)) {
    return NextResponse.json({ error: '年商の選択内容を確認してください。' }, { status: 400 });
  }
  let avatarUpload: { bytes: ArrayBuffer; contentType: string } | undefined;
  if (avatar instanceof File && avatar.size > 0) {
    if (avatar.size > 5 * 1024 * 1024) return NextResponse.json({ error: '顔写真は5MB以下にしてください。' }, { status: 400 });
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(avatar.type)) return NextResponse.json({ error: '顔写真はJPEG・PNG・WebPに対応しています。' }, { status: 400 });
    const bytes = await avatar.arrayBuffer();
    if (!isSupportedImage(bytes, avatar.type)) return NextResponse.json({ error: '画像ファイルを確認してください。' }, { status: 400 });
    avatarUpload = { bytes, contentType: avatar.type };
  }
  try {
    const avatarUrl = await updateMemberProfile(user, { company, venue, positionTitle, badge, businessArea, annualRevenueBand, avatar: avatarUpload });
    return NextResponse.json({ company, venue, positionTitle, badge, businessArea, annualRevenueBand, avatarUrl });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'プロフィールを保存できませんでした。' }, { status: 400 });
  }
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function isSupportedImage(buffer: ArrayBuffer, contentType: string) {
  const bytes = new Uint8Array(buffer);
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}
