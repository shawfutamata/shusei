import { serviceUrl } from '../brand';
export function GET() {
  const paths = ['/lp', '/support', '/terms', '/privacy', '/refund', '/tokushoho'];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map(path => `<url><loc>${serviceUrl}${path}</loc></url>`).join('')}</urlset>`, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
