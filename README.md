# TodayInfo Control Center v0.9.6

A Node.js admin dashboard and structured publishing API for TodayInfo.

This revision is intentionally **rule-based and human-controlled**. It contains no AI suggestions, no generated recommendations, no prediction lab, no customer-care module, and no university-adding module.

## Core publishing rule

```text
Existing TodayInfo source API
        ↓
Private Import Inbox
        ↓
Rule-based cleanup + content-type detection
        ↓
Admin reviews / structures / edits
        ↓
Private draft
        ↓
Admin presses Publish
        ↓
New TodayInfo public API
```

Fetched source records never appear in the new public API automatically.

## What the dashboard contains

- Responsive futuristic overview with bursary-status and content/traffic charts.
- Private Import Inbox with fetch-by-source/year and the `psychometric-test` tag preset.
- Dynamic **“What would you like to update?”** editor.
- Content types: News, Bursary, Job, Internship, Learnership, Announcement, Story, Other.
- Each type shows only relevant metadata fields.
- Beautiful, mobile-friendly forms with HTML validation and server-side Zod validation.
- Rich main content using safe readable link syntax such as `[Apply Here](https://example.com)`.
- Up to 10 numbered page topics (`#t1` … `#t10`) and generated “On this page” navigation.
- Clickable tags and tag pages.
- Separate Related Links, Related Content, Recommendations, Documents, Topics and Navigation.
- Manual related-content and recommendation selection; nothing is generated automatically.
- Readable document/download names.
- Image and document media library.
- Analytics for views, reads, downloads, application clicks and related-content clicks.
- SEO-friendly extension-free slugs and redirect records when slugs change.
- Team roles/permissions, audit log and Resend invitation hook.
- Supabase PostgreSQL support plus safe demo mode.
- Cloudflare R2 **or Supabase Storage** for uploads.

## Uploads in DEMO/TESTING mode

Uploads are **not disabled in demo mode**.

If these are configured:

```env
SUPABASE_URL1=https://YOUR_PROJECT.supabase.co
SUPABASE_KEY=YOUR_KEY
SUPABASE_STORAGE_BUCKET=todayinfo
```

then images and files are uploaded to Supabase Storage even while `DEMO_MODE=true`.

If Supabase Storage is not configured but R2 credentials are present, R2 is used. If neither cloud store is configured, demo mode stores uploads locally under `/uploads` so the upload workflow remains testable.

Supported uploads:

- JPG / PNG / WebP / GIF
- PDF
- DOC / DOCX
- XLS / XLSX
- ZIP

The server verifies file signatures instead of trusting only the browser MIME value.

## Start locally

Requires Node.js 20+.

```bash
cp .env.example .env
npm install
npm run dev
```

Windows CMD:

```bat
copy .env.example .env
npm install
npm run dev
```

Open:

```text
http://localhost:8787/admin/
```

Development login while `DEMO_MODE=true`:

```text
username: apo
password: admin
```

Change this before production.

## Dynamic editor

The first screen asks:

**What would you like to update?**

Choosing a type changes the form immediately.

### News fields

- Title / slug
- Short description
- Posted date
- News/event date
- Category
- Tags
- Main image
- Main content
- Topics
- Related links
- Documents
- Related content
- Recommendations
- Navigation / SEO

### Bursary fields

Includes the shared fields plus:

- Provider / organisation
- Opening date
- Closing date
- Status override (`auto`, `open`, `closed`, etc.)
- Requirements
- Eligibility
- How to apply
- Official application link

When status is `auto`, the public response calculates status from the stored dates. The admin can override it when the real-world status differs.

### Job / Internship / Learnership fields

Includes the shared fields plus:

- Company / organisation
- Location
- Salary (optional)
- Closing date
- Requirements
- Responsibilities
- How to apply
- Application link

## Topics and page navigation

A page may contain up to 10 topics. The editor assigns:

```text
#t1
#t2
...
#t10
```

The API returns both `topics` and `topic_navigation`, so a frontend can render:

