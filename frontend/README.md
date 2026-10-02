# TodayInfo public frontend — v0.9.1

This directory is the public static SPA for **https://todayinfo.co.za**.

It preserves the existing TodayInfo visual system and consumes only published data from the managed API.

## Production layout

Recommended:

- Cloudflare Pages: `todayinfo.co.za`
- Primary API: `https://api.todayinfo.co.za/api/v1`
- Temporary fallback API: `https://todayinfos.onrender.com/api/v1`
- VPS Node process: `127.0.0.1:3009`
- Admin: `https://api.todayinfo.co.za/admin/`

The Cloudflare Pages project should use the repository root and **frontend** as the output directory. No frontend build step is required.

## Runtime API switching

`data/api-config.js` contains the ordered API list. The browser tries the VPS API first and can use Render during migration or a temporary VPS outage.

GET requests also use a short memory cache and an expiring browser stale cache, so a brief API restart does not automatically blank previously loaded public pages.

## SPA / no more Cannot GET

`_redirects` sends extension-free frontend routes to `index.html`.

Examples:

- `/jobs`
- `/za/jobs/example-job`
- `/bursaries/example-bursary`
- `/guides/example-how-to-apply`

If the whole project is moved to one VPS later, set:

```env
SERVE_FRONTEND=true
FRONTEND_DIR=frontend
```

The Node server then provides the same SPA fallback.

## Caching

- HTML: revalidate.
- API runtime config: 60 seconds.
- CSS/JS/assets: one hour in the browser with stale revalidation.
- API public GET responses: cache headers are controlled by the backend.
- Personalized/admin/auth/write requests are not shared-cache content.
- The frontend keeps a short memory cache and can use recently cached public JSON during a temporary API outage.

## Files

```text
frontend/
  index.html
  privacy.html
  _redirects
  _headers
  robots.txt
  sitemap.xml
  data/api-config.js
  assets/app-v6.js
  assets/styles.css
  assets/readability.css
  assets/api-v6.css
  assets/favicon.svg
  assets/og-card.svg
```

No R2 bucket name, object-key convention, database, import pipeline, or admin publishing workflow is changed by this frontend deployment.
