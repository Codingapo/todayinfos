# Build Status — v0.8.4 Direct Source Fallback Repair

This release is an incremental stability update on top of v0.8.3. Existing Source Hub, Import Inbox, Demand Queue, CEO/employee permissions, R2 publication, analytics, public API, search, trending, application guides and legacy Supabase compatibility remain in place.

## What v0.8.4 fixes

- DailyUpdate and ZA Bursaries no longer depend completely on the legacy TodayInfo source API.
- The importer still tries the source API and its fallback endpoints first.
- If those routes all fail or return no records, TodayInfo may read the approved public source website directly.
- Direct fallback extracts only metadata, titles, source links, useful related links and application-link candidates.
- Full source articles are not copied into the fallback draft.
- Direct-fallback cleanliness is capped below the automatic publishing threshold.
- Direct-fallback imports are always kept private for human review, even when Auto-publish was requested.
- Demand Queue URL fetches can use the same approved-domain fallback when source extraction is unavailable.
- The dashboard clearly says when direct fallback was used.

## Non-AI editorial rule

Source Hub remains rule-based. `sourcePublishingPolicy()` reports `ai_rewriting:false` for every source. Human editors decide what to publish and may paraphrase only according to the source-specific reuse policy.

## Existing repairs retained

- v0.8.1: CEO editing/review/promote/publish flow, Import Inbox editing, Demand Queue repair, source policies, draft-first news.
- v0.8.2: source diagnostics and legacy API endpoint fallbacks.
- v0.8.3: older Supabase `raw_imports` schema compatibility, Demand Queue analytics resilience, no-cache admin assets.

## Release gate

The exact final branch must pass dependency installation, syntax checks and the full Node regression suite before merge.
