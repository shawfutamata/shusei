// 広告の入力を受け取るところ。申し込みと入れ替えの両方から使う。
// **Web専用**（app/api/ads/ からしか呼ばない）。
import { AD_DESCRIPTION_MAX, AD_TITLE_MAX } from './ad-options';
import type { AdContent } from '@/db/data';

const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
/** 端末側で縮小してから送る前提の上限。ここは念のための歯止め。 */
const maxImageBytes = 1_500_000;

export async function readAdContent(form: FormData): Promise<{ content: AdContent } | { error: string }> {
  const title = String(form.get('title') ?? '').trim();
  const description = String(form.get('description') ?? '').trim();
  const linkUrl = String(form.get('linkUrl') ?? '').trim();

  if (!title) return { error: 'タイトルを入れてください。' };
  if (title.length > AD_TITLE_MAX) return { error: `タイトルは${AD_TITLE_MAX}文字までです。` };
  if (description.length > AD_DESCRIPTION_MAX) return { error: `説明文は${AD_DESCRIPTION_MAX}文字までです。` };

  const file = form.get('image');
  let image: AdContent['image'];
  if (file instanceof File && file.size > 0) {
    if (!allowedTypes.has(file.type)) return { error: '画像はJPEG・PNG・WebPのいずれかにしてください。' };
    if (file.size > maxImageBytes) return { error: '画像が大きすぎます。もう一度選び直してください。' };
    image = { bytes: await file.arrayBuffer(), contentType: file.type };
  }
  return { content: { title, description, linkUrl, image } };
}
