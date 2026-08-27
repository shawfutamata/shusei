import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GIVE HUB｜守成クラブ紹介掲示板',
    short_name: 'GIVE HUB',
    description: '守成クラブの仲間同士で、探しごとと信頼できる紹介をつなぐ会員向けアプリ。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f8fc',
    theme_color: '#2563eb',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ],
  };
}
