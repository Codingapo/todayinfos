# TodayInfo — VPS dual-port deployment

TodayInfo now runs as two Node processes from the same project folder:

```text
Public frontend + /admin: 127.0.0.1:3011
API + admin API:          127.0.0.1:3009
```

Public domains:

```text
https://todayinfo.co.za
https://todayinfo.co.za/admin/
https://api.todayinfo.co.za
```

You said you will maintain your own Nginx/Certbot configuration, so the repository does not require Nginx to serve static frontend files. Your reverse proxy only needs to send the public domain to 3011 and the API domain to 3009.

Cloudflare R2 remains the published JSON/file storage layer.

## Environment

```env
NODE_ENV=production
PORT=3009
FRONTEND_PORT=3011
FRONTEND_HOST=127.0.0.1

APP_ORIGIN=https://todayinfo.co.za
PUBLIC_SITE_ORIGIN=https://todayinfo.co.za
PUBLIC_API_ORIGIN=https://api.todayinfo.co.za
ADMIN_ALLOWED_ORIGINS=https://todayinfo.co.za,https://www.todayinfo.co.za

SERVE_FRONTEND=false
FRONTEND_DIR=frontend
DATA_STORE=postgres
R2_BUCKET=todayinfo
```

Keep the real secrets only in `/opt/filebrowser/today/.env`.

## Database connectivity check

Before starting production, run:

```bash
npm run doctor
```

If an IPv4-only VPS reports `ENETUNREACH` when connecting to a Supabase direct database host, use the Supabase **Session pooler** connection string:

```env
DATABASE_URL_IPV4=postgresql://...
PORT=3009
```

TodayInfo prefers `DATABASE_URL_IPV4` when it is configured.

## Start

From the project folder:

```bash
cd /opt/filebrowser/today
npm ci --omit=dev

npm run start:api
# separate terminal/process
npm run start:frontend
```

For long-running production processes, the repository contains optional systemd unit examples:

```text
deploy/systemd/todayinfo-api.service
deploy/systemd/todayinfo-frontend.service
```

## Local checks before Nginx

```bash
curl http://127.0.0.1:3009/health
curl http://127.0.0.1:3009/api/v1/meta
curl http://127.0.0.1:3011/__frontend_health
curl -I http://127.0.0.1:3011/
curl -I http://127.0.0.1:3011/jobs
curl -I http://127.0.0.1:3011/admin/
```

The `/jobs` and `/admin/` checks should return HTML rather than `Cannot GET`.

## Admin cross-domain behavior

The dashboard is served from `todayinfo.co.za` but its authenticated API requests go to `api.todayinfo.co.za/admin/api`.

The API has credentialed CORS specifically for `ADMIN_ALLOWED_ORIGINS`; public API CORS remains separate. Admin cookies remain attached only to the API host and are sent with `credentials: include`.

## Caching

Frontend process:
- SPA HTML: revalidated;
- admin UI: no-store;
- `assets/*`: one-day browser cache with stale-while-revalidate;
- strong ETags and compression.

API process:
- existing public GET cache headers remain;
- personalized/status/admin/write traffic remains no-store;
- R2/local fallback remains the source of published JSON resilience.

## R2 remains unchanged

This deployment does not replace or remove:
- R2 bucket/credentials;
- published page JSON;
- R2/local publication retry;
- Supabase/PostgreSQL indexes and analytics;
- Import Inbox;
- Demand Queue;
- Source Hub;
- CEO/employee permissions.

## Updating

Pull/update the repository, run the release checks, then restart both processes:

```bash
npm ci --omit=dev
npm run check
npm test

sudo systemctl restart todayinfo-api
sudo systemctl restart todayinfo-frontend
```

Your own Nginx and Certbot configuration can remain outside the repository.