```text
ON THIS PAGE
[Who qualifies?]
[How to apply?]
[Required documents]
```

and link to `/page-slug#t2` without guessing the page structure.

## Safe readable links

In main/topic content you can write:

```md
[Apply Here At UL](https://ul.ac.za/apply)
[View another TodayInfo page](/another-page)
```

The backend converts supported content into structured blocks and safe HTML. Only `http`, `https` and internal `/...` URLs are accepted. Unsafe schemes such as `javascript:` are not rendered as links.

Inline hashtags are also detected (up to 10 unique inline tags), while the saved Tags field remains the authoritative content taxonomy.

## Public API structure

Only `status=published` pages are exposed.

Example bursary detail:

```json
{
  "data": {
    "id": "...",
    "type": "bursary",
    "slug": "example-bursary-2026",
    "title": "Example Bursary 2026",
    "description": "...",
    "posted_date": "2026-09-25",
    "tags": [
      { "name": "Bursaries", "slug": "bursaries", "url": "/tags/bursaries" }
    ],
    "metadata": {
      "provider": "Example Fund",
      "status": "open",
      "closing_date": "2026-10-30",
      "eligibility": "...",
      "how_to_apply": "...",
      "application_url": "https://..."
    },
    "body": {
      "markdown": "...",
      "blocks": [],
      "html": "..."
    },
    "topics": [],
    "topic_navigation": [],
    "related_links": [],
    "recommendation_links": [],
    "documents": [],
    "related_content": [],
    "recommendations": [],
    "navigation": {
      "breadcrumbs": [],
      "links": []
    }
  }
}
```

The frontend does not need to guess whether a field is a tag, document, topic, application URL or related page.

## Main public routes

```text
GET /api/v1/site
GET /api/v1/posts
GET /api/v1/news
GET /api/v1/bursaries
GET /api/v1/jobs
GET /api/v1/internships
GET /api/v1/learnerships
GET /api/v1/trending
GET /api/v1/posts/:slug
GET /api/v1/tags
GET /api/v1/tags/:slug
GET /api/v1/categories
GET /api/v1/categories/:slug
GET /api/v1/search?q=...
POST /api/v1/analytics/events
GET /api/v1/crawl/status
```

`GET /api/v1/tags/psychometric-test` works naturally whenever reviewed/published content contains that tag. The old source endpoint is also available as a dedicated Import Inbox preset.

## Important database warning

`migrations/001_init.sql` represents the desired clean schema for this build. **Do not run it blindly against either existing Supabase database.** Compare both real schemas first and decide what should be migrated, retained or mapped.

No migration is automatically run by the application.

## Quality checks

```bash
npm run check
npm test
```

The included tests cover rule-based source classification, crawler-text cleanup, date-driven bursary status, safe rich links, structured import drafts, structured public responses, dynamic content definitions and removed-role/permission checks.


## v0.3 — Deep sync and remembered imports

The Import Inbox now behaves like a real sync system rather than a one-time fetch.

- Sync 10, 25, 50 or up to **100 source pages**.
- Each collection page requests up to **100 records**.
- Current-year filtering is pre-filled in the dashboard for latest content; clear it to fetch all years.
- Re-fetching a record does **not** reset its review state.
- Previously promoted content stays promoted; the Ignore workflow has been removed.
- Changed source content is flagged separately for review.
- Import records track first seen, last seen, last changed and fetch count.
- Archive/category/tag/pagination pages are filtered from the publishable inbox.
- Quality score and cleanup issues are visible on each imported record.
- In demo/testing storage, the fetch dialog can publish up to three sufficiently clean preview posts so you can immediately inspect the public API.
- The same remembered import will not be promoted twice.

For PostgreSQL deployments, review and run `migrations/002_import_memory.sql` after mapping the schema to your real Supabase database.


## v0.3.1 — Recommendation relationships

