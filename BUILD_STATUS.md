# Build Status — v0.8.6 Search, CEO Controls & Private Ingestion

This is a stability update on top of v0.8.5. Existing source-policy rules, no-AI narrative policy, Import Inbox, Demand Queue, direct DailyUpdate/ZA Bursaries fallbacks, R2 publishing, employee RBAC and analytics remain intact.

## Repairs
- Fixed the remaining CEO navigation selector crash.
- Import Inbox edit / Save cleanup / Promote / Publish controls remain wired.
- Demand Queue Fetch & process / Review controls remain wired.
- Search is token-based across title, summary, body, tags, organisation, location and structured fields.
- Country + content type + search filters now use the same shared rules in PostgreSQL, demo and local fallback modes.
- Public search supports q/query/keywords and pagination.

## Private ingestion
- POST /internal/ingest/v1/batch
- Protected by TODAYINFO_INGEST_KEY. Disabled when no key is configured.
- Maximum 50 jobs per batch.
- Maximum 100 bursaries per batch.
- Requires source_url and application_url.
- Direct application destination is verified before automatic publication.
- Normal 80%+ publish quality gate still applies.
- Weak/unverified new records remain draft.
- Weak updates never downgrade an existing published page.
- Descriptive SEO slugs include organisation/provider, title, location/country and year when available.
- Content is rebuilt into TodayInfo's structured deterministic format; this does not add AI rewriting.

## Public API
- Opportunity responses now expose a top-level application object with URL, verification state and guide reference.
- Dynamic content is not capped at the reference-seed count. Ingestion/import/harvest can continue growing the catalog.

## Release gate
The exact branch must pass install, syntax checks and all tests before merge.
