# Build Status — v0.8.5 Source Policy Stability

This release is an incremental policy/stability update on top of v0.8.4. It does not remove any working TodayInfo API, R2, Import Inbox, Demand Queue, CEO editing, analytics, search, source fallback or employee features.

## Existing repairs preserved
- v0.8.1 CEO edit/review/promote/publish and Import Inbox repair.
- v0.8.2 Source Hub diagnostics and API endpoint fallbacks.
- v0.8.3 legacy Supabase raw_imports compatibility and no-cache admin assets.
- v0.8.4 direct website fallback for DailyUpdate / ZA Bursaries and Demand Queue details.

## No AI rewriting
- Source policy declares ai_rewriting=false.
- SAnews / DSTI feeds are editorial discovery only: Discover 10 creates private leads.
- The news discovery path does not generate a rewritten story body and cannot auto-publish.

## Manual-review narrative sources
- DailyUpdate: extracted facts/application details may be used, narrative copy requires human editing.
- ZA Bursaries: factual funding details/application routes may be used, narrative copy requires human editing.
- Both source actions request autoPublish=false.
- Server-side policy also blocks automatic publication if a caller sends autoPublish=true.

## Structured feeds
- Public job APIs and employer ATS feeds keep their existing deterministic 80%+ publishing path when the source policy allows auto_publish=true and normal hard publishing checks pass.

## Enforcement
Source policy is enforced in:
1. Import Inbox source fetch auto-publishing.
2. Global structured harvest auto-publishing.
3. Process 10 batch publishing.

Unknown source families default to manual review.

## Source Hub
Source cards show:
- source publishing mode
- reuse/rights status when known
- AI rewriting status
- auto-publish policy
- source health diagnostics

## Release gate
The exact final branch must pass dependency install, JavaScript/Node syntax checks, and the full regression suite before merge.
