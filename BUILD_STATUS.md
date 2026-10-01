# Build Status — v0.8.4 Stability + Source Fallback

This release is a repair update on top of v0.8.3. It preserves the existing TodayInfo API, Import Inbox, Demand Queue, CEO editing, R2 publishing, analytics, Source Hub, employee roles and public routes.

## Dashboard stability
- Keeps the v0.8.1–v0.8.3 Import Inbox / Demand Queue / CEO editor fixes.
- Owner/CEO still has full import review, promote, post edit and publish permissions.
- Import cleanup remains editable and partial saves merge with the existing prepared draft.
- Admin assets continue to use no-cache headers so repaired JavaScript is not hidden by stale browser cache.

## Jobs and bursaries source reliability
- Existing legacy source API retries and endpoint fallbacks remain.
- If DailyUpdate or ZA Bursaries API endpoints fail or return no records, TodayInfo can fall back to the original public websites.
- DailyUpdate fallback discovers current vacancy/job pages and fetches individual detail pages.
- ZA Bursaries fallback discovers current bursary/scholarship pages from homepage, bursary-news, search and monthly closing indexes.
- Demand Queue URL processing can directly fetch DailyUpdate / ZA Bursaries detail pages when the legacy extract endpoint is unavailable.
- Import responses expose the endpoint used, whether fallback was used, and all endpoint attempts.

## No AI rewriting
- Narrative sources are not automatically rewritten.
- DailyUpdate and ZA Bursaries are facts/application-data sources that require human editorial review before publication.
- SAnews and DSTI feeds are editorial discovery sources: they create private leads, not automatically rewritten or published stories.
- Source Hub explicitly shows AI rewriting status, auto-publish policy and source-rights status.
- Structured public job APIs / employer ATS feeds can retain the existing rule-based 80% auto-publish path when their source policy permits it.

## Source-aware publication policy
- Source policy is enforced server-side in normal fetch auto-publish, global harvest and ten-item batch processing.
- A request with autoPublish=true cannot bypass a source marked manual-review-only.
- Unknown source families default to manual review.

## Release gate
The branch must pass dependency installation, source/admin JavaScript syntax checks and the full regression suite before merge.
