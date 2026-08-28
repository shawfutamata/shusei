/**
 * Google Search Console からの実績取得。
 *
 * 認証はサービスアカウント方式。ユーザーのGoogleアカウントのパスワードや
 * 2段階認証を機械に預ける必要がないので、無人実行できるのはこの方法だけ。
 * 発行したサービスアカウントのメールアドレスを、Search Consoleの
 * 「設定 → ユーザーと権限」に「制限付き」で追加すれば読み取れる。
 */

import { createSign } from 'node:crypto';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * サービスアカウントJSONからアクセストークンを得る
 * @param {{client_email: string, private_key: string}} serviceAccount
 */
export async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: SCOPE,
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(serviceAccount.private_key, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!res.ok) {
    throw new Error(`Search Consoleの認証に失敗しました (${res.status}): ${await res.text()}`);
  }
  return (await res.json()).access_token;
}

/**
 * 検索パフォーマンスを取得する
 * @param {object} params
 * @param {string} params.accessToken
 * @param {string} params.siteUrl 例: "sc-domain:semon-inc.com" もしくは "https://www.semon-inc.com/"
 * @param {string} params.startDate YYYY-MM-DD
 * @param {string} params.endDate YYYY-MM-DD
 * @param {string[]} params.dimensions
 * @returns {Promise<Array<{keys: string[], clicks: number, impressions: number, ctr: number, position: number}>>}
 */
export async function querySearchAnalytics({ accessToken, siteUrl, startDate, endDate, dimensions = ['query'] }) {
  const rows = [];
  const pageSize = 5000;

  for (let startRow = 0; ; startRow += pageSize) {
    const res = await fetch(
      `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, dimensions, type: 'web', rowLimit: pageSize, startRow }),
      },
    );

    if (!res.ok) {
      throw new Error(`Search Consoleの取得に失敗しました (${res.status}): ${await res.text()}`);
    }

    const batch = (await res.json()).rows ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  return rows;
}

/** 今日からn日前のYYYY-MM-DD。GSCのデータは2〜3日遅れるので終端は3日前を既定にする */
export function daysAgo(n, from = new Date()) {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * Search Consoleの画面からダウンロードしたCSVを読む（APIを使わない運用向け）
 * 「上位のクエリ」CSVは `クエリ,クリック数,表示回数,CTR,掲載順位` の形。
 * @param {string} csv
 */
export function parseGscCsv(csv) {
  const lines = csv.trim().split(/\r?\n/);
  lines.shift();
  return lines
    .map((line) => {
      const cells = line.match(/("([^"]|"")*"|[^,]*)/g)?.filter((_, i) => i % 2 === 0) ?? [];
      const clean = cells.map((c) => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
      if (clean.length < 5 || !clean[0]) return null;
      return {
        keys: [clean[0]],
        clicks: Number(clean[1]) || 0,
        impressions: Number(clean[2]) || 0,
        ctr: Number(String(clean[3]).replace('%', '')) / 100 || 0,
        position: Number(clean[4]) || 0,
      };
    })
    .filter(Boolean);
}
