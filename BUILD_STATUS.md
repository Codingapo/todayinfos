# Build Status — v0.8.2 Import Resilience Hardening

This release is a small stability layer on top of the already-green v0.8.1 repair. It does not remove or replace the v0.8.1 editor, Source Hub, fetch fallback, CEO permissions, R2 publishing, search, analytics, or employee workflows.

## PostgreSQL / Supabase compatibility
- Import Inbox now inspects the real `raw_imports` columns before querying.
- Older Supabase schemas can still list and search imports even when newer memory columns are not present.
- Legacy import upserts write only columns that exist instead of failing the whole fetch.
- Import cleanup updates skip unavailable optional columns safely.
- Demand Queue uses the compatible Import Inbox query and remains available even if click-analytics aggregation is temporarily unavailable.

## Admin deployment freshness
- Admin HTML/JS/CSS are served with `Cache-Control: no-store, no-cache, must-revalidate`.
- This prevents a repaired dashboard from being hidden behind an older cached `app.js` after Render deploys a new commit.

## Preserved v0.8.1 repairs
- Apo / CEO retains complete edit, review, promote and publish permissions.
- Import Inbox review forms remain editable.
- DailyUpdate and bursary source endpoint fallbacks remain.
- Deep Sync defaults to all years/latest available source data.
- Source Hub safe publish/paraphrase policies remain.
- Official news harvesting remains draft-first for human review.

## Release gate
Merge only after dependency installation, syntax checks and the complete regression suite pass on the exact PR head.
