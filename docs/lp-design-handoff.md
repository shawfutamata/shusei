# TASUKI LP — Atlassian direction

## Current target

The user replaced the Slush brief with their full Atlassian style reference and asked to switch the published LP. Continue through production verification under the existing publication authorization. Base commit: a7fdd5a. Work branch: codex/tasuki-atlassian-lp. Production: claude/codex-chat-handoff-dbw0m2, deployed by Cloudflare Workers Builds.

## Reference lock / decision ledger

| Decision | Source and role |
|---|---|
| White enterprise canvas, dark #101214 hero and closing panel | User Atlassian reference; dark editorial moments within a mostly light page |
| #1868db primary buttons, links, focus and functional icons | User action color; no violet/yellow/green in functional controls |
| Floating violet/yellow/blue/green SaaS widgets | Decorative edges of dark panels only; mini analytics cards, status pills and chart panels move independently without overlapping content |
| 1200px content, 64–80px sections, 20px cards, 28px buttons | User spacing and shape tokens |
| Manrope display / Inter text, locally hosted with OFL licenses | User-approved substitutions; Japanese system sans fallback at readable weight and line height |
| Lavender editorial band | User section rhythm; dark text, no functional card fills |
| Overlapping product screenshots in the hero | User RevenueCat reference; actual locally rendered TASUKI UI with demo-only data, framed as a front board screen and a rear member screen |
| Restrained navigation and lower weight editorial hierarchy | Refero Atlassian 827c26bc-d922-4123-9526-4280d497eea2; user-provided details take precedence over broader retrieved style |
| White cards, 16–18px corners and violet-tinted ambient elevation around the product UI | Refero RevenueCat c6dff893-73b0-46f0-8701-03283dc4558c; borrowed only for hero screenshot framing |

The old inflatable assets and font remain available for rollback but are no longer loaded by this LP. No Atlassian logo, third-party product UI, live member data or fabricated testimonial is used. Existing TASUKI BrandMark is retained. `tasuki-ui-requests.jpg` and `tasuki-ui-mypage.jpg` were captured from the real local application after its demo seed ran; the visible sample names and requests are reserved example data and the hero labels them as demo data.

## Behavior and commercial content

- Root unauthenticated branch shows the LP; admin redirect, member authorization, authenticated board and ad return logic are unchanged.
- `/lp` remains a noindex marketing preview accessible to signed-in users.
- Invitation form normalizes 8 alphanumeric characters and uses existing `/join/<code>` server validation.
- Google login uses `/api/auth/google/start`. No authentication or payment implementation changes.
- Prices, campaign date and ad capacity derive from existing modules: standard 1,200 yen/month, 11,520 yen/year; 20% annual discount; banner 10 slots at 350 yen/day; board top 3 slots at 600 yen/day; 7–30 days.
- The code history confirmed the handoff's 5-slot statement was outdated. Ad capacity was not modified.

## QA

Use `npm run preflight` and `node scripts/check-lp.mjs` with the local dev server on localhost:4173. Review screenshots in `review/`. Check 1440, 768, 430, 390, 375 and 320 widths, mobile menu open/close and navigation, invitation normalization and mocked destination, login errors, local fonts, both product screenshot dimensions and absence of the old ribbon.

Responsive edge treatment: on widths up to 600px, the two decorative SVGs sit fully inside the viewport. The content inset grows to 46px (34px at 360px and below), and the widgets scale to 58px (50px at 360px and below). At tablet width they shift toward the outer edge so they do not overlap the headline. Three widget groups float at different speeds and the dotted signal line moves continuously; `prefers-reduced-motion: reduce` disables every decorative animation. Browser QA checks 430, 390, 375 and 320px and asserts both decorations have non-negative left positions, remain within the viewport, and do not create horizontal overflow.

Production evidence is kept in `review/deployment-checks.json`, `review/production-check.json` and production screenshots after publication. Google redirect is verified without completing registration; live member transactions and payments are not exercised.
