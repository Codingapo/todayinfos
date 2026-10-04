import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');
const exists=path=>fs.existsSync(new URL('../'+path,import.meta.url));

test('public frontend package contains the VPS SPA files',()=>{
  for(const path of [
    'frontend/index.html','frontend/data/api-config.js',
    'frontend/assets/app-v6.js','frontend/assets/styles.css','frontend/assets/readability.css','frontend/assets/api-v6.css',
    'frontend/robots.txt','frontend/sitemap.xml'
  ]) assert.equal(exists(path),true,path);
  assert.equal(exists('frontend/_redirects'),false);
  assert.equal(exists('frontend/_headers'),false);
});

test('frontend uses todayinfo.co.za and the VPS API only',()=>{
  const config=read('frontend/data/api-config.js');
  const html=read('frontend/index.html');
  assert.match(config,/https:\/\/api\.todayinfo\.co\.za\/api\/v1/);
  assert.match(config,/http:\/\/localhost:3009\/api\/v1/);
  assert.match(config,/TODAYINFO_API_BASES/);
  assert.doesNotMatch(config,/todayinfos\.onrender\.com/);
  assert.match(html,/https:\/\/todayinfo\.co\.za\//);
  assert.match(html,/assets\/app-v6\.js/);
  assert.doesNotMatch(html,/todayinfos\.onrender\.com/);
});

test('frontend runtime uses cache fallback and never consumes private crawler endpoints',()=>{
  const app=read('frontend/assets/app-v6.js');
  assert.match(app,/localStorage\.getItem\(CACHE_PREFIX/);
  assert.match(app,/state\.apiMode=i===0\?'primary':'fallback'/);
  assert.match(app,/state\.apiMode='stale'/);
  assert.doesNotMatch(app,/crawl\/status|recordsIndexed|\/extract\?|\/internal\/ingest/);
});

test('frontend consumes current published API features',()=>{
  const app=read('frontend/assets/app-v6.js');
  for(const term of [
    "safeGet('site'","safeGet('meta'","safeGet('facets'","safeGet('countries'","safeGet('guides'",
    "get('search'","get('sources'","get('guides/'","async function taxonomy(kind)","path==='/categories'||path==='/tags'"
  ]) assert.ok(app.includes(term),term);
  for(const route of ['/bursaries','/scholarships','/jobs','/internships','/learnerships','/opportunities','/news']){
    assert.ok(app.includes(route),route);
  }
});

test('frontend preserves API-owned SEO paths and demand analytics fields',()=>{
  const app=read('frontend/assets/app-v6.js');
  assert.match(app,/r\?\.path\|\|/);
  assert.match(app,/target_url/);
  assert.match(app,/target_title/);
  assert.match(app,/target_type/);
  assert.match(app,/related_click/);
  assert.match(app,/application_click/);
});

test('frontend displays application verification and application guides',()=>{
  const app=read('frontend/assets/app-v6.js');
  assert.match(app,/application_url_verified/);
  assert.match(app,/Verified application destination/);
  assert.match(app,/step-by-step guide/);
  assert.match(app,/guideDetail/);
});

test('frontend Node process owns SPA fallback and CSP while Nginx reverse-proxies it',()=>{
  const nginx=read('deploy/nginx/todayinfo.conf');
  const frontendServer=read('src/frontend-server.mjs');
  assert.match(nginx,/server_name todayinfo\.co\.za www\.todayinfo\.co\.za[\s\S]*proxy_pass http:\/\/127\.0\.0\.1:3011/);
  assert.match(frontendServer,/sendFile\(path\.join\(frontendRoot,'index\.html'\)\)/);
  assert.match(frontendServer,/app\.get\('\/data\/api-config\.js'/);
  assert.match(frontendServer,/connectSrc:\["'self'",apiOrigin\]/);
  assert.match(frontendServer,/max-age=86400, stale-while-revalidate=604800/);
});

test('production examples preserve R2 bucket and API port 3009',()=>{
  const env=read('.env.production.example');
  assert.match(env,/PORT=3009/);
  assert.match(env,/R2_BUCKET=todayinfo/);
  assert.match(env,/PUBLIC_API_ORIGIN=https:\/\/api\.todayinfo\.co\.za/);
  assert.match(env,/ADMIN_ALLOWED_ORIGINS=.*https:\/\/admin\.todayinfo\.co\.za/);
  assert.match(env,/APP_ORIGIN=https:\/\/todayinfo\.co\.za/);
  assert.match(env,/SERVE_FRONTEND=false/);
});

test('server supports compressed public API and optional local SPA fallback without Cannot GET',()=>{
  const server=read('src/server.mjs');
  const config=read('src/config.mjs');
  assert.match(server,/compression\(\{threshold:1024\}\)/);
  assert.match(server,/API route not found/);
  assert.match(server,/Route not found/);
  assert.match(server,/config\.serveFrontend/);
  assert.match(server,/sendFile\(path\.join\(frontendRoot,'index\.html'\)\)/);
  assert.match(server,/X-Accel-Expires/);
  assert.doesNotMatch(server,/Cloudflare-CDN-Cache-Control/);
  assert.match(config,/port: Number\(process\.env\.PORT \|\| 3009\)/);
});

test('production dependencies keep frontend and server checks enabled',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.compression,'^1.8.1');
  assert.equal(pkg.dependencies.multer,'^2.4.0');
  assert.match(pkg.scripts.check,/frontend\/assets\/app-v6\.js/);
});

test('Nginx and both systemd services use the single /opt/filebrowser/today VPS layout',()=>{
  const nginx=read('deploy/nginx/todayinfo.conf');
  const apiService=read('deploy/systemd/todayinfo-api.service');
  const frontendService=read('deploy/systemd/todayinfo-frontend.service');
  assert.match(nginx,/server_name todayinfo\.co\.za www\.todayinfo\.co\.za/);
  assert.match(nginx,/server_name admin\.todayinfo\.co\.za/);
  assert.match(nginx,/https:\/\/admin\.todayinfo\.co\.za\//);
  assert.match(nginx,/server_name api\.todayinfo\.co\.za/);
  assert.match(nginx,/127\.0\.0\.1:3009/);
  assert.match(nginx,/127\.0\.0\.1:3011/);
  assert.match(nginx,/proxy_cache todayinfo_api_cache/);
  for(const service of [apiService,frontendService]){
    assert.match(service,/WorkingDirectory=\/opt\/filebrowser\/today/);
    assert.match(service,/EnvironmentFile=\/opt\/filebrowser\/today\/\.env/);
  }
  assert.match(apiService,/src\/server\.mjs/);
  assert.match(frontendService,/src\/frontend-server\.mjs/);
});


test('VPS updater removes stale Cloudflare artifacts before release',()=>{
  const updater=read('deploy/update-vps.sh');
  assert.match(updater,/rm -f frontend\/_redirects frontend\/_headers/);
  assert.match(updater,/npm run doctor/);
  assert.match(updater,/npm run check/);
  assert.match(updater,/npm test/);
  assert.ok(updater.indexOf('npm test')<updater.indexOf('systemctl restart todayinfo-api'));
});
