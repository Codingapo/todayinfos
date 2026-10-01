# Build Status — v0.5.0 Demand Discovery + Source-Aware Extraction

This release expands the existing TodayInfo managed API without removing the v0.4/v0.4.1 global, R2, federation, filtering, search, trending, or safe auto-publish behavior.

## 40 published reference records
- The permanent South Africa reference dataset still contains 40 records: 20 jobs and 20 bursaries.
- Startup now ensures all 40 have live `published` posts.
- Published seed posts are synchronized to the normal JSON/R2/local artifact pipeline.
- Closed/expired opportunities remain published but expose their calculated closed status.
- Startup publishing is idempotent: unchanged seed posts are not rewritten on every restart.

## DailyUpdate extraction profile
- DailyUpdate archive/pagination pages are treated as discovery indexes rather than content.
- Article chrome such as Table of Contents, Toggle, duplicate headings/dates and Read More noise is removed.
- Hiring/job/internship/learnership titles are classified deterministically.
- Requirements, How to Apply and external official application/careers URLs are extracted when present.
- Relevant related DailyUpdate opportunity links become private discovery drafts.

## ZA Bursaries extraction profile
- Monthly “Bursaries Closing in …” pages are treated as discovery indexes, not individual bursary articles.
- Bursary detail extraction recognizes Eligibility Requirements, How to Apply, Supporting Documents and Closing Date sections.
- Human-readable dates such as “31 October 2026” are normalized to ISO dates.
- Useful application links are preferred over navigation/social/junk links.
- Relevant bursary/scholarship links become private discovery drafts.

## Demand-aware missing content
- Missing related/recommended/source links are stored privately in the Import Inbox as low-quality draft leads.
- Public related/recommendation link payloads now include frontend-ready analytics tracking metadata.
- When a visitor clicks a missing external related/recommended link, TodayInfo records that URL as a private draft lead if it is not already known.
- A clicked missing item receives `priority=highest` and ranks above ordinary clean/changed discoveries.
- Admin endpoint: `GET /admin/api/imports/priority`.
- Demand Queue actions can fetch a selected URL through the source API extractor and run it through source-aware cleaning plus the existing 80% auto-publish gate.

## Dashboard
- Added a dedicated Demand Queue.
- Overview now shows published pages, open bursaries, visitors, searches, application clicks, related clicks, waiting imports and highest-priority missing content.
- Analytics now shows search intent, visitors by country, visitors by region/province/state, content mix, event history and popular content.
- Priority states are visually distinct on desktop and mobile.

## Public API tracking contract
- Related links include `tracking.event_type=related_click`.
- Recommendation links include `tracking.event_type=recommendation_click`.
- Tracking payloads contain `post_id`, `target_url`, `target_title` and optional target type.
- Application URLs include an `application_tracking` payload.
- `GET /api/v1/meta` advertises this contract.

No AI or prediction functionality was added.
