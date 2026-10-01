# Build Status — v0.8.0 Content Engine + Verified Apply Links

This release is incremental. Existing v0.7 API routes, Source Hub, employee RBAC, 80 permanent reference opportunities, R2/local fail-safe publishing, search, trending, related content, demand queue and analytics remain in place.

## Content engine
- Official news is processed in batches of at most 10.
- Active official feeds: SAnews and DSTI.
- News output is a short attributed plain-English summary rather than a mirrored article.
- Source URL and credit remain attached to the imported record.
- Source Hub now contains 30 catalogued sources.

## Opportunity application intelligence
- Candidate application links are ranked from source data.
- The source article URL is explicitly rejected as a direct application URL.
- Candidate links are checked and redirects are followed.
- Verified final application URLs are stored in structured metadata.
- Application guidance is built from published requirements, how-to-apply text and supporting-document sections.
- Ten-at-a-time opportunity processing is available in Import Inbox.
- Opportunity batch auto-publishing requires a verified direct application route.

## R2 publishing
- Main published content remains one JSON artifact per page.
- Substantive application guides create a second R2/local JSON artifact under the guides collection.
- Thin guides are not created.
- R2 outage behavior is unchanged: local artifact + retry queue.

## Public API
New public routes:
- GET /api/v1/guides
- GET /api/v1/guides/:slug

Existing /api/v1/meta now advertises guide storage and routes.

## Recommendations
- Education/funding pages recommend education/funding content.
- Career pages recommend career content.
- News/editorial pages recommend news/editorial content.
- Cross-family accidental recommendations are blocked.

## Analytics
- Country analytics now include visitors, views, reads, searches, application clicks and downloads.
- Country data is aggregated into continents.
- CEO Analytics includes a clickable world traffic atlas.

## Release gate
The branch must pass dependency installation, source syntax checks and the complete Node test suite before merge.
