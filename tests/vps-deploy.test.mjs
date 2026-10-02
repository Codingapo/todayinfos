import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL(`../${path}`,import.meta.url),'utf8');

test('VPS deployment consistently uses /opt/filebrowser/today and port 3009',()=>{
  const nginx=read('deploy/nginx/todayinfo.conf');
  const service=read('deploy/systemd/todayinfo-api.service');
  const env=read('.env.production.example');
  const config=read('src/config.mjs');
  const frontend=read('frontend/data/api-config.js');

  assert.match(nginx,/root \/opt\/filebrowser\/today\/frontend;/);
  assert.match(nginx,/127\.0\.0\.1:3009/);
  assert.doesNotMatch(nginx,/127\.0\.0\.1:3011/);
  assert.doesNotMatch(nginx,/\/var\/www\/today/);

  assert.match(service,/WorkingDirectory=\/opt\/filebrowser\/today/);
  assert.match(service,/EnvironmentFile=\/opt\/filebrowser\/today\/\.env/);
  assert.match(service,/ExecStart=\/usr\/bin\/node \/opt\/filebrowser\/today\/src\/server\.mjs/);

  assert.match(env,/^PORT=3009$/m);
  assert.match(config,/process\.env\.PORT \|\| 3009/);
  assert.match(frontend,/http:\/\/localhost:3009\/api\/v1/);
  assert.doesNotMatch(frontend,/localhost:3011/);
});

test('VPS updater can work without git and preserves production state',()=>{
  const update=read('deploy/update-vps.sh');
  assert.match(update,/Git is not available here; using the GitHub main-branch archive instead/);
  assert.match(update,/Codingapo\/todayinfos\/archive\/refs\/heads\/main\.tar\.gz/);
  assert.match(update,/APP_DIR="\$\{APP_DIR:-\/opt\/filebrowser\/today\}"/);
  assert.match(update,/APP_PORT="\$\{APP_PORT:-\$\(read_env_port\)\}"/);
  assert.match(update,/data\/seeds/);
  assert.match(update,/No package-lock\.json found; using npm install --omit=dev/);
  assert.doesNotMatch(update,/rm -rf "\$APP_DIR\/data"/);
  assert.doesNotMatch(update,/rm -f "\$APP_DIR\/\.env"/);
});

test('VPS installer generates Nginx and systemd from the actual app directory and port',()=>{
  const install=read('deploy/install-vps.sh');
  assert.match(install,/APP_DIR="\$\{APP_DIR:-\/opt\/filebrowser\/today\}"/);
  assert.match(install,/APP_PORT="\$\{APP_PORT:-3009\}"/);
  assert.match(install,/systemctl enable todayinfo-api/);
  assert.match(install,/NODE_BIN=/);
  assert.match(install,/npm install --omit=dev/);
  assert.match(install,/nginx -t/);
  assert.match(install,/127\.0\.0\.1:\$APP_PORT\/health/);
});
