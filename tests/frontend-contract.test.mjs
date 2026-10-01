import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve('frontend');
const app=()=>fs.readFileSync(path.join(root,'assets','app-v6.js'),'utf8');
const html=()=>fs.readFileSync(path.join(root,'index.html'),'utf8');
const readme=()=>fs.readFileSync(path.join(root,'README.md'),'utf8');

test('frontend v6 targets the managed TodayInfo API and not raw crawler data',()=>{
  const config=fs.readFileSync(path.join(root,'data','api-config.js'),'utf8');
  assert.match(config,/https:\/\/todayinfos\.onrender\.com\/api\/v1/);
  assert.doesNotMatch(app(),/crawl\/status|recordsIndexed|\/extract\?|\/links\b/);
});

test('frontend consumes the v0.8 public API surfaces',()=>{
  const src=app();
  for(const endpoint of [
    "safeGet('site'","safeGet('meta'","safeGet('facets'","safeGet('countries'","safeGet('sources'","safeGet('guides'",
    "get('search'","safeGet('categories'","safeGet('tags'","safeGet('posts'","safeGet('trending'","safeGet('personalized'"
  ]) assert.ok(src.includes(endpoint),`missing frontend endpoint usage: ${endpoint}`);
  assert.match(src,/guideDetail/);
});

test('frontend supports all primary published content types',()=>{
  const src=app();
  for(const type of ['bursary','scholarship','job','internship','learnership','opportunity','news','announcement','story']){
    assert.match(src,new RegExp(`\\b${type}\\b`));
  }
  for(const route of ['/bursaries','/scholarships','/jobs','/internships','/learnerships','/opportunities','/news']){
    assert.match(src,new RegExp(route.replaceAll('/','\\/')));
  }
});

test('cards prefer API-provided SEO paths and country-prefixed routing is supported',()=>{
  const src=app();
  assert.match(src,/record\?\.path \|\|/);
  assert.match(src,/countryCodeLike/);
  assert.match(src,/seg\.length === 3 && countryCodeLike\(seg\[0\]\) && COLLECTIONS\.has\(seg\[1\]\)/);
  assert.match(src,/seg\.length === 4 && countryCodeLike\(seg\[0\]\) && seg\[1\] === 'news'/);
  assert.match(src,/seg\.length === 3 && countryCodeLike\(seg\[0\]\) && seg\[1\] === 'guides'/);
});

test('Demand Queue analytics payload uses target_url target_title and target_type',()=>{
  const src=app();
  assert.match(src,/target_url:a\.dataset\.targetUrl/);
  assert.match(src,/target_title:a\.dataset\.targetTitle/);
  assert.match(src,/target_type:a\.dataset\.targetType/);
  assert.match(src,/recommendation_click/);
  assert.match(src,/related_click/);
  assert.match(src,/application_click/);
});

test('application guides and verified application status are visible',()=>{
  const src=app();
  assert.match(src,/application_url_verified/);
  assert.match(src,/Verified application destination/);
  assert.match(src,/step-by-step guide/);
  assert.match(src,/guideDetail/);
  assert.match(src,/guides\/\$\{encodeURIComponent\(record\.slug\)\}-how-to-apply/);
});

test('search is driven by API facets rather than client guessing',()=>{
  const src=app();
  for(const field of ['countries','regions','categories','organisations','fields_of_study','work_modes']) assert.match(src,new RegExp(`facets\\.${field}`));
  assert.match(src,/visitor_id:visitorId/);
});

test('homepage tolerates optional endpoint failures instead of blanking completely',()=>{
  const src=app();
  assert.match(src,/const safeGet/);
  assert.match(src,/safeGet\('personalized'/);
  assert.match(src,/safeGet\('guides'/);
  assert.match(src,/safeGet\('countries'/);
});

test('public source catalog and country directories have frontend routes',()=>{
  const src=app();
  assert.match(src,/async function sourcesView/);
  assert.match(src,/async function countriesView/);
  assert.match(src,/async function countryHome/);
  assert.match(src,/publishing_policy/);
});

test('index loads app-v6 and keeps the existing stylesheet stack',()=>{
  const markup=html();
  assert.match(markup,/assets\/styles\.css/);
  assert.match(markup,/assets\/readability\.css/);
  assert.match(markup,/assets\/api-v6\.css/);
  assert.match(markup,/assets\/app-v6\.js/);
  assert.doesNotMatch(markup,/assets\/app-v5\.js/);
});

test('frontend documentation describes API-owned paths and public-only content',()=>{
  const docs=readme();
  assert.match(docs,/record\.path/);
  assert.match(docs,/raw imports/i);
  assert.match(docs,/country-prefixed/i);
  assert.match(docs,/Demand Queue/);
});