- The Import Inbox no longer has an **Ignore** action.
- Legacy ignored imports are returned to `unreviewed` by `migrations/003_recommendations.sql`.
- Recommendations now support both selected TodayInfo posts and custom readable title + URL entries.
- When source data contains explicit related/recommended links, they are preserved during import.
- Generic source links are only kept as recommendations when rules show they are the same content family (for example bursary-to-bursary or job-to-job), which avoids navigation/social/ad noise.
- Public detail JSON exposes these custom/source recommendations as `recommendation_links` while selected TodayInfo pages remain in `recommendations`.


## v0.4 — Global published-content API

TodayInfo remains backward compatible, but the API can now represent and filter opportunities globally.

Example public routes:

```text
/api/v1/za/bursaries
/api/v1/gb/jobs
/api/v1/us/scholarships
/api/v1/search?country=ZA&region=Gauteng&field_of_study=Engineering
/api/v1/trending/ZA/Gauteng
/api/v1/facets?country=ZA
/api/v1/locations
```

Published detail responses contain explicit `location`, `classification`, `metadata`, `seo`, tags, topics, related links, related content, recommendations and navigation. Old routes such as `/api/v1/bursaries` and `/api/v1/jobs` remain valid.

### Published storage

When content is published or an already-published page is edited:

```text
Dashboard
   ↓
local JSON artifact
   ↓
Cloudflare R2
   ↓
published manifest/index
   ↓
database publication metadata
```

If R2 is unavailable, the local JSON and a retry queue are retained. The server retries queued R2 operations automatically.

### Multiple databases

Use one primary database plus optional additional content databases:

```env
DATABASE_URL=postgresql://...
DATABASE_URLS=postgresql://db2...,postgresql://db3...
DATABASE_URL_4=postgresql://...
DATABASE_URL_5=postgresql://...
```

The implementation accepts up to 20 numbered database URLs and presents one API to the frontend. The primary database remains the authority for admin accounts and writes; additional databases participate in public content reads.

During a database connectivity outage, the API can use its local published index and R2 manifest. Availability-related content writes are queued locally and retried when the primary database returns.

### Required production migrations

Before enabling the new PostgreSQL-backed features against a real Supabase project, review and apply:

```text
migrations/004_global_content.sql
migrations/005_published_artifacts.sql
```

Do not run migrations blindly against an existing database without first comparing its schema.


## v0.4.1 — Permanent reference seed and safe auto-publishing

The researched South Africa opportunity dataset is now part of the repository under:

```text
data/seeds/south-africa-opportunities-drafts.json
```

It is loaded every time the server starts and upserted into the Import Inbox with stable keys. This gives TodayInfo a permanent 40-record reference set for rule quality and source-pattern learning without publishing those seed records blindly.

Import learning is **rule-based**, not AI. Aggregate source-domain patterns are stored in:

```text
system/import-learning.json
```

through the existing R2/local fallback layer. Unchanged records are learned once per source hash.

### Automatic publishing after fetch

By default, a fetch can automatically publish a record only when:

- quality score is **80 or higher**;
- the source URL is valid;
- the standard publishing checklist passes;
- the opportunity is not expired/closed;
- an opportunity has a usable application URL or sufficiently detailed application instructions.

Anything that fails stays private in the Import Inbox.

Environment controls:

```env
AUTO_PUBLISH_IMPORTS=true
AUTO_PUBLISH_MIN_SCORE=80
AUTO_PUBLISH_MAX_PER_FETCH=500
```

`AUTO_PUBLISH_MIN_SCORE` is clamped to a minimum of 80.

Admin learning summary:

```text
GET /admin/api/imports/learning
```


## v0.5 — Demand-aware discovery and source-specific extraction

TodayInfo now treats DailyUpdate and ZA Bursaries as different source families instead of cleaning both with one generic rule set.

DailyUpdate article pages are cleaned as opportunity articles, while archive/pagination pages are discovery maps. ZA Bursaries detail pages are parsed around their recurring eligibility, application, supporting-document and closing-date sections; monthly closing-date pages are discovery maps.

### Missing-content demand queue

