# TodayInfo Control Center v0.2

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
