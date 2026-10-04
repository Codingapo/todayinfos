# Build Status — v0.9.8 Native Dataset Ingest

## Existing system retained
- Public frontend/API/admin/VPS deployment remain unchanged.
- Existing R2 bucket and publication flow remain unchanged.
- Existing Import Inbox, Source Hub, Demand Queue and public API remain unchanged.
- Private ingestion remains protected by TODAYINFO_INGEST_KEY.

## Ingest improvements
- Native TodayInfo JSON records are accepted directly.
- Nested type_data and source metadata are preserved.
- Jobs, internships, learnerships, opportunities, bursaries and scholarships are supported.
- Batch limits remain conservative: 50 career/opportunity records and 100 bursary/scholarship records.
- Worldwide records are accepted without fabricating a country code.
- Bulk draft ingestion can defer live application-link verification for speed.
- publish=true still uses the application-link verification and normal publishing quality gate.
- Re-ingestion updates by source identity/slug instead of intentionally duplicating records.

## VPS utility
- scripts/ingest-dataset.mjs reads a JSON array or an object containing records.
- npm run ingest:dataset invokes the utility.
- Default mode is draft-only.
- --publish must be supplied explicitly to request publishing.
- --dry-run previews grouping and batch count without writing anything.

## Release gate
Do not merge unless dependency installation, syntax checks and the complete Node test suite pass on the exact release head.
