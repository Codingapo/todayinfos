# Build Status — v0.6.0 Source Hub + Global Harvest

This release expands TodayInfo incrementally. Existing public API routes, publishing rules, R2/local fail-safe behavior, analytics, demand queue, and structured editor remain in place.

## Permanent content
- South Africa verified reference dataset: 40 records.
- Africa verified reference dataset: 40 records across Kenya, Nigeria, Ghana, Uganda, Tanzania, Zambia, Zimbabwe and Botswana.
- Total permanent bootstrap: 80 records.
- Reference records are deduplicated by source URL / country / slug and published on startup.
- Published JSON artifacts remain synchronized through the normal R2/local publication pipeline.

## Source Hub
- New dashboard Source Hub with separate controls for DailyUpdate, ZA Bursaries, Psychometric Test and global feeds.
- DailyUpdate / ZA Bursaries can fetch useful related detail pages, not only index/archive pages.
- Related-page expansion is capped and deduplicated.
- Existing 80%+ safe auto-publish gate remains the final authority.

## Smart related content
- Public detail responses calculate related content deterministically.
- Signals: manual relation, country, content type, organisation, categories, tags, fields of study, education level and work mode.
- Manual relationships receive priority.
- Related content is generated from published content only.
- No AI/prediction feature is used.

## Global Harvest
- Public adapters: Arbeitnow, Jobicy and Remote OK.
- Configurable public-board adapters: Lever and Ashby.
- Harvest target can be up to 5,000 records per admin run.
- Obvious placeholders/non-job pages are rejected.
- Recent-age filtering is supported.
- Provider attribution and canonical/source URLs are retained.
- Harvest snapshots are saved through R2/local fallback.
- Harvested records enter the Import Inbox, are deduplicated, and only auto-publish when they pass TodayInfo's normal cleanliness + hard publishing checks.

## Dashboard
- New Source Hub navigation.
- Carefully designed source cards, provider controls and harvest progress/result states.
- Content Library filters now combine:
  - search
  - country
  - content type
  - publishing status
  - opportunity status
  - source
  - sort order
- Responsive desktop/tablet/mobile styling added.

## Important data-quality policy
TodayInfo does not invent job listings to reach a target count. Large harvests must come from real public source feeds or public ATS boards and retain attribution. Stale, incomplete or low-quality records remain private for review.
