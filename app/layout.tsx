import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://give-hub-shusei.shaw-futamata.chatgpt.site'),
  title: 'GIVE HUB｜紹介から商売が生まれる掲示板',
  description: '守成クラブの仲間同士で、案件・協業先・相談相手を探し、信頼ある紹介を生み出す会員向け掲示板。',
  openGraph: {
    title: 'GIVE HUB｜紹介から商売が生まれる。',
    description: '案件・協業先・相談相手を探し、仲間のつながりから信頼ある紹介を届ける会員向け掲示板。',
    type: 'website',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'GIVE HUB 紹介から、商売が生まれる。' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GIVE HUB｜紹介から商売が生まれる。',
    description: '仲間のつながりから信頼ある紹介を届ける会員向け掲示板。',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ja"><body>{children}</body></html>;
}
