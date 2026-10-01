# Build Status — v0.7.0 Source Catalog + Employee Workspace

This release updates TodayInfo incrementally. The v0.6 global API, 80 permanent published seed records, R2/local fail-safe publishing, demand queue, analytics, structured editor, source-aware DailyUpdate/ZA Bursaries cleaning and existing public routes remain in place.

## Source Hub v2
- Source Hub is now category-based rather than one regional/global list.
- 28 sources are catalogued in six groups:
  - TodayInfo Network
  - South Africa Official
  - Public Job APIs
  - Employer ATS Boards
  - Scholarships & Funding
  - International Organisations
- This is exactly 20 additional researched sources beyond the original eight source/integration entries.
- Each source declares content types, region, access/integration mode and status.
- Status is explicit: active, discovery, credentials required or licence required.
- Source cards show internal import/published/quality statistics only to authorized admin users.
- Search, category and integration-status filters are available in Source Hub.
- Public API endpoint `GET /api/v1/sources` exposes the safe catalog/capability model without internal admin counts.

## Active harvest expansion
Existing adapters remain. New active public integrations:
- Remotive
- Greenhouse public Job Board API
- Workable public careers endpoints
- SmartRecruiters public Posting API

Existing active integrations:
- Arbeitnow
- Jobicy
- Remote OK
- Lever public boards
- Ashby public boards

Sources that require credentials or licensing remain catalogued but are not falsely presented as active.

## CEO + employee access
- Owner is presented as **CEO / Owner**.
- Apo's owner account retains full wildcard access.
- New `content_worker` role is available.
- Editor and Content Worker are restricted to:
  - Import Inbox review/cleaning
  - Content Library editing
  - Publishing
  - Media viewing/uploading
- Restricted employees cannot access Overview, Source Hub, Demand Queue/source-fetch APIs, Analytics, Team, Settings or Audit.
- Restrictions are enforced by backend RBAC in addition to role-aware dashboard navigation.
- Only an owner can create another owner or change owner-level access.

## Employee productivity
Productivity comes from audit events, not manually entered counters:
- cleaned = `import.clean`
- promoted = `import.promote`
- published = `post.publish`
- edited = `post.update`
- last activity timestamp

The CEO Team view shows employee output and status.

## API improvements
- `GET /api/v1/meta` advertises source-catalog capabilities.
- `GET /api/v1/sources` returns categorized source metadata and operational status.
- Internal import/published source statistics stay private.
- Existing public content/search/trending/location/filter endpoints remain backward compatible.

## Quality policy
TodayInfo still uses deterministic rules and human review rather than AI/prediction features. The 80%+ auto-publish threshold and hard safety/publishing checks remain authoritative.
