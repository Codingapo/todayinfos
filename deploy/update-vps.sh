#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/filebrowser/today}"
REPO_ARCHIVE="${REPO_ARCHIVE:-https://github.com/Codingapo/todayinfos/archive/refs/heads/main.tar.gz}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "TodayInfo folder not found: $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

read_env_value(){
  local key="$1"
  if [[ -f .env ]]; then
    awk -F= -v key="$key" '$1==key{gsub(/[[:space:]\r]/,"",$2); print $2}' .env | tail -n1
  fi
}

APP_PORT="${APP_PORT:-$(read_env_value PORT)}"
APP_PORT="${APP_PORT:-3009}"
FRONTEND_PORT="${FRONTEND_PORT:-$(read_env_value FRONTEND_PORT)}"
FRONTEND_PORT="${FRONTEND_PORT:-3011}"
ADMIN_PORT="${ADMIN_PORT:-$(read_env_value ADMIN_PORT)}"
ADMIN_PORT="${ADMIN_PORT:-3020}"

printf 'Updating TodayInfo in %s (API %s, frontend %s, admin %s)\n' "$APP_DIR" "$APP_PORT" "$FRONTEND_PORT" "$ADMIN_PORT"

if command -v git >/dev/null 2>&1 && [[ -d .git ]]; then
  git pull --ff-only
else
  echo "Git is not available here; using the GitHub main-branch archive instead."
  command -v curl >/dev/null 2>&1 || { echo "curl is required when git is unavailable." >&2; exit 1; }
  command -v tar >/dev/null 2>&1 || { echo "tar is required when git is unavailable." >&2; exit 1; }

  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  curl --fail --location --silent --show-error "$REPO_ARCHIVE" -o "$tmp/todayinfo.tar.gz"
  mkdir -p "$tmp/source"
  tar -xzf "$tmp/todayinfo.tar.gz" -C "$tmp/source" --strip-components=1

  # Replace application code while preserving production state/secrets.
  for item in src public frontend scripts deploy migrations tests package.json package-lock.json README.md BUILD_STATUS.md .env.example .env.production.example; do
    if [[ -e "$tmp/source/$item" ]]; then
      rm -rf "$APP_DIR/$item"
      cp -a "$tmp/source/$item" "$APP_DIR/$item"
    fi
  done

  # Seed files are versioned, but other data/queues remain local and persistent.
  if [[ -d "$tmp/source/data/seeds" ]]; then
    mkdir -p "$APP_DIR/data"
    rm -rf "$APP_DIR/data/seeds"
    cp -a "$tmp/source/data/seeds" "$APP_DIR/data/seeds"
  fi
fi

# Remove obsolete Cloudflare Pages files if an old frontend copy left them behind.
rm -f frontend/_redirects frontend/_headers

# Keep the VPS listener aligned with Nginx.
if [[ -f .env ]]; then
  if grep -q '^PORT=' .env; then
    sed -i "s/^PORT=.*/PORT=$APP_PORT/" .env
  else
    printf '\nPORT=%s\n' "$APP_PORT" >> .env
  fi
  if grep -q '^FRONTEND_PORT=' .env; then
    sed -i "s/^FRONTEND_PORT=.*/FRONTEND_PORT=$FRONTEND_PORT/" .env
  else
    printf 'FRONTEND_PORT=%s\n' "$FRONTEND_PORT" >> .env
  fi
  if grep -q '^ADMIN_PORT=' .env; then
    sed -i "s/^ADMIN_PORT=.*/ADMIN_PORT=$ADMIN_PORT/" .env
  else
    printf 'ADMIN_PORT=%s\n' "$ADMIN_PORT" >> .env
  fi
fi

if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
  npm ci --omit=dev
else
  echo "No package-lock.json found; using npm install --omit=dev."
  npm install --omit=dev
fi

printf '\nRunning TodayInfo release gate...\n'
npm run doctor
npm run check
npm test

for service in todayinfo-api todayinfo-frontend todayinfo-admin; do
  if ! systemctl list-unit-files --type=service 2>/dev/null | grep -q "^$service\\.service"; then
    echo
    echo "$service systemd service is not installed yet."
    echo "Run:"
    echo "  APP_DIR=$APP_DIR APP_PORT=$APP_PORT FRONTEND_PORT=$FRONTEND_PORT ADMIN_PORT=$ADMIN_PORT bash deploy/install-vps.sh"
    exit 2
  fi
done

printf '\nRestarting API, frontend, admin and Nginx...\n'
sudo systemctl restart todayinfo-api
sudo systemctl restart todayinfo-frontend
sudo systemctl restart todayinfo-admin
sudo nginx -t
sudo systemctl reload nginx

sleep 2
curl --fail --silent --show-error "http://127.0.0.1:$APP_PORT/health"
printf '\n'
curl --fail --silent --show-error "http://127.0.0.1:$FRONTEND_PORT/__frontend_health"
printf '\n'
curl --fail --silent --show-error "http://127.0.0.1:$ADMIN_PORT/__admin_health"
printf '\n\nTodayInfo update complete.\n'
