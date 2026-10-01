# Build Status — v0.4.1 Reference Seed + Rule Learning + Auto-Publish

This release extends the v0.4 global API without reintroducing AI or prediction features.

## Permanent reference seed
- The uploaded **South Africa Jobs and Bursaries — Verified Opportunity Drafts** dataset is stored in the repository.
- It contains 40 reference records: 20 jobs and 20 bursaries.
- It is loaded on every server start and upserted into the Import Inbox using stable source keys.
- Re-running the server does not create duplicate reference imports.
- The reference records remain draft/review material by default because the source dataset explicitly marks them draft-only.

## Rule-based learning memory
- Import learning is deterministic, not AI.
- The system remembers aggregate source-domain quality, dominant content type, dominant country, and type quality statistics.
- Learning is deduplicated by source key + source hash so repeated unchanged fetches do not inflate confidence.
- The learning profile is persisted through R2/local fallback at `system/import-learning.json`.
- When a source has a strong learned pattern, future ambiguous imports can receive a small classification/country hint and up to a 5-point quality bonus.
- Hard publishing checks always override learned hints.

## 80%+ automatic publishing
- Fetching imports now defaults to automatic publishing when quality is **80% or higher**.
- The threshold cannot be configured below 80.
- Eligible imports must also pass hard publishing checks.
- Expired/closed opportunities are blocked even if their score is high.
- A valid source URL is required.
- Opportunity content requires a usable application URL or detailed application instructions.
- Bursaries/scholarships still require provider + closing date.
- Failed items stay in the Import Inbox for review.
- Auto-published posts are synchronized to the same JSON/R2/local publication system introduced in v0.4.

## Dashboard
- Deep Sync now clearly states the 80%+ auto-publish rule.
- The fetch result reports auto-published and review-kept counts.
- `GET /admin/api/imports/learning` exposes a safe aggregate view of the rule-learning memory.

No frontend redesign was made beyond the Import Inbox wording needed to describe this behavior.
