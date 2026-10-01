import test from 'node:test';
import assert from 'node:assert/strict';
import { slugify } from '../src/lib/utils.mjs';
import { cleanSourceText, detectContentType, calculateOpportunityStatus, ruleDraftFromRecord, isIndexLikeRecord, contentQuality } from '../src/lib/content-rules.mjs';
import { markdownToBlocks, renderBlocksHtml, extractInlineTags } from '../src/lib/rich-content.mjs';
import { publicPost } from '../src/lib/serializers.mjs';
import { ROLE_PERMISSIONS, hasPermission } from '../src/lib/rbac.mjs';
import { resolvedDefinition } from '../src/lib/content-types.mjs';
import { inspectDatabaseUrl, resolveStoreMode } from '../src/lib/database-config.mjs';

test('SEO slugs stay extension-free and readable',()=>{
  assert.equal(slugify('University of Limpopo — Applications 2027!'),'university-of-limpopo-applications-2027');
});

test('rule-based classifier distinguishes bursary and job content',()=>{
  assert.equal(detectContentType({title:'SPAR Hiring 2026: Apply for vacancies',pageType:'bursary'}),'job');
  assert.equal(detectContentType({title:'Eskom Job Vacancies 2026',pageType:'article',categories:['Vacancies']}),'job');
  assert.equal(detectContentType({title:'Psychometric Tests for Bursary Applications',pageType:'article',tags:['psychometric-test']}),'bursary');
});

test('content cleaner removes common crawler boilerplate',()=>{
  const cleaned=cleanSourceText('Useful paragraph\n\nPost navigation\nRecent Posts\nAnother useful paragraph');
  assert.equal(cleaned,'Useful paragraph\n\nAnother useful paragraph');
});

test('bursary status is date-driven but supports manual override',()=>{
  const now=new Date('2026-09-30T12:00:00Z');
  assert.equal(calculateOpportunityStatus({opening_date:'2026-01-01',closing_date:'2026-10-30',status_override:'auto'},now),'open');
  assert.equal(calculateOpportunityStatus({closing_date:'2026-09-01',status_override:'auto'},now),'closed');
  assert.equal(calculateOpportunityStatus({closing_date:'2026-09-01',status_override:'open'},now),'open');
});

test('rich content safely renders readable links and extracts inline tags',()=>{
  const blocks=markdownToBlocks('Apply using [Apply Here](https://example.com/apply).\n\n#Bursaries #NSFAS\n\n[Bad](javascript:alert(1))');
  const html=renderBlocksHtml(blocks);
  assert.match(html,/href="https:\/\/example.com\/apply"/);
  assert.doesNotMatch(html,/javascript:/);
  assert.deepEqual(extractInlineTags('#Bursaries #NSFAS #Bursaries'),['Bursaries','NSFAS']);
});

test('prepared imports are structured drafts with no generated suggestions',()=>{
  const d=ruleDraftFromRecord({title:'Example Bursary 2026',pageType:'bursary',organization:'Example Fund',closingDate:'2026-10-30',contentText:'Who qualifies?\nStudents may apply.',tags:['Bursaries']});
  assert.equal(d.content_type,'bursary');
  assert.equal(d.type_data.provider,'Example Fund');
  assert.equal(d.status,'draft');
  assert.equal('ai_suggestions' in d,false);
});

test('public bursary response is explicit and frontend-ready',()=>{
  const p=publicPost({id:'1',slug:'example-bursary',title:'Example Bursary',content_type:'bursary',summary:'Funding',body_markdown:'**Apply now**',posted_date:'2026-09-25',category:'Funding',categories:['Funding'],tags:['Bursaries','2026'],topics:[{key:'t1',title:'Who qualifies?',body:'Students.'}],related_links:[{title:'Official site',url:'https://example.com'}],related_ids:[],recommendation_ids:[],documents:[],navigation_links:[],type_data:{provider:'Example',closing_date:'2026-10-30',status_override:'open'},status:'published',created_at:'2026-09-25',updated_at:'2026-09-30'});
  assert.equal(p.type,'bursary');
  assert.equal(p.metadata.status,'open');
  assert.equal(p.metadata.closing_date,'2026-10-30');
  assert.equal(p.topic_navigation[0].anchor,'#t1');
  assert.equal(p.tags[0].url,'/tags/bursaries');
  assert.equal(p.related_links[0].title,'Official site');
});

test('dynamic content definitions show only type-specific fields',()=>{
  const bursary=resolvedDefinition('bursary');
  const news=resolvedDefinition('news');
  assert.ok(bursary.fields.some(x=>x.key==='eligibility'));
  assert.ok(!news.fields.some(x=>x.key==='eligibility'));
  assert.ok(news.fields.some(x=>x.key==='event_date'));
});

test('permissions contain no removed AI/customer-care/university-manager roles',()=>{
  assert.equal('customer_care' in ROLE_PERMISSIONS,false);
  assert.equal('university_manager' in ROLE_PERMISSIONS,false);
  assert.equal(hasPermission('editor','posts.edit'),true);
  assert.equal(hasPermission('editor','ai.use'),false);
});

test('database configuration rejects the literal placeholder host and auto-falls back safely',()=>{
  const bad='postgresql://postgres:password@host:5432/postgres';
  assert.deepEqual(inspectDatabaseUrl(bad),{valid:false,reason:'placeholder-host',host:'host'});
  assert.equal(resolveStoreMode({requestedMode:'auto',databaseUrl:bad}).mode,'demo');
  assert.throws(()=>resolveStoreMode({requestedMode:'postgres',databaseUrl:bad}),/valid DATABASE_URL/);
});

test('database configuration selects postgres only for a real-looking postgres URL',()=>{
  const good='postgresql://postgres:secret@db.example.supabase.co:5432/postgres';
  assert.equal(inspectDatabaseUrl(good).valid,true);
  assert.equal(resolveStoreMode({requestedMode:'auto',databaseUrl:good}).mode,'postgres');
});


test('archive/tag/category records are filtered before import review',()=>{
  assert.equal(isIndexLikeRecord({title:'Month: October 2026',path:'/2026/10/'}),true);
  assert.equal(isIndexLikeRecord({title:'Psychometric Test',path:'/tag/psychometric-test/'}),true);
  assert.equal(isIndexLikeRecord({title:'Real bursary opportunity',path:'/bursaries/real-bursary'}),false);
});

test('rule-prepared content gets useful fallback tags and quality feedback',()=>{
  const d=ruleDraftFromRecord({title:'Example Company Jobs 2026',organization:'Example Company',contentText:'This is a detailed vacancy article. '.repeat(12),publishedAt:'2026-10-01',categories:['Vacancies','2'],applicationLinks:[{url:'https://example.com/apply'}]});
  assert.equal(d.content_type,'job');
  assert.ok(d.tags.includes('Jobs'));
  assert.ok(d.tags.includes('2026'));
  assert.ok(!d.categories.includes('2'));
  const q=contentQuality(d);
  assert.ok(q.score>=50);
});
