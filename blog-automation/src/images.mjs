/**
 * アイキャッチ画像の生成（OpenAI Images API）。
 *
 * ChatGPTの画面を自動操作するのではなくAPIを使う。生成モデルは同系統だが、
 * APIは無人実行が許可された正規経路で、画面操作と違いbot検知で止まらない。
 */

const API_URL = 'https://api.openai.com/v1/images/generations';

/**
 * @returns {Promise<{ buffer: Buffer, mimeType: string }>}
 */
export async function generateImage({ apiKey, model, size, prompt }) {
  // 医療機器の広告画像なので、症状や治療効果を想起させる描写を明示的に禁止する
  const guarded = `${prompt}

Constraints: a calm, clean, photographic scene suitable for a Japanese medical-device company's blog header. No text, no letters, no logos. Do not depict medical treatment, pain, injury, hospitals, doctors, or before/after comparisons. No people in distress.`;

  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model, prompt: guarded, size, n: 1 }),
  });

  if (!res.ok) {
    throw new Error(`画像生成に失敗しました (${res.status}): ${await res.text()}`);
  }

  const data = await res.json();
  const item = data.data[0];

  if (item.b64_json) {
    return { buffer: Buffer.from(item.b64_json, 'base64'), mimeType: 'image/png' };
  }

  const download = await fetch(item.url);
  if (!download.ok) throw new Error(`生成画像の取得に失敗しました (${download.status})`);
  return { buffer: Buffer.from(await download.arrayBuffer()), mimeType: 'image/png' };
}
