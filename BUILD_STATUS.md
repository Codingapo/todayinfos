# Build Status — v0.8.1 Stability Repair

This is a repair release. No existing TodayInfo feature is intentionally removed, and no AI rewriting feature is introduced.

## Admin dashboard repair
- Fixed collection-selector regressions that could crash the dashboard after Apo/CEO login.
- Fixed navigation selector regression.
- Fixed Source Hub news/harvest selector regressions.
- Fixed traffic-atlas selector regressions.
- Added visible handling for unhandled dashboard promise errors.
- Import Inbox Review and Promote remain available to the CEO.
- Promotion now reliably opens the structured editor after the draft is created.
- Content Library Edit reliably waits for the post before opening the editor.
- Owner/CEO retains wildcard RBAC and full edit/publish/delete access.

## Import Inbox + Demand Queue
- Import Inbox keeps the existing Review → Promote → Edit → Publish workflow.
- Demand Queue remains a CEO/source-management workflow.
- Deep Sync year filter now defaults to blank so current and future opportunities are not accidentally excluded.
- Existing review state, source memory and 80%+ publishing checks remain in place.

## Jobs and bursaries source resilience
- Dedicated source collection endpoints remain the first choice.
- ZA Bursaries fallback: `/bursaries` → `/search?q=bursary`.
- DailyUpdate jobs fallback: `/dailyupdate/jobs` → `/dailyupdate` → `/search?q=jobs`.
- Fetch responses report `endpointUsed`, `endpointFallbackUsed` and all endpoint attempts.
- Source Hub includes a diagnostics endpoint to check:
  - TodayInfo source API bursaries
  - TodayInfo source API DailyUpdate jobs
  - ZA Bursaries website
  - DailyUpdate vacancies website

## Source Hub editorial policy
Each source now exposes an explicit policy describing:
- what factual/structured information may be published;
- how source information should be paraphrased in simple TodayInfo wording;
- what must be verified before publication;
- what should not be copied or published.

Restricted/licensed sources remain catalog-only until access conditions are configured.

## Regression coverage
Tests protect:
- CEO owner wildcard permissions;
- Import Review/Promote/Edit/Publish controls;
- Demand Queue CEO access;
- selector crash regressions;
- blank-by-default Deep Sync year filter;
- real bursary endpoint fallback behavior;
- source editorial policies;
- Source Hub diagnostics.

CI note: the selector-regression assertion was corrected to distinguish the multi-selector helper (`$$`) from the single-selector helper (`$`).
