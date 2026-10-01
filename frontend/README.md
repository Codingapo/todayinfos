# TodayInfo Frontend — API v0.8+ Edition

This is the existing lightweight TodayInfo frontend, upgraded to consume the current managed TodayInfo API while preserving the existing visual style, dark mode, SPA routing, HTML/CSS/JavaScript architecture and API-only publishing model.

## API

Configured in `data/api-config.js`:

```text
https://todayinfos.onrender.com/api/v1
```

The frontend never reads raw imports or database records. It consumes only published public API responses.

## API features now consumed

- `/site` and `/meta`
- `/posts`, `/latest` frontend view
- `/bursaries`
- `/scholarships`
- `/jobs`
- `/internships`
- `/learnerships`
- `/opportunities`
- `/news`
- `/trending`
- `/personalized?visitor_id=...`
- `/search` with structured filters and visitor-aware ranking
- `/facets`
- `/countries` and `/locations`
- country-prefixed collection/detail routes such as `/za/bursaries` and `/za/jobs/:slug`
- country/category news detail routes such as `/za/news/education/:slug`
- `/categories` and `/tags`
- `/guides` and `/guides/:slug`
- `/sources`
- `/redirect/:slug`
- `/analytics/events`

## Frontend routes

Core routes:

```text
/
/latest
/bursaries
/scholarships
/jobs
/internships
/learnerships
/opportunities
/news
/trending
/for-you
/search
/explore
/categories
/tags
/countries
/sources
/guides
```

Country-aware routes:

```text
/za
/za/bursaries
/za/jobs
/za/news
/za/bursaries/:slug
/za/jobs/:slug
/za/news/:category/:slug
/za/guides/:slug
```

The frontend also preserves older compatibility routes such as `/bursary/:slug`, `/article/:slug`, `/topic/:slug`, `/category/:slug` and `/page/:slug`.

## Important integration behavior

### API-owned paths

Cards use `record.path` returned by the API whenever possible. This keeps the frontend aligned with country-aware SEO paths without reconstructing URLs from database assumptions.

### Search

The search screen consumes API facets for:

- country
- region
- category
- organisation
- field of study
- work mode

The browser sends its anonymous TodayInfo `visitor_id` to `/search`, allowing the backend to record search intent and return structured relevance ranking.

### Analytics + Demand Queue

Related/recommended links use the exact tracking payload returned by the API:

```text
event_type
post_id
target_url
target_title
target_type
```

This means external missing-content clicks can enter the backend Demand Queue correctly. The frontend also sends view, read, application click, download and tag click events.

### Application links

Opportunity pages display whether the application destination was verified by the API. If a substantive application guide exists, the frontend links to the guide route.

### Application guides

The backend may store a guide at a country-aware frontend path such as:

```text
/za/guides/example-bursary-how-to-apply
```

The frontend maps that SEO route to the API endpoint:

```text
/api/v1/guides/example-bursary-how-to-apply
```

### Sources

`/sources` renders the public categorized source catalog and publishing policy metadata. Private crawler/import counts are not expected or displayed.

### Resilience

The homepage uses graceful optional-endpoint fallbacks. If an optional endpoint such as personalized content or guides temporarily fails, the rest of the homepage can still render from published content.

## Local development

No Node build is required for the frontend itself.

```bash
python -m http.server 8080
```

Open:

```text
http://localhost:8080
```

`_redirects` keeps client-side routes on `index.html` on compatible static hosting platforms such as Cloudflare Pages.

## Files

```text
index.html
assets/styles.css          existing TodayInfo design
assets/readability.css     existing long-form readability rules
assets/api-v6.css          v0.8+ API-specific responsive additions
assets/app-v6.js           current API-integrated application
assets/favicon.svg
assets/og-card.svg
data/api-config.js
_redirects
robots.txt
sitemap.xml
privacy.html
```