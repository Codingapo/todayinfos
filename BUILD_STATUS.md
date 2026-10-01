# Build Status — v0.4.0 Global API

TodayInfo now has a global, published-content-first API architecture while preserving the existing API and dashboard behavior.

## Global content
- Structured country, region/state/province, city and location fields.
- Structured classification: organisation, subcategory, opportunity type, education level, fields of study, job type, work mode, salary/stipend, eligibility tags and keywords.
- Added Scholarship and general Opportunity content types.
- Country-aware SEO paths such as `/za/bursaries/slug`, `/gb/jobs/slug`, and descriptive news paths.
- Existing non-country routes remain supported.

## Search and discovery
- Public search remains published-only.
- Global filters support country, region, city, category, subcategory, organisation, education level, field of study, job type, work mode, salary, stipend, eligibility, status and date ranges.
- Structured search relevance scores.
- Filter facets and location hierarchy endpoints for future frontend controls.

## Trending and personalization
- Trending uses published content only.
- Deterministic ranking uses recent views, reads, application clicks, downloads, related/recommendation clicks, recency and optional editorial trending flag.
- Global, country and region trending endpoints.
- Anonymous visitor personalization is rule-based from that visitor's own recent searches/engagement and location signals.
- No AI or prediction features.

## Storage and resilience
- Published detail pages are emitted as individual JSON artifacts.
- Local artifact is written first; R2 is synchronized immediately when configured.
- Failed R2 writes are queued and retried automatically.
- An R2 published manifest supports search/discovery even when databases are unavailable.
- Publication metadata is tracked in the database.
- Multiple PostgreSQL/Supabase databases are supported through `DATABASE_URLS` and numbered URLs.
- Public reads federate and deduplicate across databases.
- Local published index is maintained as a database fail-safe.
- Availability-related database writes can queue locally for retry.
- Existing signed admin sessions can continue during a temporary primary DB outage; new logins still require the primary admin database.

## Analytics
- Anonymous events can include country/region/city signals.
- Analytics API can report visitors by country/region, popular searches, content mix and popular published content.
- No raw IP address is stored by this implementation.

## Migrations
- `004_global_content.sql`
- `005_published_artifacts.sql`

The frontend has intentionally not been redesigned in this release; the API contract is the priority.
