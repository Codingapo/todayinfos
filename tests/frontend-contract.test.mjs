import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=path=>fs.readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('public frontend package contains Cloudflare Pages SPA files',()=>{
  for(const path of [
    'frontend/index.html','frontend/_redirects','frontend/_headers','frontend/data/api-config.js',
    'frontend/assets/app-v6.js','frontend/assets/styles.css','frontend/assets/readability.css','frontend/assets/api-v6.css',
    'frontend/robots.txt','frontend/sitemap.xml'
  ]) assert.equal(fs.existsSync(new URL('../'+path,import.meta.url)),true,path);
  assert.match(read('frontend/_redirects'),/\/\* \/index\.html 200/);
});

test('frontend uses todayinfo.co.za and can fail over from VPS API to Render',()=>{
  const config=read('frontend/data/api-config.js');
  const html=read('frontend/index.html');
  assert.match(config,/https:\/\/api\.todayinfo\.co\.za\/api\/v1/);
  assert.match(config,/https:\/\/todayinfos\.onrender\.com\/api\/v1/);
  assert.match(config,/TODAYINFO_API_BASES/);
  assert.match(html,/https:\/\/todayinfo\.co\.za\//);
  assert.match(html,/assets\/app-v6\.js/);
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

test('Cloudflare headers avoid permanently caching mutable SPA files',()=>{
  const headers=read('frontend/_headers');
  assert.match(headers,/\/assets\/\*/);
  assert.match(headers,/max-age=3600/);
  assert.match(headers,/data\/api-config\.js/);
  assert.match(headers,/max-age=60/);
  assert.match(headers,/X-Content-Type-Options: nosniff/);
});

test('production examples preserve R2 bucket and API port 3009',()=>{
  const env=read('.env.production.example');
  assert.match(env,/PORT=3009/);
  assert.match(env,/R2_BUCKET=todayinfo/);
  assert.match(env,/PUBLIC_API_ORIGIN=https:\/\/api\.todayinfo\.co\.za/);
  assert.match(env,/SERVE_FRONTEND=false/);
});

test('server supports compressed public API and optional SPA fallback without Cannot GET',()=>{
  const server=read('src/server.mjs');
  const config=read('src/config.mjs');
  assert.match(server,/compression\(\{threshold:1024\}\)/);
  assert.match(server,/API route not found/);
  assert.match(server,/Route not found/);
  assert.match(server,/config\.serveFrontend/);
  assert.match(server,/sendFile\(path\.join\(frontendRoot,'index\.html'\)\)/);
  assert.match(config,/port: Number\(process\.env\.PORT \|\| 3009\)/);
});

test('production dependencies use patched multer line',()=>{
  const pkg=JSON.parse(read('package.json'));
  assert.equal(pkg.dependencies.compression,'^1.8.1');
  assert.equal(pkg.dependencies.multer,'^2.4.0');
  assert.match(pkg.scripts.check,/frontend\/assets\/app-v6\.js/);
});

test('Nginx and systemd deployment target localhost port 3009',()=>{
  assert.match(read('deploy/nginx/todayinfo-api.conf'),/127\.0\.0\.1:3009/);
  assert.match(read('deploy/systemd/todayinfo-api.service'),/src\/server\.mjs/);
});
