import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { deleteRequest, updateRequest, type RequestImageUpload } from '@/db/data';
import { toBudgetBand } from '@/app/budget-options';
import { isIndustry } from '@/app/industry-options';
import { descriptionLimit } from '@/app/rank-perks';

// 自分が出した案件を直す／消す。
//
// **持ち主かどうかは db/data.ts の中で見る**（UPDATE と DELETE の WHERE に
// author_id を入れてある）。画面でボタンを出し分けるだけでは、ここを直接
// 叩かれたときに他人の投稿を触られてしまう。

const MAX_THUMB_BYTES = 400 * 1024;
const MAX_FULL_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;

  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
  const form = multipart ? await request.formData() : null;
  const body = multipart ? {} as Record<string, unknown> : await request.json() as Record<string, unknown>;
  const field = (name: string) => multipart ? form?.get(name) : body[name];

  const category = clean(field('category'), 32);
  const title = clean(field('title'), 90);
  // 本文の上限はランクで変わる。ここは天井だけ当てて、切り詰めは db/data.ts。
  const description = clean(field('description'), descriptionLimit(5));
  const budgetLabel = clean(field('budgetLabel'), 60);
  const budgetBand = toBudgetBand(field('budgetBand'));
  const area = clean(field('area'), 60);
  const industryTags = multipart ? parseIndustries(field('industryTags'), 3) : cleanIndustries(field('industryTags'), 3);
  const deadline = clean(field('deadline'), 10);
  const status = clean(field('status'), 10) === 'closed' ? 'closed' : 'open';

  if (!['project', 'collaboration', 'consultation'].includes(category) || !title || !description
    || !budgetBand || !industryTags.length || !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
    return NextResponse.json({ error: '入力内容を確認してください。' }, { status: 400 });
  }

  // 写真は選び直したときだけ送られてくる。触らなければ今のものが残る。
  const images: RequestImageUpload[] = [];
  if (form) {
    const thumbs = form.getAll('imageThumb');
    const fulls = form.getAll('imageFull');
    for (let index = 0; index < thumbs.length; index += 1) {
      const thumb = thumbs[index];
      const full = fulls[index];
      if (!(thumb instanceof File) || !(full instanceof File) || thumb.size === 0 || full.size === 0) continue;
      const checked = await readImagePair(thumb, full);
      if ('error' in checked) return NextResponse.json({ error: checked.error }, { status: 400 });
      images.push(checked.image);
    }
  }

  try {
    await updateRequest(gate.user, id, { category, title, description, budgetLabel, budgetBand, area, industryTags, deadline, status, images });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '保存できませんでした。' }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const { id } = await context.params;
  try {
    await deleteRequest(gate.user, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '削除できませんでした。' }, { status: 400 });
  }
}

async function readImagePair(thumb: File, full: File): Promise<{ image: RequestImageUpload } | { error: string }> {
  if (!IMAGE_TYPES.includes(thumb.type) || !IMAGE_TYPES.includes(full.type)) {
    return { error: '写真はJPEG・PNG・WebPに対応しています。' };
  }
  if (thumb.size > MAX_THUMB_BYTES || full.size > MAX_FULL_BYTES) {
    return { error: '写真のサイズが大きすぎます。もう一度お試しください。' };
  }
  return {
    image: {
      thumb: { bytes: await thumb.arrayBuffer(), contentType: thumb.type },
      full: { bytes: await full.arrayBuffer(), contentType: full.type },
    },
  };
}

function parseIndustries(value: unknown, max: number) {
  if (typeof value !== 'string') return [];
  try {
    return cleanIndustries(JSON.parse(value), max);
  } catch {
    return [];
  }
}

function cleanIndustries(value: unknown, max: number) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === 'string' && isIndustry(item)))].slice(0, max);
}

function clean(value: unknown, max: number) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
