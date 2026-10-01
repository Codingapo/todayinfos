# Build Status — v0.8.1 Admin + Import Repair

This is a repair release. It keeps the v0.8 API, R2 publishing, source catalog, employee roles, demand queue, application guides, analytics and global harvesting.

## Dashboard/runtime repairs
- Fixed collection-selector runtime crashes in role-aware navigation, traffic atlas and Source Hub buttons.
- CEO / Owner wildcard permissions remain unchanged.
- Import Inbox Review is editable again.
- Demand Queue Review uses the same editable Import Review.
- Import Review can save cleanup, save-and-promote, and reopen an already promoted draft.
- Editing one import field no longer resets unrelated prepared-draft fields.

## Fetch repairs
- Deep Sync defaults to all years rather than silently applying the current-year filter.
- Source API requests retry transient failures up to three attempts.
- DailyUpdate jobs fallback order: /dailyupdate/jobs -> /dailyupdate -> /articles.
- ZA Bursaries fallback order: /bursaries -> /search?q=bursary.
- The response records which source endpoint was ultimately used.

## Source Hub publishing policy
- No AI rewriting is required.
- Every source receives a publishing policy describing whether TodayInfo should:
  - reuse with credit;
  - create a short attributed summary;
  - extract structured facts and link back.
- SAnews is marked reuse-with-credit based on its published media policy.
- gov.za and DPSA are conservatively treated as facts-and-link for a potentially commercial TodayInfo site.
- Public job/ATS sources default to structured facts + official source/application links.
- Official news harvesting is draft-first and does not auto-publish from Source Hub.

## Verification
The repair branch must pass:
- npm install
- npm run check
- the complete Node regression test suite
before merge to main.


## v0.8.3 hardening

This follow-up preserves the green v0.8.2 Source Hub diagnostics and adds two production resilience protections:

- PostgreSQL import operations inspect the actual `raw_imports` columns so older Supabase schemas do not blank Import Inbox or Demand Queue.
- Admin assets use no-store/no-cache headers so a Render deployment cannot leave the browser on an older broken `app.js`.

No editor, CEO permission, source fallback, Source Hub diagnostic, R2 publishing, or API feature is removed.
