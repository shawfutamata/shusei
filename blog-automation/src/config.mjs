import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadConfig() {
  return JSON.parse(readFileSync(join(ROOT, 'config.json'), 'utf8'));
}

/**
 * 実行に必要な資格情報を環境変数から読む。値そのものはログに出さない。
 */
export function loadSecrets() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  return {
    googleServiceAccount: raw ? JSON.parse(raw) : null,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? null,
    openaiApiKey: process.env.OPENAI_API_KEY ?? null,
    wix: {
      apiKey: process.env.WIX_API_KEY ?? null,
      siteId: process.env.WIX_SITE_ID ?? null,
      accountId: process.env.WIX_ACCOUNT_ID ?? null,
      memberId: process.env.WIX_MEMBER_ID ?? null,
    },
  };
}

/**
 * 足りていないものを、何をどうすれば埋まるか付きで列挙する
 */
export function missingSecrets(secrets, { needGsc = true, needImage = true, needWix = true } = {}) {
  const missing = [];
  if (needGsc && !secrets.googleServiceAccount) {
    missing.push('GOOGLE_SERVICE_ACCOUNT_JSON（Search Consoleの実績取得。Google Cloudでサービスアカウントを作り、そのメールをSearch Consoleのユーザーに追加する）');
  }
  if (!secrets.anthropicApiKey) {
    missing.push('ANTHROPIC_API_KEY（記事本文の生成。console.anthropic.com で発行）');
  }
  if (needImage && !secrets.openaiApiKey) {
    missing.push('OPENAI_API_KEY（アイキャッチ画像の生成。platform.openai.com で発行）');
  }
  if (needWix && (!secrets.wix.apiKey || !secrets.wix.siteId)) {
    missing.push('WIX_API_KEY と WIX_SITE_ID（Wixへの投稿。Wix管理画面のAPIキーマネージャーで発行）');
  }
  return missing;
}
