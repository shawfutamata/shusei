import { serviceUrl } from '../brand';
export function GET() {
  return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\nDisallow: /join/\nDisallow: /login\n\nSitemap: ${serviceUrl}/sitemap.xml\n`, { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
}
