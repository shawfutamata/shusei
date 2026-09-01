import type { NextConfig } from 'next';

/**
 * どのページにも付ける守りのヘッダ。
 *
 * 会員の名簿とやり取りを預かっているので、**ブラウザ側でできる守りは全部
 * 立てておく**。ここは1か所で効くので、あとから足したページにも自動で付く。
 *
 * 外から読み込むものは1つも無い（文字も画像も自分で配っている）ので、
 * `default-src 'self'` まで締められる。ゆるいのは2つだけ。
 *   - `'unsafe-inline'` … ReactとNextが、画面を組み立てる材料を
 *     ページの中に直接書き込む。これを止めると画面が出ない。
 *   - `blob:` `data:` … 顔写真を切り抜くときと、動画を選んだときに、
 *     ブラウザの中だけで作った一時的なURLを使う。
 */
const securityHeaders = [
  // HTTPSでしか来させない。1年間、この決まりを覚えてもらう。
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // 中身の種類を勝手に推し量らせない。画像のふりをしたスクリプト対策。
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // よその画面に埋め込ませない（見えない枠に重ねて押させる手口を塞ぐ）。
  { key: 'X-Frame-Options', value: 'DENY' },
  // どこから来たかを、よそへ細かく渡さない。
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // 使わない装置は、はじめから閉じておく。
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "media-src 'self' blob:",
      "font-src 'self'",
      "connect-src 'self'",
      // 決済とログインは、この画面から離れて相手のページへ行く形。
      "form-action 'self' https://checkout.stripe.com https://accounts.google.com",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "object-src 'none'",
    ].join('; '),
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
