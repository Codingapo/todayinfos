# Build Status — v0.9.2 Single VPS Consolidation

This release consolidates the existing TodayInfo frontend, admin and API onto one VPS without changing the existing R2 bucket or database architecture.

## Production layout

- Project folder: `/var/www/today`
- Frontend: `https://todayinfo.co.za`
- Admin: `https://todayinfo.co.za/admin/`
- API: `https://api.todayinfo.co.za/api/v1`
- Node listener: `127.0.0.1:3011`
- Nginx serves the static frontend directly.
- Nginx proxies admin and API traffic to Node.
- Certbot manages HTTPS for the site and API hostnames.

## Removed hosting dependencies

- Cloudflare Pages is not required.
- Render is not a frontend/API fallback.
- Frontend runtime config uses the VPS API only.
- Cloudflare-specific CDN cache response headers were removed.

Cloudflare **R2 remains in use** as the existing published JSON/file storage layer.

## Routing

Nginx SPA fallback serves `frontend/index.html` for extension-free public routes, including jobs, bursaries, country routes, detail pages and guides. This prevents public `Cannot GET` errors.

Admin remains a Node application and is proxied at `/admin/`.

## Caching

- Frontend browser/localStorage cache remains.
- Nginx caches frontend assets.
- Nginx proxy-caches cacheable public API GET/HEAD responses.
- Node sends standard `Cache-Control` and Nginx `X-Accel-Expires` hints.
- Nginx may serve stale public cache during temporary backend errors.
- Personalized, admin, auth, internal-ingest and write traffic remain uncached.

## Environment

Both `.env.example` and `.env.production.example` now describe the same VPS production shape and use port 3011.

Real secrets remain private in `/var/www/today/.env`.

## Existing application behavior

The content/import/source/R2/database/admin/employee logic is retained. This release is a deployment consolidation, not a rebuild.
