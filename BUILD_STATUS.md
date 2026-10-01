# Build Status — v0.5.0 Demand-Aware Source Intelligence

## Published reference data
- The permanent 40-record South Africa reference dataset is now published on startup.
- Startup is idempotent: unchanged seed records are not rewritten on every restart.
- Seed imports are linked to their published posts and JSON artifacts.
- Closed/expired opportunities may remain publicly visible with a date-driven CLOSED status.

## DailyUpdate + ZA Bursaries source profiles
- DailyUpdate receives job/internship/learnership-aware extraction.
- DailyUpdate archive/pagination records are rejected as content pages.
- ZA Bursaries receives section-aware extraction for eligibility, supporting documents, how to apply, closing date and application links.
- ZA Bursaries monthly closing-date pages are treated as discovery indexes, not fake bursary posts.
- Useful links discovered on source/index pages are stored as private draft leads.

## Demand queue
- Public related/recommended links expose analytics tracking payloads.
- A click on a missing external related/recommended item creates or reinforces a private discovery draft.
- Any clicked missing item becomes HIGHEST PRIORITY regardless of its current clean score.
- Admin API: GET /admin/api/imports/priority
- Demand Queue supports one-click Fetch & process for the target URL.

## Analytics + dashboard
- Overview now shows searches, application clicks, related/recommendation clicks, waiting imports and highest-priority demand.
- New Demand Queue screen.
- Analytics now displays top searches, visitors by country, visitors by region/state/province and popular content.
- Existing content editor/import workflow remains intact.

## PostgreSQL hardening
- Fixed dynamic filter placeholders in listPosts().
- Added source_url to import search so URL-based discovery deduplication works in PostgreSQL.
- Global salary/stipend/eligibility filters remain supported.

No AI or prediction functionality is present.
