import type { Metadata } from 'next';
import LandingPage from '../LandingPage';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'TASUKI｜紹介が、次の商売につながる。', robots: { index: false, follow: false } };

// Public marketing-only preview, with no member data or authentication bypass.
export default function LandingPreview() { return <LandingPage />; }
