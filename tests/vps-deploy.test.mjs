import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('VPS deployment separates API 3009, frontend 3011 and admin 3020',()=>{
  const nginx=read('deploy/nginx/todayinfo.conf');
  const apiService=read('deploy/systemd/todayinfo-api.service');
  const frontendService=read('deploy/systemd/todayinfo-frontend.service');
  const adminService=read('deploy/systemd/todayinfo-admin.service');
  const env=read('.env.production.example');
  const config=read('src/config.mjs');
  const frontend=read('frontend/data/api-config.js');

  assert.match(nginx,/server_name todayinfo\.co\.za www\.todayinfo\.co\.za[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3011/);
  assert.match(nginx,/server_name admin\.todayinfo\.co\.za[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3020/);
  assert.match(nginx,/server_name api\.todayinfo\.co\.za[\s\S]*location \^~ \/admin\/api\/[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3009/);
  assert.match(nginx,/location \^~ \/api\/v1\/[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3009/);
  assert.doesNotMatch(nginx,/\/var\/www\/today/);

  assert.match(apiService,/WorkingDirectory=\/opt\/filebrowser\/today/);
  assert.match(apiService,/EnvironmentFile=\/opt\/filebrowser\/today\/\.env/);
  assert.match(apiService,/ExecStart=\/usr\/bin\/node \/opt\/filebrowser\/today\/src\/server\.mjs/);
  assert.match(frontendService,/ExecStart=\/usr\/bin\/node \/opt\/filebrowser\/today\/src\/frontend-server\.mjs/);
  assert.match(adminService,/ExecStart=\/usr\/bin\/node \/opt\/filebrowser\/today\/src\/admin-server\.mjs/);

  assert.match(env,/^PORT=3009$/m);
  assert.match(env,/^FRONTEND_PORT=3011$/m);
  assert.match(env,/^ADMIN_PORT=3020$/m);
  assert.match(config,/process\.env\.PORT \|\| 3009/);
  assert.match(frontend,/http:\/\/localhost:3009\/api\/v1/);
});
test('VPS updater can work without git and preserves production state',()=>{
  const update=read('deploy/update-vps.sh');
  assert.match(update,/Git is not available here; using the GitHub main-branch archive instead/);
  assert.match(update,/Codingapo\/todayinfos\/archive\/refs\/heads\/main\.tar\.gz/);
  assert.match(update,/APP_DIR="\$\{APP_DIR:-\/opt\/filebrowser\/today\}"/);
  assert.match(update,/APP_PORT="\$\{APP_PORT:-\$\(read_env_value PORT\)\}"/);
  assert.match(update,/FRONTEND_PORT="\$\{FRONTEND_PORT:-\$\(read_env_value FRONTEND_PORT\)\}"/);
  assert.match(update,/data\/seeds/);
  assert.match(update,/No package-lock\.json found; using npm install --omit=dev/);
  assert.doesNotMatch(update,/rm -rf "\$APP_DIR\/data"/);
  assert.doesNotMatch(update,/rm -f "\$APP_DIR\/\.env"/);
});

test('VPS installer generates Nginx and systemd from the actual app directory and port',()=>{
  const install=read('deploy/install-vps.sh');
  assert.match(install,/APP_DIR="\$\{APP_DIR:-\/opt\/filebrowser\/today\}"/);
  assert.match(install,/APP_PORT="\$\{APP_PORT:-3009\}"/);
  assert.match(install,/FRONTEND_PORT="\$\{FRONTEND_PORT:-3011\}"/);
  assert.match(install,/ADMIN_PORT="\$\{ADMIN_PORT:-3020\}"/);
  assert.match(install,/systemctl enable todayinfo-api todayinfo-frontend todayinfo-admin/);
  assert.match(install,/NODE_BIN=/);
  assert.match(install,/npm install --omit=dev/);
  assert.match(install,/nginx -t/);
  assert.match(install,/127\.0\.0\.1:\$APP_PORT\/health/);
  assert.match(install,/127\.0\.0\.1:\$FRONTEND_PORT\/__frontend_health/);
  assert.match(install,/127\.0\.0\.1:\$ADMIN_PORT\/__admin_health/);
});
