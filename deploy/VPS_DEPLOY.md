# TodayInfo production deployment

This deployment keeps the existing Cloudflare R2 bucket and database architecture unchanged.

## Target layout

- Public frontend: `https://todayinfo.co.za` on Cloudflare Pages.
- API/admin: `https://api.todayinfo.co.za` on the VPS.
- Node binds to port `3009`.
- Nginx is the public reverse proxy.
- Certbot manages the TLS certificate for the API hostname.
- Cloudflare Pages manages TLS for the public frontend.

## 1. Prepare the VPS

Install Node.js 20+, Nginx, Git and Certbot using the packages appropriate for your Linux distribution.

Clone/update the repository into:

```bash
sudo mkdir -p /var/www/todayinfos
sudo chown -R "$USER":"$USER" /var/www/todayinfos
git clone https://github.com/Codingapo/todayinfos.git /var/www/todayinfos
cd /var/www/todayinfos
npm ci --omit=dev
```

## 2. Create the real .env

```bash
cd /var/www/todayinfos
cp .env.production.example .env
nano .env
```

Fill in the real values. Keep:

```env
NODE_ENV=production
PORT=3009
APP_ORIGIN=https://api.todayinfo.co.za
PUBLIC_SITE_ORIGIN=https://todayinfo.co.za
PUBLIC_API_ORIGIN=https://api.todayinfo.co.za
R2_BUCKET=todayinfo
```

Do not commit `.env`.

## 3. Seed or rotate Apo's owner password

Set `SEED_ADMIN_PASSWORD` in the private VPS `.env`, then run:

```bash
cd /var/www/todayinfos
npm run seed:admin
```

The production seed script refuses the password `admin`.

After the password is seeded, you may remove `SEED_ADMIN_PASSWORD` from the environment file if you prefer.

## 4. Install the systemd unit

```bash
sudo cp /var/www/todayinfos/deploy/systemd/todayinfo-api.service /etc/systemd/system/todayinfo-api.service
sudo chown -R www-data:www-data /var/www/todayinfos
sudo systemctl daemon-reload
sudo systemctl enable --now todayinfo-api
sudo systemctl status todayinfo-api
```

Local health check:

```bash
curl http://127.0.0.1:3009/health
```

## 5. Configure Nginx

```bash
sudo cp /var/www/todayinfos/deploy/nginx/todayinfo-api.conf /etc/nginx/sites-available/todayinfo-api
sudo ln -s /etc/nginx/sites-available/todayinfo-api /etc/nginx/sites-enabled/todayinfo-api
sudo nginx -t
sudo systemctl reload nginx
```

Point the DNS record for `api.todayinfo.co.za` to the VPS IP before requesting the certificate.

## 6. Get HTTPS with Certbot

Once the DNS record resolves to the VPS:

```bash
sudo certbot --nginx -d api.todayinfo.co.za
```

Verify:

```bash
curl https://api.todayinfo.co.za/health
curl https://api.todayinfo.co.za/api/v1/meta
```

## 7. Deploy the frontend to Cloudflare Pages

Use the TodayInfo Cloudflare Pages ZIP supplied with this release.

In Cloudflare:

1. Workers & Pages → create/select the Pages project.
2. Upload the static frontend or connect a frontend repository.
3. Add the custom domain `todayinfo.co.za` from Pages → Custom domains.
4. If desired, add `www.todayinfo.co.za` and redirect it to the apex.
5. Keep `data/api-config.js` pointing to:
   - primary: `https://api.todayinfo.co.za/api/v1`
   - fallback during migration: `https://todayinfos.onrender.com/api/v1`

The frontend contains `_redirects`, so routes such as `/jobs`, `/bursaries` and article pages resolve to the SPA instead of returning "Cannot GET".

## 8. Caching

The Node API sends cache headers only for public GET requests.

- public lists/details: short browser cache + Cloudflare edge cache;
- site/meta/source taxonomy: longer edge cache;
- stale public data may be served briefly during an upstream error;
- personalized requests are private/no-store;
- admin, auth, ingestion, health and all writes are no-store;
- frontend versioned assets are cached for one year by Cloudflare Pages;
- frontend HTML and API config always revalidate.

This means edits become visible quickly while repeat traffic is much faster.

## 9. Updating later

```bash
cd /var/www/todayinfos
sudo -u www-data git pull --ff-only
sudo -u www-data npm ci --omit=dev
sudo systemctl restart todayinfo-api
sudo systemctl status todayinfo-api
```

If a migration is part of a future release, review it before applying it to your production databases.
