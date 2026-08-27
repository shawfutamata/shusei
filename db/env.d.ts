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
  }
}
