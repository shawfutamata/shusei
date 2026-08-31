import type { MetadataRoute } from 'next';
import { serviceName } from './brand';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${serviceName}｜守成クラブ オファー掲示板`,
    short_name: serviceName,
    description: '守成クラブの仲間同士で、探しごとと信頼できるオファーをつなぐ会員向けアプリ。',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#f6f8fc',
    theme_color: '#2563eb',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
