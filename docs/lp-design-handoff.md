# TASUKI LP review

Base: `claude/codex-chat-handoff-dbw0m2`, commit `c77a97128d0ee35d27fce59d07bb88e3276677f9`.
Local implementation branch: `codex/tasuki-slush-lp`.

## Reference lock

User's Slush reference owns sky/white/gray paper panels, enormous condensed black lettering at 0.78 line height, electric-blue inflatable ribbons, rainbow sticker accents, black 1px outlines, rounded cards, pill controls, and no CSS gradients or box shadows. Refero Slush (4b2938dc-7a56-488e-8fe3-3f8a212def34) checked against the supplied description. Fictional (5f5fd099-866e-4681-917b-0254a3883980) contributes only the speech bubble and asymmetric collage treatment; its fonts, colors, corner radii and CTAs are not adopted.

Antonio 700 is the brief's permitted display substitute, locally hosted with OFL license. Japanese text uses the existing system Japanese font stack at readable line heights. BrandMark continues using the repository's adopted public/mark.svg. No unadopted historic logo draft used.

Generated transparent PNG ribbon is decorative and included under public/lp/. All informative text remains accessible HTML. Most content is a server component; only invitation entry is interactive client code. Pricing and campaign derive from existing source modules. Campaign expiry follows existing entitlement logic.

## Changes and routes

- `/`: unauthenticated users see LP, with existing login-error messaging. Admin-host redirect, authorization gate, member board and ad return behavior retain their previous control flow.
- `/lp`: marketing-only review route, available without DB queries, with noindex metadata. No member data or auth bypass.
- Primary CTA scrolls to invitation entry; normalized eight-character code navigates to existing `/join/<code>` for server validation.
- Member login uses existing `/api/auth/google/start`.
- Existing legal and support routes linked in footer.

## Commercial terms confirmed against current implementation

User delegated completion after reviewing the first draft. History commit `586e749` explicitly restores banner capacity to 10 slots. LP now reads both capacities from `placementSlots` in `app/ad-options.ts`, keeping advertising behavior unchanged. Banner: 10 slots / 350 yen per day. Board top: 3 slots / 600 yen per day. Dates: 7–30 days. Subscription: 1,200 yen monthly / 11,520 yen annually (20% off).

The handoff document in repository root dates to August and includes stale authentication and deployment descriptions. Current implementation and September pricing docs were used instead. Claude artifact could not be fetched; user-supplied summary and repository are the evidence.

## Checks

- TypeScript, eslint (zero errors; 16 warnings in unchanged app files), vinext production build passed.
- Browser: 1440/768/390/320 widths without document overflow, desktop/mobile screenshots, root login-error state, no page errors.
- Invitation field normalizes to uppercase; submission reaches `/join/AB12CD34` (destination intercepted, no live signup performed).
- Google auth link destination verified; no Google login or live member transaction performed.
- Authenticated board behavior retained in source; not tested with a real member session.

## Publication

User delegated proceeding through publication. Existing production branch is `claude/codex-chat-handoff-dbw0m2` (Cloudflare Workers build succeeded for c77a971). Apply only LP commits by fast-forward to that branch after preflight; preserve the older main branch. Deployment and production verification results will be recorded after completion.
