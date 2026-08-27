import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { createBusinessCards, deleteBusinessCard, getBusinessCards, updateBusinessCard, type BusinessCardInput } from '@/db/data';

const MAX_CARDS = 20;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;
const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
  return NextResponse.json({ cards: await getBusinessCards(user) });
}

export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
  try {
    const body = await request.formData();
    const rawCards = body.get('cards');
    if (typeof rawCards !== 'string') throw new Error('読み取り結果を確認してください。');
    const parsed = JSON.parse(rawCards) as unknown;
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_CARDS) throw new Error('名刺は1回につき1〜20枚まで保存できます。');
    const inputs = await Promise.all(parsed.map(async (raw, index) => {
      const image = body.get(`image_${index}`);
      if (!(image instanceof File) || image.size === 0) throw new Error(`${index + 1}枚目の名刺画像がありません。`);
      if (image.size > MAX_IMAGE_SIZE) throw new Error('名刺画像は1枚10MB以下にしてください。');
      if (!allowedTypes.includes(image.type)) throw new Error('名刺画像はJPEG・PNG・WebPに対応しています。');
      const bytes = await image.arrayBuffer();
      if (!isSupportedImage(bytes, image.type)) throw new Error('名刺画像のファイル形式を確認してください。');
      return { card: cleanCard(raw), image: { bytes, contentType: image.type } };
    }));
    const saved = await createBusinessCards(user, inputs);
    return NextResponse.json({ saved }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '名刺を保存できませんでした。' }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
  try {
    const raw = await request.json() as Record<string, unknown>;
    const id = clean(raw.id, 80);
    if (!id) throw new Error('対象の名刺を確認してください。');
    await updateBusinessCard(user, { id, ...cleanCard(raw) });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '名刺を更新できませんでした。' }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = clean(body.id, 80);
    if (!id) throw new Error('対象の名刺を確認してください。');
    await deleteBusinessCard(user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '名刺を削除できませんでした。' }, { status: 400 });
  }
}

function cleanCard(value: unknown): BusinessCardInput {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const exchangeDate = clean(row.exchangeDate, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(exchangeDate)) throw new Error('名刺の交換日を確認してください。');
  return {
    name: clean(row.name, 80), company: clean(row.company, 100), positionTitle: clean(row.positionTitle, 80),
    department: clean(row.department, 80), phone: clean(row.phone, 40), mobile: clean(row.mobile, 40),
    email: clean(row.email, 120), postalCode: clean(row.postalCode, 20), address: clean(row.address, 180),
    website: clean(row.website, 180), memo: clean(row.memo, 500), groupName: clean(row.groupName, 60),
    exchangeDate, isFavorite: row.isFavorite === true,
  };
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
