import { NextResponse } from 'next/server';
import { requireActiveMember } from '@/app/app-auth';
import { createRequest, getBoardData, type RequestImageUpload, type RequestVideoUpload } from '@/db/data';
import { toBudgetBand } from '@/app/budget-options';
// 動画の上限は、圧縮する側（app/compress-video.ts）と同じ値を使う。ずれると片側だけ通る。
import { VIDEO_MAX_BYTES } from '@/app/compress-video';
import { isIndustry } from '@/app/industry-options';
import { descriptionLimit } from '@/app/rank-perks';

// 画像は投稿する人の端末で縮小してから送る。ここでは受け取るだけで変換しない。
// 一覧用は長辺480px・詳細用は長辺1400pxを想定していて、この上限は
// 「万一そのまま送られてきたとき」の歯止め。
const MAX_THUMB_BYTES = 400 * 1024;
const MAX_FULL_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function GET() {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;
  return NextResponse.json(await getBoardData(user));
}

export async function POST(request: Request) {
  const gate = await requireActiveMember();
  if (gate.response) return gate.response;
  const user = gate.user;

  // 写真を付けるときだけ multipart。アプリからのJSONもそのまま受ける。
  const multipart = (request.headers.get('content-type') ?? '').includes('multipart/form-data');
  const form = multipart ? await request.formData() : null;
  const read = (name: string) => form ? form.get(name) : undefined;
  const body = multipart ? {} as Record<string, unknown> : await request.json() as Record<string, unknown>;
  const field = (name: string) => multipart ? read(name) : body[name];

  const category = clean(field('category'), 32);
  const title = clean(field('title'), 90);
  // 本文の上限はランクで変わる（app/rank-perks.ts）。ここでは天井だけ当てて、
  // 実際の切り詰めは db/data.ts がランクを見て行う。
  const description = clean(field('description'), descriptionLimit(5));
  const budgetLabel = clean(field('budgetLabel'), 60);
  const budgetBand = toBudgetBand(field('budgetBand'));
  const area = clean(field('area'), 60);
  const industryTags = multipart ? parseIndustries(field('industryTags'), 3) : cleanIndustries(field('industryTags'), 3);
  const deadline = clean(field('deadline'), 10);
  // **必須はカテゴリとタイトルだけ。**
  //
  // 以前は詳しい内容・業種・予算・期限もすべて必須にしていた。良い投稿の
  // 条件ではあるが、**投稿がある条件ではない。** 「こんな人いませんか」と
  // 言いたいだけの人に、まだ決まっていない予算と期限を決めさせていた。
  // 空の掲示板に良い投稿はゼロ件なので、まず出してもらう。
  //
  // 足りないところは下で埋める。**列は空にしない**（一覧の並べ替えや
  // 絞り込みが期限と予算を見ているため）。
  if (!['project', 'collaboration', 'consultation'].includes(category) || !title) {
    return NextResponse.json({ error: '探しているものと、タイトルを入力してください。' }, { status: 400 });
  }
  // 予算を決めていない人は「応相談」。期限を決めていない人は30日後。
  const filledBand = budgetBand || 'negotiable';
  const filledDeadline = /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : defaultDeadline();

  // 写真は複数枚。何枚まで受けるかは db/data.ts がランクを見て切り詰める。
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

  // 動画は1本まで。圧縮は端末側で済んでいる前提なので、ここでは大きさだけ見る。
  let video: RequestVideoUpload | null = null;
  const videoFile = form?.get('video');
  if (videoFile instanceof File && videoFile.size > 0) {
    if (videoFile.size > VIDEO_MAX_BYTES) {
      return NextResponse.json({ error: '動画が大きすぎます。短く切ってからお試しください。' }, { status: 400 });
    }
    if (!/^video\/(mp4|webm|quicktime)$/.test(videoFile.type)) {
      return NextResponse.json({ error: '動画はMP4かWebMでお願いします。' }, { status: 400 });
    }
    video = { bytes: await videoFile.arrayBuffer(), contentType: videoFile.type };
  }

  try {
    // reached … その業種を待っている会員の数。画面が「〇人に届きました」と返す。
    const { id, reached } = await createRequest(user, { category, title, description, budgetLabel, budgetBand: filledBand, area, industryTags, deadline: filledDeadline, images, video });
    return NextResponse.json({ id, reached }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : '投稿できませんでした。' }, { status: 400 });
  }
}

async function readImagePair(thumb: File, full: File): Promise<{ image: RequestImageUpload } | { error: string }> {
  if (!IMAGE_TYPES.includes(thumb.type) || !IMAGE_TYPES.includes(full.type)) {
    return { error: '写真はJPEG・PNG・WebPに対応しています。' };
  }
  if (thumb.size > MAX_THUMB_BYTES || full.size > MAX_FULL_BYTES) {
    return { error: '写真のサイズが大きすぎます。もう一度お試しください。' };
  }
  const [thumbBytes, fullBytes] = await Promise.all([thumb.arrayBuffer(), full.arrayBuffer()]);
  if (!isSupportedImage(thumbBytes, thumb.type) || !isSupportedImage(fullBytes, full.type)) {
    return { error: '画像ファイルを確認してください。' };
  }
  return {
    image: {
      thumb: { bytes: thumbBytes, contentType: thumb.type },
      full: { bytes: fullBytes, contentType: full.type },
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

function isSupportedImage(buffer: ArrayBuffer, contentType: string) {
  const bytes = new Uint8Array(buffer);
  if (contentType === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (contentType === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
}

/**
 * 期限を決めていない投稿の既定。**空にはしない。**
 * 一覧は期限で絞り込みと並べ替えをしていて、空だと「あと〇日」も出せない。
 * 30日にしてあるのは、短すぎると出してすぐ消え、長すぎると古い投稿が
 * 残り続けて掲示板が死んで見えるため。延長は投稿者がいつでもできる。
 */
function defaultDeadline() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 30);
  return date.toISOString().slice(0, 10);
}
