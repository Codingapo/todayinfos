# TodayInfo Cloudflare Pages frontend

The v0.9 production frontend is a static SPA intended for Cloudflare Pages.

Production URLs:

- Site: https://todayinfo.co.za
- Primary API: https://api.todayinfo.co.za/api/v1
- Temporary API fallback: https://todayinfos.onrender.com/api/v1

The release ZIP contains:

- `index.html`
- `privacy.html`
- `assets/app-v09.js`
- existing TodayInfo CSS/readability styles
- `data/api-config.js`
- `_redirects` for SPA routes
- `_headers` for Cloudflare Pages caching/security headers
- `robots.txt`
- `sitemap.xml`

The runtime API address is deliberately kept in `data/api-config.js`, so moving the API does not require rebuilding the whole frontend.

Cloudflare Pages is static, so its `.env.example` is documentation only. Runtime values are in `data/api-config.js`.
