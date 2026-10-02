# TodayInfo — VPS deployment on port 3009

Canonical production layout:

```text
/opt/filebrowser/today/
  frontend/
  public/admin/
  src/
  data/
  uploads/
  deploy/
  migrations/
  .env
  package.json
```

Public URLs:

```text
https://todayinfo.co.za
https://todayinfo.co.za/admin/
https://api.todayinfo.co.za/api/v1
```

Private Node listener:

```text
http://127.0.0.1:3009
```

Cloudflare R2 remains the published JSON/file storage layer. This VPS setup changes hosting only.

## 1. Production .env

Inside:

```text
/opt/filebrowser/today/.env
```

keep:

```env
NODE_ENV=production
PORT=3009
APP_ORIGIN=https://todayinfo.co.za
PUBLIC_SITE_ORIGIN=https://todayinfo.co.za
PUBLIC_API_ORIGIN=https://api.todayinfo.co.za
SERVE_FRONTEND=false
FRONTEND_DIR=frontend
DATA_STORE=postgres
R2_BUCKET=todayinfo
```

Fill in your real JWT, database, R2 and ingestion credentials. Never commit the real .env.

If the VPS is IPv4-only and Supabase direct PostgreSQL is unreachable, use the Session Pooler connection string in `DATABASE_URL_IPV4`.

## 2. Install dependencies

Required:

```bash
sudo apt update
sudo apt install -y nginx curl
node -v
npm -v
```

Git is optional because TodayInfo's updater can download the GitHub main-branch archive when Git is unavailable.

## 3. First production install

From your existing project folder:

```bash
cd /opt/filebrowser/today

APP_DIR=/opt/filebrowser/today \
APP_PORT=3009 \
bash deploy/install-vps.sh
```

The installer:

- keeps `.env` private;
- installs npm production packages;
- runs `npm run doctor`, syntax checks and tests;
- installs the systemd service;
- installs the Nginx site;
- starts Node through systemd;
- checks `http://127.0.0.1:3009/health`.

Check it:

```bash
sudo systemctl status todayinfo-api --no-pager
curl http://127.0.0.1:3009/health
curl http://127.0.0.1:3009/api/v1/meta
sudo nginx -t
```

Do not use `npm start` as the production process after systemd is installed. A manual `npm start` stops when you press Ctrl+C or close the terminal.

## 4. Nginx

The checked-in Nginx configuration uses:

```text
root /opt/filebrowser/today/frontend
proxy_pass http://127.0.0.1:3009
```

The public frontend uses SPA fallback:

```nginx
try_files $uri $uri/ /index.html;
```

so extension-free URLs such as `/jobs`, `/bursaries`, `/za/jobs/example` and guide pages load the frontend instead of producing `Cannot GET`.

Public API GET/HEAD responses use Nginx proxy caching. Admin/auth/write traffic is not shared-cached.

## 5. DNS and Cloudflare

If you want the VPS to be the origin with no Cloudflare proxy behavior, set these Cloudflare DNS records to **DNS only** (grey cloud):

```text
A  todayinfo.co.za
A  www.todayinfo.co.za
A  api.todayinfo.co.za
```

All should point to the VPS public IPv4.

Your earlier response header:

```text
server: cloudflare
```

means the orange-cloud proxy was still enabled.

For straightforward Certbot setup, DNS-only mode is the easiest while issuing/testing the certificate. You can decide later whether to re-enable the proxy.

Check DNS:

```bash
getent ahostsv4 todayinfo.co.za
getent ahostsv4 api.todayinfo.co.za
```

## 6. HTTPS

After DNS points to this VPS and Nginx works over HTTP:

```bash
sudo certbot --nginx \
  -d todayinfo.co.za \
  -d www.todayinfo.co.za \
  -d api.todayinfo.co.za
```

Then:

```bash
sudo certbot renew --dry-run
```

## 7. Future updates — Git is optional

Run:

```bash
cd /opt/filebrowser/today
APP_DIR=/opt/filebrowser/today APP_PORT=3009 bash deploy/update-vps.sh
```

If Git exists and the folder is a Git checkout, the updater uses `git pull --ff-only`.

If Git is missing, it downloads:

```text
https://github.com/Codingapo/todayinfos/archive/refs/heads/main.tar.gz
```

and replaces versioned application files while preserving:

- `.env`
- runtime data/fallback queues
- uploads
- production secrets

It then runs the release gate and restarts systemd + Nginx.

## 8. Troubleshooting a 502

A 502 means Nginx/Cloudflare reached the server layer but could not get a valid response from the Node origin.

Run these in order:

```bash
grep '^PORT=' /opt/filebrowser/today/.env
sudo systemctl status todayinfo-api --no-pager
sudo journalctl -u todayinfo-api -n 100 --no-pager
ss -ltnp | grep ':3009'
curl -v http://127.0.0.1:3009/health
sudo nginx -t
grep -R "127.0.0.1:30" /etc/nginx/sites-enabled /etc/nginx/sites-available
```

Every TodayInfo upstream should point to 3009.

If the systemd service is not installed yet:

```bash
cd /opt/filebrowser/today
APP_DIR=/opt/filebrowser/today APP_PORT=3009 bash deploy/install-vps.sh
```

## 9. Final checks

```bash
curl http://127.0.0.1:3009/health
curl -I https://todayinfo.co.za/
curl -I https://todayinfo.co.za/jobs
curl -I https://todayinfo.co.za/admin/
curl https://api.todayinfo.co.za/health
curl https://api.todayinfo.co.za/api/v1/meta
```

For cached public API responses, repeated requests should eventually show:

```text
X-TodayInfo-Cache: HIT
```

## 10. R2 is unchanged

The VPS deployment does not remove or replace:

- R2 bucket/credentials
- published page JSON
- publication retry queue
- Supabase/PostgreSQL tracking
- multiple-database reads
- Import Inbox/Source Hub/admin workflows
