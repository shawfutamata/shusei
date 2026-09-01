declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    AVATARS: R2Bucket;
    VAPID_PUBLIC_KEY: string;
    VAPID_PRIVATE_KEY: string;
    VAPID_SUBJECT: string;
    AUTH_CODE_PEPPER: string;
    RESEND_API_KEY: string;
    AUTH_FROM_EMAIL: string;
    REVIEW_AUTH_EMAIL: string;
    REVIEW_AUTH_CODE: string;
    GOOGLE_CLIENT_ID: string;
    GOOGLE_CLIENT_SECRET: string;
    // Stripe。Web専用。アプリからは決済に触れない（App Store 3.1.1）。
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_PRICE_STANDARD: string;
    // 年払い。設定していなければ、画面に年払いの選択肢が出ない。
    STRIPE_PRICE_STANDARD_YEAR: string;
    // トップバナーの出稿枠（1回きりの支払い）。未設定なら出稿の申し込みが出ない。
    STRIPE_PRICE_AD_SLOT: string;
    // 運営のメールアドレス（カンマ区切り）。**これが唯一の情報源。**
    // 管理画面に入れる人であり、課金なしでスタンダード相当を使える人であり、
    // ランクが最上位で固定される人でもある（app/admin-emails.ts）。
    // **空なら誰も当てはまらない。** 設定を忘れたときに素通りさせないため。
    ADMIN_EMAILS: string;
  }
}

// Viteが差し込む値。`DEV` は本番ビルドで false のリテラルに置き換わるので、
// 手元専用の経路（/api/dev/signin など）はビルド時に丸ごと消える。
interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
