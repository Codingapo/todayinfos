# TodayInfo — VPS three-port deployment

TodayInfo now runs as three Node processes from the same project folder:

```text
Public frontend:         127.0.0.1:3011
Admin login/dashboard:   127.0.0.1:3020
API + admin API:          127.0.0.1:3009
```

Public domains:

```text
https://todayinfo.co.za
https://admin.todayinfo.co.za
https://api.todayinfo.co.za
```

Nginx must keep the three processes separate:

- `todayinfo.co.za/*` → public frontend service on **3011**
- `admin.todayinfo.co.za/*` → dedicated admin service on **3020**
- `api.todayinfo.co.za/api/v1/*` → API service on **3009**
- `api.todayinfo.co.za/admin/api/*` → API service on **3009** with no shared cache

Do **not** redirect `api.todayinfo.co.za/admin/api/*` to the main domain. The browser dashboard deliberately calls the credentialed API subdomain.

Cloudflare R2 remains the published JSON/file storage layer.

## Environment

```env
NODE_ENV=production
PORT=3009
FRONTEND_PORT=3011
FRONTEND_HOST=127.0.0.1
ADMIN_PORT=3020
ADMIN_HOST=127.0.0.1
ADMIN_ORIGIN=https://admin.todayinfo.co.za

APP_ORIGIN=https://todayinfo.co.za
PUBLIC_SITE_ORIGIN=https://todayinfo.co.za
PUBLIC_API_ORIGIN=https://api.todayinfo.co.za
ADMIN_ALLOWED_ORIGINS=https://admin.todayinfo.co.za,https://todayinfo.co.za,https://www.todayinfo.co.za

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
# separate terminal/process
npm run start:admin
```

For long-running production processes, the repository contains optional systemd unit examples:

```text
deploy/systemd/todayinfo-api.service
deploy/systemd/todayinfo-frontend.service
deploy/systemd/todayinfo-admin.service
```

## Local checks before Nginx

```bash
curl http://127.0.0.1:3009/health
curl http://127.0.0.1:3009/api/v1/meta
curl http://127.0.0.1:3011/__frontend_health
curl -I http://127.0.0.1:3011/
curl -I http://127.0.0.1:3011/jobs
curl http://127.0.0.1:3020/__admin_health
curl -I http://127.0.0.1:3020/
```

The `/jobs` check on 3011 and the admin root check on 3020 should return HTML rather than `Cannot GET`.

## Admin cross-domain behavior

The dashboard is served from `admin.todayinfo.co.za` on the dedicated 3020 process, while its authenticated API requests go to `api.todayinfo.co.za/admin/api`.

The API has credentialed CORS specifically for `ADMIN_ALLOWED_ORIGINS`; public API CORS remains separate. Admin cookies remain attached only to the API host and are sent with `credentials: include`.

## Caching

Frontend process:
- public SPA HTML: revalidated;
- `assets/*`: one-day browser cache with stale-while-revalidate;
- strong ETags and compression.

Admin process:
- login/dashboard HTML: no-store;
- admin JS/CSS: private revalidation;
- strict CSP permits only the TodayInfo API connection required for login/dashboard use.

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

Pull/update the repository, run the release checks, then restart all three processes:

```bash
npm ci --omit=dev
npm run check
npm test

sudo systemctl restart todayinfo-api
sudo systemctl restart todayinfo-frontend
sudo systemctl restart todayinfo-admin
```

Your own Nginx and Certbot configuration can remain outside the repository.


## CSP / browser console

The dedicated admin process sends a Content Security Policy that permits:

```text
connect-src 'self' https://api.todayinfo.co.za
```

That is required because the admin UI is loaded from `admin.todayinfo.co.za` while authenticated admin API calls go to `api.todayinfo.co.za`.

If the browser reports:

```text
Connecting to https://api.todayinfo.co.za ... violates connect-src 'self'
```

then `admin.todayinfo.co.za` is not being served by the dedicated admin process on 3020, or the active Nginx configuration is stale.

The repository does not load `static.cloudflareinsights.com`. If Cloudflare injects a Browser Insights/Web Analytics beacon while the domain is proxied through Cloudflare, the strict TodayInfo CSP may block it. Keep it blocked or disable Browser Insights/Web Analytics in Cloudflare. Do not weaken `script-src` just to allow an analytics beacon.

## Verify the active reverse proxy

After copying/updating Nginx configuration:

```bash
sudo nginx -t
sudo systemctl reload nginx

curl http://127.0.0.1:3011/__frontend_health
curl http://127.0.0.1:3020/__admin_health
curl -I http://127.0.0.1:3020/
curl http://127.0.0.1:3009/health

curl -I https://admin.todayinfo.co.za/
curl -I https://api.todayinfo.co.za/health
```

Inspect the frontend CSP:

```bash
curl -sI https://admin.todayinfo.co.za/ | grep -i content-security-policy
```

It must include `https://api.todayinfo.co.za` in `connect-src`.
