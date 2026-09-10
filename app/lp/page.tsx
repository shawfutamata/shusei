import LandingPage from '../LandingPage';
import { lpMetadata, lpStructuredData } from './seo';
export const dynamic = 'force-dynamic';
export const metadata = lpMetadata;
export default function LandingPreview() {
  return <><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(lpStructuredData).replace(/</g, '\\u003c') }} /><LandingPage /></>;
}