Useful links discovered from source pages are retained privately as draft leads. Public related/recommendation links include an analytics payload the frontend can POST to:

```text
POST /api/v1/analytics/events
```

Example:

```json
{
  "visitor_id": "anonymous-browser-id",
  "event_type": "recommendation_click",
  "post_id": "published-post-id",
  "meta": {
    "target_url": "https://source.example/opportunity",
    "target_title": "Example Opportunity",
    "target_type": "bursary"
  }
}
```

If that external target is not already known, TodayInfo stores it privately as a discovery draft. Any clicked missing target becomes **highest priority** in:

```text
GET /admin/api/imports/priority
```

The dashboard Demand Queue can then fetch that URL using the existing source extractor. Clean content still passes through the 80%+ auto-publish threshold and hard publishing checks.

### Reference content

The permanent 40-record South Africa reference dataset is now guaranteed to be published at startup and synchronized through the JSON/R2/local publication pipeline. Unchanged reference posts are not rewritten on every restart.


## v0.6 — Source Hub and Global Harvest

### Permanent regional data

TodayInfo now ships with two permanent reference datasets:

```text
data/seeds/south-africa-opportunities-drafts.json
data/seeds/africa-opportunities-drafts.json
```

Together they provide 80 permanent reference opportunities. Startup deduplicates them, publishes them and synchronizes their JSON artifacts without rewriting unchanged records every restart.

### Source Hub

The admin dashboard now has a Source Hub for:

- DailyUpdate — deep fetch + useful related opportunity pages.
- ZA Bursaries — bursary detail fetch + linked bursary/scholarship pages.
- Psychometric Test — existing first-class topic fetch.
- Global Harvest — public job-feed and public ATS-board adapters.

### Global Harvest

Supported adapters:

```text
arbeitnow
jobicy
remoteok
lever
ashby
```

Example admin request:

```json
{
  "target": 1000,
  "maxAgeDays": 60,
  "providers": ["arbeitnow", "jobicy"],
  "autoPublish": true
}
```

Endpoint:

```text
POST /admin/api/harvest/global
```

The request may target up to 5,000 normalized records. Real source counts may be lower. TodayInfo deliberately does not fabricate records to hit a requested number.

### Smart related information

Published detail pages now calculate related content from deterministic structured similarity rather than AI. Manual choices still have the strongest priority, followed by shared organisation, country, type, categories, tags, field of study, education level and work mode.

### Content Library filters

The admin library can now filter simultaneously by country, source, type, publishing status and opportunity status, plus search and sorting.


## v0.7 — Categorized Source Hub and employee workspace

TodayInfo now keeps a structured source catalog instead of treating every source as one generic feed. The catalog contains **30 source entries across six categories**. v0.8 adds active SAnews and DSTI official-news feeds on top of the v0.7 source set.

Source Hub distinguishes between **active**, **discovery**, **credentials required**, and **licence required** integrations. Active public harvest support now includes Arbeitnow, Jobicy, Remote OK, Remotive, Lever, Ashby, Greenhouse, Workable, and SmartRecruiters. Sources that require credentials or commercial/licensing setup remain visible for planning but cannot be run as though they were configured.

Public frontend capability discovery:

```text
GET /api/v1/sources
GET /api/v1/meta
```

The public source catalog does not expose private crawler/import counts.

### CEO and employees

The `owner` role is displayed as **CEO / Owner** and retains complete access. The `editor` and new `content_worker` roles are publishing employees. They can review/clean Import Inbox records, edit content, publish content, and use media. They cannot access Source Hub, source fetching, Demand Queue, Analytics, Team, Settings, Audit, or the CEO overview.

These restrictions are enforced by server-side RBAC, not only by hidden navigation.

The Team view tracks employee productivity from audit events:

```text
cleaned     -> import.clean
promoted    -> import.promote
published   -> post.publish
edited      -> post.update
```

Counts are calculated by the system and are not manually editable by workers.


## v0.8 — Content engine, verified apply links and traffic atlas

This release keeps the existing v0.7 system and adds a higher-value content pipeline rather than a page-count-only scraper.

