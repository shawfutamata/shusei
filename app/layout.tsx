import type { Metadata } from 'next';
import './globals.css';
import { serviceName, serviceTagline, serviceUrl } from './brand';

export const metadata: Metadata = {
  metadataBase: new URL(serviceUrl),
  title: `${serviceName}｜${serviceTagline}`,
  description: '会員同士で、案件・協業先・相談相手を探し、信頼あるオファーを生み出す会員向け掲示板。',
  manifest: '/manifest.webmanifest',
  applicationName: serviceName,
  appleWebApp: { capable: true, statusBarStyle: 'default', title: serviceName },
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
  openGraph: {
    title: `${serviceName}｜${serviceTagline}`,
    description: '案件・協業先・相談相手を探し、仲間のつながりから信頼あるオファーを届ける会員向け掲示板。',
    type: 'website',
    // **ファイル名を変えて差し替える。** LINEやSNSは中身ではなくURLで
    // 覚えているので、同じ名前のまま画像だけ入れ替えても、古いものが
    // 出続ける。1200x630 は各社が想定している比率。
    images: [{ url: '/og-tasuki.png', width: 1200, height: 630, alt: `${serviceName} ${serviceTagline}` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${serviceName}｜${serviceTagline}`,
    description: '仲間のつながりから信頼あるオファーを届ける会員向け掲示板。',
    images: ['/og-tasuki.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
