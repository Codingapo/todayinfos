#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/filebrowser/today}"
APP_PORT="${APP_PORT:-3009}"
FRONTEND_PORT="${FRONTEND_PORT:-3011}"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"
SERVICE_GROUP="${SERVICE_GROUP:-$(id -gn)}"
NODE_BIN="${NODE_BIN:-$(command -v node || true)}"

if [[ ! -d "$APP_DIR" ]]; then
  echo "TodayInfo folder not found: $APP_DIR" >&2
  exit 1
fi

cd "$APP_DIR"

for cmd in node npm nginx curl; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
done
if [[ -z "$NODE_BIN" ]]; then
  echo "Could not determine the Node.js binary path." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  cp .env.production.example .env
  sed -i "s/^PORT=.*/PORT=$APP_PORT/" .env
  echo "Created $APP_DIR/.env from the production example."
  echo "Edit its CHANGE_ME values before starting production."
fi

# Keep the private Node listener and Nginx upstream on the same port.
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

sudo mkdir -p "$APP_DIR/data" "$APP_DIR/uploads" /var/cache/nginx/todayinfo
sudo chown -R "$SERVICE_USER:$SERVICE_GROUP" "$APP_DIR/data" "$APP_DIR/uploads" /var/cache/nginx/todayinfo
sudo chmod -R u+rwX,g+rwX "$APP_DIR/data" "$APP_DIR/uploads"
if [[ -f "$APP_DIR/.env" ]]; then
  sudo chgrp "$SERVICE_GROUP" "$APP_DIR/.env"
  sudo chmod 640 "$APP_DIR/.env"
fi

# Nginx serves the public frontend directly. Give it read/traverse access only
# to the public frontend path, not to private .env secrets.
sudo chmod o+x /opt /opt/filebrowser "$APP_DIR" 2>/dev/null || true
find "$APP_DIR/frontend" -type d -exec chmod 755 {} \;
find "$APP_DIR/frontend" -type f -exec chmod 644 {} \;

# Generate install-time copies so APP_DIR / APP_PORT can be overridden safely.
tmp_api_service="$(mktemp)"
tmp_frontend_service="$(mktemp)"
tmp_nginx="$(mktemp)"
trap 'rm -f "$tmp_api_service" "$tmp_frontend_service" "$tmp_nginx"' EXIT

sed \
  -e "s#^WorkingDirectory=.*#WorkingDirectory=$APP_DIR#" \
  -e "s#^EnvironmentFile=.*#EnvironmentFile=$APP_DIR/.env#" \
  -e "s#^ExecStart=.*#ExecStart=$NODE_BIN $APP_DIR/src/server.mjs#" \
  -e "s/^User=.*/User=$SERVICE_USER/" \
  -e "s/^Group=.*/Group=$SERVICE_GROUP/" \
  "$APP_DIR/deploy/systemd/todayinfo-api.service" > "$tmp_api_service"

sed \
  -e "s#^WorkingDirectory=.*#WorkingDirectory=$APP_DIR#" \
  -e "s#^EnvironmentFile=.*#EnvironmentFile=$APP_DIR/.env#" \
  -e "s#^ExecStart=.*#ExecStart=$NODE_BIN $APP_DIR/src/frontend-server.mjs#" \
  -e "s/^User=.*/User=$SERVICE_USER/" \
  -e "s/^Group=.*/Group=$SERVICE_GROUP/" \
  "$APP_DIR/deploy/systemd/todayinfo-frontend.service" > "$tmp_frontend_service"

# Replace the two upstream ports independently. Never rewrite every localhost
# port to APP_PORT: the frontend and API intentionally run on different ports.
sed \
  -e "s#/opt/filebrowser/today#$APP_DIR#g" \
  -e "s#127.0.0.1:3009#127.0.0.1:$APP_PORT#g" \
  -e "s#127.0.0.1:3011#127.0.0.1:$FRONTEND_PORT#g" \
  "$APP_DIR/deploy/nginx/todayinfo.conf" > "$tmp_nginx"

sudo cp "$tmp_api_service" /etc/systemd/system/todayinfo-api.service
sudo cp "$tmp_frontend_service" /etc/systemd/system/todayinfo-frontend.service
sudo cp "$tmp_nginx" /etc/nginx/sites-available/todayinfo
sudo ln -sf /etc/nginx/sites-available/todayinfo /etc/nginx/sites-enabled/todayinfo
sudo rm -f /etc/nginx/sites-enabled/default

if [[ -f package-lock.json || -f npm-shrinkwrap.json ]]; then
  npm ci --omit=dev
else
  echo "No package-lock.json found; using npm install --omit=dev."
  npm install --omit=dev
fi
npm run doctor
npm run check
npm test

sudo systemctl daemon-reload
sudo systemctl enable todayinfo-api todayinfo-frontend
sudo systemctl restart todayinfo-api
sudo systemctl restart todayinfo-frontend

sudo nginx -t
sudo systemctl reload nginx

sleep 2
curl --fail --silent --show-error "http://127.0.0.1:$APP_PORT/health"
curl --fail --silent --show-error "http://127.0.0.1:$FRONTEND_PORT/__frontend_health"
printf '\n\nTodayInfo VPS install complete.\n'
printf 'App folder: %s\n' "$APP_DIR"
printf 'API port: %s\n' "$APP_PORT"
printf 'Frontend/admin port: %s\n' "$FRONTEND_PORT"
printf 'Frontend: https://todayinfo.co.za\n'
printf 'Admin: https://todayinfo.co.za/admin/\n'
printf 'API: https://api.todayinfo.co.za/api/v1\n'