### Ten-at-a-time processing

Source Hub can fetch official news in batches of up to **10**. Import Inbox can also process up to **10** opportunity records at a time.

```text
POST /admin/api/harvest/news
POST /admin/api/imports/process-batch
```

The batch processor:
- checks candidate application URLs;
- rejects the source article itself as an application URL;
- follows redirects to the final public destination;
- stores verification metadata;
- builds plain-English application steps;
- recalculates content quality;
- only auto-publishes when the direct application route is verified and normal publishing checks pass.

### Official news summaries

Active official RSS sources:
- SAnews / Government Communication and Information System
- Department of Science, Technology and Innovation

TodayInfo does not mirror full source articles. It stores a short attributed plain-English summary, key points, audience guidance and the original source URL.

### R2 page artifacts

Every published content page still writes its own JSON object through the R2/local fail-safe publication pipeline.

When an opportunity contains substantive application instructions, TodayInfo also writes a separate guide artifact:

```text
published/{country}/guides/{slug}-how-to-apply.json
```

Public routes:

```text
GET /api/v1/guides
GET /api/v1/guides/:slug
```

If the guide would be too thin, TodayInfo keeps the application guidance inside the main opportunity page instead of creating a duplicate page.

### Recommendation families

Automatic recommendations are now constrained by useful content families:
- bursaries, scholarships and education resources recommend education/funding content;
- jobs, internships and learnerships recommend career content;
- news recommends news/editorial content.

This prevents unrelated recommendations caused only by overlapping tags.

### World traffic atlas

Analytics now aggregates country activity into continents and exposes:
- visitors
- total actions
- views
- reads
- searches
- application clicks
- downloads

The CEO Analytics screen includes a clickable world traffic atlas and continent summaries.

### SEO quality rule

TodayInfo is designed to add user value rather than create lightly transformed copies. Extra pages should exist because they provide useful structure such as verified application routes, eligibility, application steps, source attribution, location and clear summaries.


## v0.8.4 — Direct source fallback repair

TodayInfo first uses the existing source API for DailyUpdate and ZA Bursaries. If the source API and its internal fallback endpoints fail or return no usable records, the importer can use the approved public source domains directly.

Direct fallback is deliberately conservative:

- it extracts page title, short metadata, canonical/source URL, useful links and application-link candidates;
- it does **not** copy the full source article into the prepared TodayInfo draft;
- it caps the cleanliness score below auto-publish level;
- it disables auto-publishing for that fetch;
- the result stays in Import Inbox for Apo or an authorized editor to review, clean, promote and publish.

This fallback also supports Demand Queue URLs on the approved DailyUpdate and ZA Bursaries domains.

Source Hub continues to expose a source-specific publishing policy. The system does not use AI rewriting; narrative rewriting remains a human editorial action.


## v0.8.5 — No-AI source policy enforcement

This update keeps the v0.8.4 direct-source fallback and the earlier CEO/Import Inbox/Demand Queue repairs.

TodayInfo does **not** automatically rewrite narrative source articles.

- **DailyUpdate**: fetch facts, requirements and application links; a person edits the TodayInfo wording before publication.
- **ZA Bursaries**: fetch factual funding details, dates, eligibility and application routes; narrative wording requires human review.
- **SAnews / DSTI**: Source Hub uses **Discover 10** to create private editorial leads. It does not automatically create/publish rewritten news stories.
- **Structured job APIs / ATS boards**: rule-based 80%+ auto-publishing can continue when the source policy allows it and all normal hard checks pass.

Source policy is enforced server-side, so sending `autoPublish=true` cannot bypass a source marked manual review.

The Source Hub displays the publishing mode, rights/reuse state, AI rewriting state and auto-publish state for each source.


## v0.9.2 — Single VPS production deployment

TodayInfo now has one production hosting model:

