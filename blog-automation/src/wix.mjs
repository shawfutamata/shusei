/**
 * Wixブログへの投稿。
 *
 * Wixの管理画面をブラウザ操作するのではなくREST APIを使う。画面操作は
 * ログイン情報を預けることになるうえ、Wixのエディタは頻繁にUIが変わるため
 * 無人運用では毎週壊れる。APIキーはWixの管理画面から発行できる。
 *
 * 注意: このモジュールはWix側の実アカウントでの疎通確認がまだ済んでいない。
 * 初回だけ手元で1本流して、レスポンスを見て調整すること。
 */

const BASE = 'https://www.wixapis.com';

function headers({ apiKey, siteId, accountId }) {
  const h = { authorization: apiKey, 'content-type': 'application/json', 'wix-site-id': siteId };
  if (accountId) h['wix-account-id'] = accountId;
  return h;
}

async function wixFetch(url, options, label) {
  const res = await fetch(url, options);
  if (!res.ok) {
    throw new Error(`${label}に失敗しました (${res.status}): ${await res.text()}`);
  }
  return res.json();
}

let nodeSeq = 0;
const nextId = () => `n${++nodeSeq}`;

/** **太字** と [文言](url) だけを解釈する簡易インライン解析 */
function inlineNodes(text) {
  const nodes = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let cursor = 0;
  let m;

  const pushText = (value, decorations) => {
    if (value) nodes.push({ type: 'TEXT', id: '', nodes: [], textData: { text: value, decorations } });
  };

  while ((m = pattern.exec(text)) !== null) {
    pushText(text.slice(cursor, m.index), []);
    if (m[1]) {
      pushText(m[1], [{ type: 'BOLD', fontWeightValue: 700 }]);
    } else {
      pushText(m[2], [{ type: 'LINK', linkData: { link: { url: m[3], target: 'BLANK' } } }]);
    }
    cursor = m.index + m[0].length;
  }
  pushText(text.slice(cursor), []);

  return nodes.length ? nodes : [{ type: 'TEXT', id: '', nodes: [], textData: { text: '', decorations: [] } }];
}

const paragraph = (text) => ({ type: 'PARAGRAPH', id: nextId(), nodes: inlineNodes(text), paragraphData: {} });

/**
 * MarkdownをWixのリッチコンテンツ（Ricos）に変換する。
 * 見出し・段落・箇条書き・番号付きリストのみを扱う。表や引用は使わない前提。
 */
export function markdownToRicos(markdown, image) {
  nodeSeq = 0;
  const nodes = [];

  if (image?.wixMediaId) {
    nodes.push({
      type: 'IMAGE',
      id: nextId(),
      nodes: [],
      imageData: {
        containerData: { width: { size: 'CONTENT' }, alignment: 'CENTER' },
        image: { src: { id: image.wixMediaId } },
        altText: image.altText ?? '',
      },
    });
  }

  const lines = markdown.split(/\r?\n/);
  let list = null;

  const flushList = () => {
    if (list) nodes.push(list);
    list = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd();

    if (!line.trim()) {
      flushList();
      continue;
    }

    const heading = line.match(/^(#{2,4})\s+(.*)$/);
    if (heading) {
      flushList();
      nodes.push({
        type: 'HEADING',
        id: nextId(),
        nodes: inlineNodes(heading[2]),
        headingData: { level: heading[1].length },
      });
      continue;
    }

    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet || ordered) {
      const wanted = bullet ? 'BULLETED_LIST' : 'ORDERED_LIST';
      if (!list || list.type !== wanted) {
        flushList();
        list = { type: wanted, id: nextId(), nodes: [] };
      }
      list.nodes.push({
        type: 'LIST_ITEM',
        id: nextId(),
        nodes: [paragraph((bullet ?? ordered)[1])],
      });
      continue;
    }

    flushList();
    nodes.push(paragraph(line));
  }

  flushList();
  return { nodes };
}

/** 画像をWixのメディアマネージャへ上げ、リッチコンテンツから参照できるIDを得る */
export async function uploadImage({ apiKey, siteId, accountId, buffer, mimeType, fileName }) {
  const { uploadUrl } = await wixFetch(
    `${BASE}/site-media/v1/files/generate-upload-url`,
    {
      method: 'POST',
      headers: headers({ apiKey, siteId, accountId }),
      body: JSON.stringify({ mimeType, fileName }),
    },
    'Wixへの画像アップロードURL取得',
  );

  const uploaded = await wixFetch(
    `${uploadUrl}?filename=${encodeURIComponent(fileName)}`,
    { method: 'PUT', headers: { 'content-type': mimeType }, body: buffer },
    'Wixへの画像アップロード',
  );

  return uploaded.file?.id ?? uploaded.file?.fileName ?? null;
}

/** 下書きを作る。publish=false のままなら公開されない */
export async function createDraftPost({ apiKey, siteId, accountId, memberId, title, richContent, seo }) {
  const draftPost = {
    title,
    richContent,
    memberId,
    seoData: seo
      ? {
          tags: [
            { type: 'title', children: seo.title },
            { type: 'meta', props: { name: 'description', content: seo.description } },
          ],
        }
      : undefined,
  };

  const created = await wixFetch(
    `${BASE}/blog/v3/draft-posts`,
    { method: 'POST', headers: headers({ apiKey, siteId, accountId }), body: JSON.stringify({ draftPost }) },
    'Wixブログ下書きの作成',
  );

  return created.draftPost;
}

/** 下書きを公開する */
export async function publishDraftPost({ apiKey, siteId, accountId, draftPostId }) {
  return wixFetch(
    `${BASE}/blog/v3/draft-posts/${draftPostId}/publish`,
    { method: 'POST', headers: headers({ apiKey, siteId, accountId }), body: '{}' },
    'Wixブログ記事の公開',
  );
}
