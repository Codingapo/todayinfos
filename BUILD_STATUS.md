# Build Status — v0.9.0 Production Online

TodayInfo v0.9 prepares the existing application for a split production deployment without changing the R2 bucket or content architecture.

## Production topology
- Public site: https://todayinfo.co.za on Cloudflare Pages.
- API/admin: https://api.todayinfo.co.za behind Nginx.
- Node API binds to port 3009.
- VPS process is managed by systemd.
- API TLS can be issued with Certbot/Nginx.
- Cloudflare Pages manages frontend TLS.

## Frontend
- Static SPA package keeps the existing TodayInfo visual design.
- Production API: https://api.todayinfo.co.za/api/v1.
- Temporary failover API: https://todayinfos.onrender.com/api/v1.
- SPA _redirects prevents direct routes such as /jobs and /bursaries from returning "Cannot GET".
- Versioned frontend assets use long immutable cache headers.
- HTML and API config always revalidate.
- Browser API cache persists successful GET responses and can serve stale data temporarily if both API origins are unavailable.

## API caching
- Public GETs: short browser cache with stale-while-revalidate.
- Cloudflare edge receives separate Cloudflare-CDN-Cache-Control TTLs.
- Site/meta/source taxonomy uses a longer edge TTL.
- Personalized public requests are no-store.
- Admin API, auth, internal ingestion, health and writes are no-store.
- Express strong ETags remain enabled for revalidation.

## Environment
- Default local/VPS port is 3009.
- .env.production.example contains placeholders only.
- Real .env stays ignored by Git.
- Apo owner password is set/rotated using npm run seed:admin and SEED_ADMIN_PASSWORD.
- Production seeding refuses password "admin".

## Storage
- R2 bucket remains: todayinfo.
- Existing R2 JSON page publishing, application guides, retry queues and local fallback remain unchanged.
- Existing Supabase/PostgreSQL federation remains unchanged.

## Deployment files
- deploy/nginx/todayinfo-api.conf
- deploy/systemd/todayinfo-api.service
- deploy/VPS_DEPLOY.md
- frontend/api-config.production.js
- frontend/README.md

The release must pass source syntax checks and the complete regression test suite before merge.
