import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://give-hub-shusei.shaw-futamata.chatgpt.site'),
  title: 'GIVE HUB｜こんな人、探しています。',
  description: '守成クラブの仲間同士で、案件・協業先・相談相手を探し、信頼ある紹介を生み出す会員向け掲示板。',
  manifest: '/manifest.webmanifest',
  applicationName: 'GIVE HUB',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'GIVE HUB' },
  icons: { icon: '/favicon.svg', apple: '/apple-touch-icon.png' },
  openGraph: {
    title: 'GIVE HUB｜こんな人、探しています。',
    description: '案件・協業先・相談相手を探し、仲間のつながりから信頼ある紹介を届ける会員向け掲示板。',
    type: 'website',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'GIVE HUB こんな人、探しています。' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GIVE HUB｜こんな人、探しています。',
    description: '仲間のつながりから信頼ある紹介を届ける会員向け掲示板。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
