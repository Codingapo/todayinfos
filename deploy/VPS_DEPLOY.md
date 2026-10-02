# TodayInfo — single VPS production deployment

This is the production layout for **todayinfo.co.za** and **api.todayinfo.co.za**.

Cloudflare Pages and the Render fallback are not required. The existing **R2 bucket remains unchanged** and is still used by the backend for published JSON/files.

## Final folder layout

Put the whole Git repository in one folder:

```text
/var/www/today/
  frontend/         # public website served directly by Nginx
  public/admin/     # admin app served by Node through /admin/
  src/              # TodayInfo API/backend
  data/             # local published/fallback/queue files
  uploads/          # local upload fallback
  deploy/           # Nginx + systemd files
  migrations/
  .env              # private production secrets
  package.json
```

Production URLs:

```text
https://todayinfo.co.za              public frontend
https://todayinfo.co.za/admin/       CEO/employee dashboard
https://api.todayinfo.co.za/api/v1   public API
http://127.0.0.1:3011                private Node listener
```

## 1. DNS

Point these DNS records to the VPS public IP:

```text
A  todayinfo.co.za      YOUR_VPS_IP
A  www.todayinfo.co.za  YOUR_VPS_IP
A  api.todayinfo.co.za  YOUR_VPS_IP
```

Wait until all three names resolve to the VPS.

## 2. Install VPS packages

Use Ubuntu/Debian packages for Nginx, Git and curl. Install Node.js 20 or newer.

Example:

```bash
sudo apt update
sudo apt install -y nginx git curl
node -v
npm -v
```

For Certbot, use the installation method recommended for your OS by certbot.eff.org. The official Nginx plugin can install the certificate and edit Nginx automatically.

## 3. Clone everything into one folder

```bash
sudo mkdir -p /var/www/today
sudo chown -R "$USER":"$USER" /var/www/today

git clone https://github.com/Codingapo/todayinfos.git /var/www/today
cd /var/www/today

npm ci --omit=dev
```

If the repository is already there:

```bash
cd /var/www/today
git pull --ff-only
npm ci --omit=dev
```

## 4. Create the private .env

```bash
cd /var/www/today
cp .env.production.example .env
nano .env
```

Keep these production values:

```env
NODE_ENV=production
PORT=3011
APP_ORIGIN=https://todayinfo.co.za
PUBLIC_SITE_ORIGIN=https://todayinfo.co.za
PUBLIC_API_ORIGIN=https://api.todayinfo.co.za
SERVE_FRONTEND=false
FRONTEND_DIR=frontend
DATA_STORE=postgres
R2_BUCKET=todayinfo
```

Then fill in:

- `JWT_SECRET`
- `DATABASE_URL_IPV4` with the **Supabase Session pooler** connection string when the VPS is IPv4-only
- your existing R2 credentials
- `TODAYINFO_INGEST_KEY`
- optional Resend credentials
- Apo/CEO seed email + password when rotating the login

Never commit the real `.env`.

## 5. Change/seed Apo's password

Set a private value in:

```env
SEED_ADMIN_USERNAME=apo
SEED_ADMIN_PASSWORD=YOUR_NEW_PASSWORD
SEED_ADMIN_EMAIL=YOUR_EMAIL
```

Then run:

```bash
cd /var/www/today
npm run seed:admin
```

The production seed script refuses the password `admin`.

After seeding, you may remove `SEED_ADMIN_PASSWORD` from the real `.env`.

## 6. Prepare writable folders

Node only needs write access to local fallback/queue/upload folders.

```bash
cd /var/www/today
sudo mkdir -p data uploads /var/cache/nginx/todayinfo
sudo chown -R www-data:www-data data uploads
sudo chown -R www-data:www-data /var/cache/nginx/todayinfo
sudo chmod -R u+rwX,g+rwX data uploads
```

The frontend and source code can remain read-only to the Node service.

## 7. Install the systemd service

```bash
sudo cp /var/www/today/deploy/systemd/todayinfo-api.service /etc/systemd/system/todayinfo-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now todayinfo-api
sudo systemctl status todayinfo-api
```

Local checks:

```bash
curl http://127.0.0.1:3011/health
curl http://127.0.0.1:3011/api/v1/meta
```

If this fails, inspect logs:

```bash
sudo journalctl -u todayinfo-api -n 100 --no-pager
sudo journalctl -u todayinfo-api -f
```

## 8. Install the combined Nginx config

```bash
sudo cp /var/www/today/deploy/nginx/todayinfo.conf /etc/nginx/sites-available/todayinfo
sudo ln -sf /etc/nginx/sites-available/todayinfo /etc/nginx/sites-enabled/todayinfo

# Optional: remove the default welcome site.
sudo rm -f /etc/nginx/sites-enabled/default

sudo nginx -t
sudo systemctl reload nginx
```

