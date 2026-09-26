# Logged-out product preview

The `/login` entry uses the existing TASUKI blue/white product language. Existing members open the original Google/email login form from the header. Authentication endpoints, member routing and invitation validation remain unchanged.

Design references: Arcade (Refero style ba425c3b-729e-48fd-b4d3-c4388123d6bd) informs the restrained white canvas and product-led preview; Parallel (screen 636e35ce-9f92-4862-8832-709dbfc28f53) informs mode controls and scannable listings. Existing TASUKI UI and the supplied mobile brief take priority: readable Japanese, generous tap targets, visible budgets, no decorative screenshot scaling.

The preview contains only static fictional examples, explicitly labeled. No member API is called. Users can open a listing, inspect an example offer, or enter a fictional request title and preview it. Input is local React state only, never submitted or persisted. Registration uses the existing `/join/<8-character code>` route and explains the current operator-review requirement. No default invitation code or automatic registration is introduced.

Verify at 320, 390, 768 and 1440 CSS pixels: no horizontal overflow; both preview modes work; listing back navigation works; invite code normalization and route work; Google link remains `/api/auth/google/start`; email-code step and back action remain functional; authentication errors expand the login section. Do not send real authentication emails as part of preview QA.

Validation (2026-09-26): typecheck, production build and full lint completed (0 errors; 19 existing warnings). Playwright checked the four viewport widths, detail/offer interaction, request preview, invite normalization/routing, Google URL, and email-code/back transitions with the request-code endpoint mocked (no mail sent). Browser page errors: none. Mobile and desktop screenshots reviewed. Mobile venue/perk synchronization checks passed. Validation ran from a clean npm-ci copy under /tmp because reads in the existing node_modules stalled.
