# TASUKI public landing page

- Canonical landing page: https://tasuki.club/lp. Service remains at `/` with existing access checks.
- `/lp` serves index/follow, Japanese service title and description, canonical, Open Graph and Twitter image metadata in server HTML.
- JSON-LD describes the existing operator, website, page and service. No invented ratings or endorsements.
- `/sitemap.xml` lists public marketing/support/legal pages only; `/robots.txt` points to it. Robots exclusions do not replace authorization.
- Visible FAQ answers audience, free plan, invitation requirements and support. Prices continue to use shared application constants.
- Product screenshots use lazy loading and explicit dimensions. Three.js loads asynchronously and renders on scroll; reduced motion and WebGL fallback are retained.
- Verification: npm run preflight; node scripts/check-lp.mjs (320–1440px, forward/reverse assembly, reduced motion, fallback, images, invitation).
- Search Console submission and actual Google indexing/ranking have not been verified. Indexable metadata and sitemap are prerequisites, not ranking guarantees.
