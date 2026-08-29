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
    STRIPE_PRICE_PREMIUM: string;
  }
}
