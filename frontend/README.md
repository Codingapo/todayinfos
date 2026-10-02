# TodayInfo public frontend — VPS deployment

This directory is the static frontend for **https://todayinfo.co.za**.

## Production layout

Everything lives inside one VPS project folder:

```text
/var/www/today/
  frontend/       <- Nginx serves this directly
  public/admin/   <- Node serves this through /admin/
  src/            <- API/backend
  data/           <- local fallback/queues
  uploads/        <- local upload fallback
  deploy/         <- Nginx + systemd configuration
  .env            <- private production settings
```

Production URLs:

- Frontend: `https://todayinfo.co.za`
- Admin: `https://todayinfo.co.za/admin/`
- API: `https://api.todayinfo.co.za/api/v1`
- Node listener: `127.0.0.1:3011`

The frontend has no external hosting/API fallback. Runtime API configuration is in `data/api-config.js`.

## SPA routing

Nginx uses:

```nginx
try_files $uri $uri/ /index.html;
```

so extension-free URLs such as `/jobs`, `/bursaries`, `/za/jobs/example` and `/guides/example-how-to-apply` load the SPA instead of returning `Cannot GET`.

## Caching

There are three cache layers:

1. Browser/localStorage cache in `assets/app-v6.js`.
2. Nginx static-file and public-API proxy cache.
3. Existing R2/local published JSON and fallback behavior in the backend.

Admin/auth/write requests are not shared-cache content.

## R2

R2 remains the published JSON/file storage layer. Moving the frontend to the VPS does not change your bucket name, object keys or credentials.
