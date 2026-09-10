import type { Metadata } from 'next';
import { serviceUrl } from '../brand';
import { company } from '../company';
export const lpUrl = `${serviceUrl}/lp`;
const title = 'TASUKI｜経営者・事業者向けの招待制ビジネスマッチング';
const description = 'TASUKIは経営者・事業者向けの招待制ビジネスマッチングサービス。案件の投稿・会員検索・知り合いの紹介から、新しい商売や協業のきっかけをつなぎます。無料プランあり。招待コードとGoogleアカウントで登録できます。';
export const lpMetadata: Metadata = {
  title, description, alternates: { canonical: lpUrl },
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large' } },
  openGraph: { title, description, url: lpUrl, siteName: 'TASUKI', type: 'website', locale: 'ja_JP', images: [{ url: '/lp/tasuki-og-blue-v1.png', width: 1200, height: 630, alt: 'TASUKI — 紹介が、次の商売につながる。' }] },
  twitter: { card: 'summary_large_image', title, description, images: ['/lp/tasuki-og-blue-v1.png'] },
};
export const lpStructuredData = {
  '@context': 'https://schema.org', '@graph': [
    { '@type': 'Organization', '@id': `${serviceUrl}/#organization`, name: company.name, url: lpUrl, email: company.email },
    { '@type': 'WebSite', '@id': `${serviceUrl}/#website`, name: 'TASUKI', url: serviceUrl, inLanguage: 'ja', publisher: { '@id': `${serviceUrl}/#organization` } },
    { '@type': 'WebPage', '@id': `${lpUrl}#webpage`, url: lpUrl, name: title, description, inLanguage: 'ja', isPartOf: { '@id': `${serviceUrl}/#website` }, mainEntity: { '@id': `${lpUrl}#service` } },
    { '@type': 'Service', '@id': `${lpUrl}#service`, name: 'TASUKI', serviceType: '招待制ビジネスマッチングサービス', description, url: lpUrl, areaServed: { '@type': 'Country', name: 'Japan' }, audience: { '@type': 'BusinessAudience', audienceType: '経営者・事業者' }, provider: { '@id': `${serviceUrl}/#organization` } },
  ],
};
