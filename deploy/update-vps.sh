#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/today}"
cd "$APP_DIR"

printf 'Updating TodayInfo in %s\n' "$APP_DIR"
git pull --ff-only

# These files belonged to the old Cloudflare Pages deployment.
# They are intentionally absent from the VPS frontend. git pull cannot
# remove old untracked copies, so delete only these known obsolete files.
rm -f frontend/_redirects frontend/_headers

npm ci --omit=dev

printf '\nRunning TodayInfo release gate...\n'
npm run doctor
npm run check
npm test

printf '\nRestarting API and Nginx...\n'
sudo systemctl restart todayinfo-api
sudo nginx -t
sudo systemctl reload nginx

curl --fail --silent --show-error http://127.0.0.1:3011/health
printf '\nTodayInfo update complete.\n'
