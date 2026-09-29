# Event and direct acquisition

Event QR links remain `/meeting/<event-id>`. The venue-branded registration asks for the respondent's company/name from that event's imported roster, allows corrections, and accepts walk-ins. Google and email OTP both create/reuse a normal TASUKI session and return directly to the event. Consent explicitly covers account/profile storage and the separate survey consent covers AI matching.

Verified registration saves event-scoped identity in `meeting_member_links` and the same business information in `members`. Roster identity and answer ownership are unique. The account, rather than an answer receipt, owns subsequent reads and edits across devices; edits stop at the deadline. Legacy answers can be claimed only with their receipt and matching selected roster/identity. Existing answers/events are preserved.

Only new `meeting_signup` members move from invited to active when the linked answer is confirmed present by the admin. Suspended/canceled members are never activated. LP signups retain the existing admin approval policy. Valid referral links retain the existing inviter/activation policy. Existing direct-login accounts keep their profile and status.

Published, confirmed respondents see event candidates first. A separate authenticated POST `/api/meeting/<id>/network` searches all contactable TASUKI business profiles, excluding themselves and present event attendees. AI expands concrete job/workflow terms, retrieval selects up to 36 records, and the existing evidence + independent-review matcher verifies candidates. Retrieval scores alone never become matches. Direct and related work are distinguished; absent evidence produces no candidate. Names, companies and contact details are excluded from AI input. Eligible profiles and the wish form the cache fingerprint; ready results cache for 20 minutes, with a lease preventing duplicate concurrent analysis.

Result cards link to `/?contact=<member-id>` for a draft direct conversation and `/?member=<member-id>` for a profile. The banner links to `/?action=post&meeting=<event-id>` and imports the account's own wish into a reviewable posting draft. Nothing is sent or posted automatically. Posting keeps the existing photo/plan requirements.

`/register` supports Google and email company-profile registration for LP/referral acquisition; `/register?invite=<code>` preserves attribution. `/register/complete` shows pending approval or opens the authenticated board.

Checks: `npm run typecheck`, `npm run build`, `node tests/meeting-accounts-runtime.mjs`, `node tests/meeting-acquisition-runtime.mjs`, `node tests/meeting-auth-integration.mjs`. Runtime tests use isolated D1 and mocked OAuth/email/AI; they do not create real production accounts or send real messages.
