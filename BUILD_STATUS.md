# Build Status — v0.8.1 Admin + Import Repair

This release is a stability hotfix on top of v0.8. No working TodayInfo feature is intentionally removed.

## Repaired admin dashboard
- Fixed single-element DOM selectors that were incorrectly followed by `.forEach()`.
- Repaired role-aware navigation filtering after login.
- Repaired navigation between Overview, Source Hub, Import Inbox, Demand Queue, Content Library and the other admin areas.
- Repaired Source Hub news/provider button wiring.
- Repaired traffic-atlas click wiring.
- Admin assets now use no-cache/no-store headers so a broken dashboard JavaScript file is not kept for an hour after deployment.

## CEO access
- Owner remains **CEO / Owner** with wildcard backend permission.
- Regression tests explicitly require Owner access to import viewing/fetching/review, post viewing/creation/editing/publishing, dashboard, analytics, team, settings and audit.
- Promote, edit and publish routes remain permission-protected and available to Owner.

## Import Inbox + Demand Queue
- PostgreSQL raw-import queries now inspect the actual table columns.
- Older Supabase schemas can still list imports even when newer memory columns have not yet been migrated.
- Legacy import upserts only write columns that actually exist.
- Demand Queue falls back to import data even if analytics click aggregation is temporarily unavailable.
- Deep sync defaults to latest available data; the year field is optional.
- If a requested year produces no usable records but the source returned data, TodayInfo can fall back to the latest available records.

## Source publishing policy
Source Hub now distinguishes content-discovery rights from publishing behavior:
- SAnews: reuse with credit; automatic publishing is allowed by TodayInfo policy.
- DailyUpdate: discovery + original summaries/facts; no mirrored article text; automatic Source Hub publishing disabled.
- ZA Bursaries: factual discovery + provider verification; automatic Source Hub publishing disabled pending source-policy review.
- DSTI/DPSA/Gov.za: summary/facts/link workflows; commercial-reuse restrictions are recorded and automatic publishing is disabled where appropriate.
- Unknown sources default to human review.

This is a product policy layer, not legal advice.

## Release gate
Merge only after:
- npm dependency installation succeeds;
- source syntax checks pass;
- the complete Node test suite passes, including the new admin/import regression tests.