Before HTTPS, test:

```bash
curl -I http://todayinfo.co.za/
curl -I http://todayinfo.co.za/jobs
curl -I http://todayinfo.co.za/admin/
curl http://api.todayinfo.co.za/health
```

The public Nginx site uses SPA fallback:

```nginx
try_files $uri $uri/ /index.html;
```

so routes such as `/jobs`, `/bursaries`, `/za/jobs/example-job`, and `/guides/example-how-to-apply` do not produce `Cannot GET`.

## 9. HTTPS with Certbot

Once DNS resolves correctly, use the Certbot Nginx plugin.

Typical command:

```bash
sudo certbot --nginx \
  -d todayinfo.co.za \
  -d www.todayinfo.co.za \
  -d api.todayinfo.co.za
```

Choose the HTTPS redirect option when prompted.

Then verify automatic renewal:

```bash
sudo certbot renew --dry-run
```

Final checks:

```bash
curl -I https://todayinfo.co.za/
curl -I https://todayinfo.co.za/jobs
curl -I https://todayinfo.co.za/admin/
curl https://api.todayinfo.co.za/health
curl https://api.todayinfo.co.za/api/v1/meta
```

## 10. Caching / speed

The VPS has several cache layers:

1. **Nginx static cache headers** for frontend assets.
2. **Nginx proxy cache** for public API GET/HEAD responses.
3. **Node Cache-Control + X-Accel-Expires** cache hints.
4. **Frontend memory/localStorage stale cache**.
5. **R2/local published JSON fallback** in the existing backend.

Nginx does not force-cache admin/auth/write requests. The backend sends `no-store` for personalized/admin/write paths, and Nginx respects those headers.

To inspect API cache behavior:

```bash
curl -I "https://api.todayinfo.co.za/api/v1/posts?limit=5"
```

Look for:

```text
X-TodayInfo-Cache: MISS
X-TodayInfo-Cache: HIT
```

on repeated requests.

## 11. R2 is not removed

Only the website hosting moved to the VPS.

These remain unchanged:

- R2 bucket name and credentials
- published JSON object structure
- publication retry queue
- Supabase/PostgreSQL tracking
- multiple-database support
- existing TodayInfo content/import logic

## 12. Updating the live VPS later

```bash
cd /var/www/today

sudo systemctl stop todayinfo-api
sudo -u "$USER" git pull --ff-only
sudo -u "$USER" npm ci --omit=dev
sudo systemctl start todayinfo-api

sudo nginx -t
sudo systemctl reload nginx

curl https://api.todayinfo.co.za/health
```

If a future release includes a database migration, review the migration before running it against production.


## Database IPv6 / ENETUNREACH troubleshooting

If the API log contains an error similar to:

```text
connect ENETUNREACH 2a05:...:5432
```

the application is trying to reach an IPv6-only PostgreSQL address from a VPS that has no working IPv6 route.

For Supabase on an IPv4-only VPS, do **not** use the direct URL that looks like:

```text
postgresql://postgres:PASSWORD@db.PROJECT_REF.supabase.co:5432/postgres
```

Instead:

1. Open **Supabase Dashboard -> Connect**.
2. Choose **Session pooler**.
3. Copy the complete connection string exactly as Supabase shows it.
4. Put it in the private VPS environment:

```env
DATABASE_URL_IPV4=postgresql://postgres.PROJECT_REF:PASSWORD@YOUR_POOLER_HOST:5432/postgres
DATABASE_URL=
DATABASE_SSL=true
DATABASE_CONNECT_TIMEOUT_MS=8000
```

Do not guess the pooler hostname; copy it from the Supabase Connect dialog.

Then run:

```bash
cd /var/www/today
npm run doctor
sudo systemctl restart todayinfo-api
sudo journalctl -u todayinfo-api -n 80 --no-pager
curl http://127.0.0.1:3011/health
```

`npm run doctor` now prints the selected database host plus its IPv4 (A) and IPv6 (AAAA) DNS results. If it identifies a Supabase direct host without `DATABASE_URL_IPV4`, it prints a warning.

### Port mismatch

The production Nginx file proxies to:

```text
127.0.0.1:3011
```

The private VPS `.env` must therefore contain:

```env
PORT=3011
```

If the Node log says `http://localhost:3009`, edit `/var/www/today/.env`, change the port to 3011, and restart the service.

### DNS check

Before running Certbot, all three public names must resolve to the VPS public IPv4 address:

```bash
getent ahostsv4 todayinfo.co.za
getent ahostsv4 www.todayinfo.co.za
getent ahostsv4 api.todayinfo.co.za
```

If any command returns nothing, fix the DNS **A** record first. Certbot and the public site cannot work until DNS is visible.
