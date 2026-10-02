#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/today}"
cd "$APP_DIR"

git pull --ff-only
npm ci --omit=dev

sudo systemctl restart todayinfo-api
sudo nginx -t
sudo systemctl reload nginx

curl --fail --silent --show-error http://127.0.0.1:3011/health
printf '\nTodayInfo update complete.\n'