```text
https://todayinfo.co.za
    ↓
Nginx serves /var/www/today/frontend directly

https://todayinfo.co.za/admin/
    ↓
Nginx reverse proxy
    ↓
Node.js on 127.0.0.1:3011

https://api.todayinfo.co.za/api/v1
    ↓
Nginx public API cache/reverse proxy
    ↓
Node.js on 127.0.0.1:3011
    ↓
Supabase/PostgreSQL + existing R2 bucket
```

Everything lives under:

```text
/var/www/today
```

The frontend has no Render fallback and does not require Cloudflare Pages. Nginx handles SPA routes such as `/jobs`, `/bursaries` and content-detail URLs with `try_files ... /index.html`, preventing frontend `Cannot GET` errors.

Production files:

```text
.env.production.example
deploy/VPS_DEPLOY.md
deploy/nginx/todayinfo.conf
deploy/systemd/todayinfo-api.service
deploy/update-vps.sh
frontend/data/api-config.js
frontend/README.md
```

### Caching

Performance uses layered caching:

- frontend in-memory/localStorage cache;
- Nginx static asset cache;
- Nginx public API proxy cache;
- Node `Cache-Control` + `X-Accel-Expires` cache hints;
- R2/local JSON publication fallback.

Admin, authentication, internal ingestion and writes remain `no-store`.

### HTTPS

After the three DNS records point at the VPS, Certbot can manage certificates for:

```text
todayinfo.co.za
www.todayinfo.co.za
api.todayinfo.co.za
```

See `deploy/VPS_DEPLOY.md` for the exact Nginx/Certbot steps.

### Owner password

Keep the real password out of Git. Set `SEED_ADMIN_PASSWORD` in the private VPS `.env`, then run:

```bash
npm run seed:admin
```

The production seed script refuses the password `admin`.

### R2

The existing R2 publishing layer is unchanged:

```env
R2_BUCKET=todayinfo
```

Moving the website to the VPS does not require an R2 content migration.



## v0.9.5 — VPS port 3009

The canonical VPS deployment now matches the live server layout:

```text
/opt/filebrowser/today
127.0.0.1:3009
https://todayinfo.co.za
https://todayinfo.co.za/admin/
https://api.todayinfo.co.za/api/v1
```

Install the VPS service and Nginx configuration:

```bash
cd /opt/filebrowser/today
APP_DIR=/opt/filebrowser/today APP_PORT=3009 bash deploy/install-vps.sh
```

Later updates:

```bash
cd /opt/filebrowser/today
APP_DIR=/opt/filebrowser/today APP_PORT=3009 bash deploy/update-vps.sh
```

The updater supports servers without Git by downloading the GitHub `main` archive and preserving the private `.env`, local data, uploads and runtime queues.

R2 publishing/storage is unchanged.


## v0.9.6 — Dual-port VPS frontend and API

The whole project still lives in one folder, but production now supports two independent Node processes:

```text
todayinfo.co.za + /admin  -> 127.0.0.1:3011
api.todayinfo.co.za       -> 127.0.0.1:3009
```

Start them with:

```bash
npm run start:api
npm run start:frontend
```

The frontend process serves the public SPA and the existing admin dashboard. It includes SPA fallback so extension-free public routes do not return `Cannot GET`.

The admin dashboard uses `https://api.todayinfo.co.za/admin/api` when it is served from `todayinfo.co.za`. Credentialed CORS and CSRF remain enforced by the API.

Production environment additions:

```env
PORT=3009
FRONTEND_PORT=3011
FRONTEND_HOST=127.0.0.1
PUBLIC_SITE_ORIGIN=https://todayinfo.co.za
PUBLIC_API_ORIGIN=https://api.todayinfo.co.za
ADMIN_ALLOWED_ORIGINS=https://todayinfo.co.za,https://www.todayinfo.co.za
```

Caching:
- frontend assets: one-day browser cache + stale-while-revalidate;
- SPA HTML: revalidated;
- admin UI: no-store;
- public API: existing cache headers remain;
- published JSON: existing R2/local fallback remains unchanged.

Your Nginx/Certbot configuration is intentionally left to you.
