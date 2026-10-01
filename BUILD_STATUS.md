# Build Status — v0.8.1 Stability Repair + Private Ingestion

## Stability repairs
- Fixed the remaining admin navigation selector regression that could break CEO controls after login/navigation.
- Import Inbox retains Save cleanup, Promote to draft and Publish controls.
- Demand Queue retains Fetch & process and Review controls.
- DailyUpdate / ZA Bursaries sync keeps API endpoint fallbacks plus direct website fallback discovery.

## Search and country filtering
- Search is token-based in the shared filter layer instead of literal full-phrase SQL matching.
- The same query behavior is used by PostgreSQL, demo and local fallback paths.
- Search supports q/query/keywords plus country and content type filters.
- Public search is paginated.

## Private ingestion API
- Private key-protected route: POST /internal/ingest/v1/batch
- Jobs: maximum 50 records per request.
- Bursaries: maximum 100 records per request.
- Disabled unless TODAYINFO_INGEST_KEY is configured.
- Requires source URL and application URL for every item.
- Verifies the final application destination before automatic publication.
- Records that fail verification or the normal quality threshold remain drafts.
- Existing source URLs/slugs are updated instead of duplicated when possible.
- Published records still use the normal R2/local JSON publication pipeline.

## Structured rewrites and SEO
- Private ingestion uses deterministic structured rewriting, not AI rewriting.
- Raw source descriptions are not blindly mirrored into the page body.
- Descriptive slugs include organisation/provider, title, location/country and year where relevant.
- The public content response now exposes a top-level application object so frontends can render Apply prominently.

Dynamic content is not limited to the reference-seed count. The seed set is only a baseline; private ingestion, imports and harvests can continue increasing the published catalog.
