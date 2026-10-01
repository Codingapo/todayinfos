import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { slugify } from '../src/lib/utils.mjs';
import { cleanSourceText, detectContentType, calculateOpportunityStatus, ruleDraftFromRecord, isIndexLikeRecord, contentQuality, sourceRecommendations } from '../src/lib/content-rules.mjs';
import { markdownToBlocks, renderBlocksHtml, extractInlineTags } from '../src/lib/rich-content.mjs';
import { publicPost } from '../src/lib/serializers.mjs';
import { ROLE_PERMISSIONS, hasPermission } from '../src/lib/rbac.mjs';
import { resolvedDefinition } from '../src/lib/content-types.mjs';
import { inspectDatabaseUrl, resolveStoreMode, collectDatabaseUrls } from '../src/lib/database-config.mjs';
import { normalizeGeo, normalizeClassification, seoPath, filterPost } from '../src/lib/global-content.mjs';
import { publicationKey, PUBLICATION_SCHEMA } from '../src/lib/publication-service.mjs';
import { publishedObjectKey } from '../src/lib/r2.mjs';
import { FederatedStore, availabilityError } from '../src/lib/federated-store.mjs';

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
  const p=publicPost({id:'1',slug:'example-bursary',title:'Example Bursary',content_type:'bursary',summary:'Funding',body_markdown:'**Apply now**',posted_date:'2026-09-25',category:'Funding',categories:['Funding'],tags:['Bursaries','2026'],topics:[{key:'t1',title:'Who qualifies?',body:'Students.'}],related_links:[{title:'Official site',url:'https://example.com'}],related_ids:[],recommendation_ids:[],recommendation_links:[{title:'Application guide',url:'https://example.com/guide'}],documents:[],navigation_links:[],type_data:{provider:'Example',closing_date:'2026-10-30',status_override:'open'},status:'published',created_at:'2026-09-25',updated_at:'2026-09-30'});
  assert.equal(p.type,'bursary');
  assert.equal(p.metadata.status,'open');
  assert.equal(p.metadata.closing_date,'2026-10-30');
  assert.equal(p.topic_navigation[0].anchor,'#t1');
  assert.equal(p.tags[0].url,'/tags/bursaries');
  assert.equal(p.related_links[0].title,'Official site');
  assert.equal(p.recommendation_links[0].title,'Application guide');
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


test('source recommendations preserve related opportunities but skip junk and application links',()=>{
  const record={
    title:'Example Bursary 2026',pageType:'bursary',url:'https://source.test/example-bursary',
    applicationLinks:[{url:'https://source.test/apply'}],
    links:[
      {title:'Apply now',url:'https://source.test/apply'},
      {title:'Another Engineering Bursary 2026',url:'https://source.test/engineering-bursary'},
      {title:'Privacy Policy',url:'https://source.test/privacy'},
      {title:'Bursaries',url:'https://source.test/category/bursaries/'},
      {title:'Facebook',url:'https://facebook.com/source'}
    ]
  };
  const recs=sourceRecommendations(record,'bursary');
  assert.deepEqual(recs,[{title:'Another Engineering Bursary 2026',url:'https://source.test/engineering-bursary',type:'source_recommendation'}]);
  const draft=ruleDraftFromRecord(record);
  assert.equal(draft.recommendation_links.length,1);
});

test('ignore is no longer an active admin import workflow',()=>{
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.doesNotMatch(admin,/adminRouter\.delete\('\/imports\/:id'/);
  assert.doesNotMatch(admin,/review_status:z\.enum\(\[[^\]]*ignored/);
  assert.doesNotMatch(ui,/ignore-import|Ignore import|ignoreImport/);
});

test('explicit source related links are preserved even when their title is not generic family wording',()=>{
  const recs=sourceRecommendations({
    title:'Example Bursary 2026',pageType:'bursary',url:'https://source.test/bursary',
    relatedLinks:[{title:'Application Guide for Students',url:'https://source.test/student-guide'}]
  },'bursary');
  assert.deepEqual(recs,[{title:'Application Guide for Students',url:'https://source.test/student-guide',type:'source_related'}]);
});


test('global location model normalizes countries and supports country SEO paths',()=>{
  const geo=normalizeGeo({country:'South Africa',province:'Gauteng',city:'Johannesburg'});
  assert.equal(geo.country_code,'ZA');
  assert.equal(geo.region_name,'Gauteng');
  assert.equal(seoPath({content_type:'bursary',slug:'example',geo}),'/za/bursaries/example');
  assert.equal(seoPath({content_type:'news',slug:'application-update',category:'University News',geo}),'/za/news/university-news/application-update');
});

test('global classification supports opportunity discovery fields',()=>{
  const c=normalizeClassification({
    organisation:'Example Org',education_level:['Undergraduate'],fields_of_study:['Engineering'],
    job_type:'full-time',work_mode:'remote',salary:{min:1000,max:2000,currency:'zar'}
  });
  assert.equal(c.organisation,'Example Org');
  assert.deepEqual(c.fields_of_study,['Engineering']);
  assert.equal(c.salary.currency,'ZAR');
});

test('global filter helper matches country region city and field of study',()=>{
  const post={
    geo:{country_code:'ZA',region_name:'Gauteng',city:'Johannesburg'},
    classification:{fields_of_study:['Engineering'],education_level:['Graduate'],work_mode:'hybrid'},
    type_data:{}
  };
  assert.equal(filterPost(post,{country:'za',region:'gauteng',city:'johan',field_of_study:'engineer'}),true);
  assert.equal(filterPost(post,{country:'GB'}),false);
});

test('public serializer exposes explicit global location classification and legacy path',()=>{
  const p=publicPost({
    id:'g1',slug:'global-job',title:'Global Job',content_type:'job',summary:'Role',body_markdown:'Details',
    posted_date:'2026-10-01',category:'Technology',categories:['Technology'],tags:['Jobs'],
    topics:[],related_links:[],related_ids:[],recommendation_ids:[],recommendation_links:[],documents:[],navigation_links:[],
    type_data:{company:'Example',closing_date:'2026-11-01',status_override:'open'},
    geo:{country_code:'GB',country_name:'United Kingdom',city:'London'},
    classification:{organisation:'Example',job_type:'full-time',work_mode:'hybrid',fields_of_study:['Computer Science']},
    status:'published',created_at:'2026-10-01',updated_at:'2026-10-01'
  });
  assert.equal(p.path,'/gb/jobs/global-job');
  assert.equal(p.legacy_path,'/jobs/global-job');
  assert.equal(p.location.country.code,'GB');
  assert.equal(p.classification.job_type,'full-time');
  assert.equal(p.organisation,'Example');
});


test('published JSON artifact keys are global and country aware',()=>{
  assert.equal(
    publishedObjectKey({countryCode:'ZA',collection:'bursaries',slug:'example-bursary'}),
    'published/za/bursaries/example-bursary.json'
  );
  assert.equal(
    publicationKey({content_type:'job',slug:'remote-role',geo:{country_code:'GB'}}),
    'published/gb/jobs/remote-role.json'
  );
  assert.equal(PUBLICATION_SCHEMA,'todayinfo.content.v1');
});


test('multi-database configuration accepts many valid databases and removes duplicates',()=>{
  const env={
    DATABASE_URL:'postgresql://user:pass@db1.example.com:5432/main',
    DATABASE_URLS:'postgresql://user:pass@db2.example.com:5432/main,postgresql://user:pass@db1.example.com:5432/main',
    DATABASE_URL_3:'postgresql://user:pass@db3.example.com:5432/main',
    DATABASE_URL_4:'postgresql://user:pass@host:5432/main'
  };
  const urls=collectDatabaseUrls(env,{max:5});
  assert.equal(urls.length,3);
  assert.match(urls[1],/db2\.example\.com/);
});

test('federated public reads merge content from multiple databases',async()=>{
  const primary={listPosts:async()=>[{id:'1',slug:'za-post',title:'ZA',status:'published',geo:{country_code:'ZA'},updated_at:'2026-10-01'}]};
  const reader={listPosts:async()=>[{id:'2',slug:'uk-post',title:'UK',status:'published',geo:{country_code:'GB'},updated_at:'2026-10-01'}]};
  const fallback={cached:[],cachePosts(rows){this.cached=rows},listPosts:async()=>[]};
  const fed=new FederatedStore({primary,readers:[reader],fallback});
  const rows=await fed.listPosts({status:'published'});
  assert.equal(rows.length,2);
  assert.equal(fallback.cached.length,2);
});

test('federated writes use local fallback only for availability failures',async()=>{
  const primary={updatePost:async()=>{const e=new Error('getaddrinfo ENOTFOUND db');e.code='ENOTFOUND';throw e}};
  const fallback={
    queued:[],
    updatePost:async(id,patch)=>({id,slug:'cached',status:'published',...patch}),
    enqueueDatabaseOperation(method,args){this.queued.push({method,args})}
  };
  const fed=new FederatedStore({primary,readers:[],fallback});
  const row=await fed.updatePost('p1',{title:'Offline update'},'admin');
  assert.equal(row._database_fallback,true);
  assert.equal(fallback.queued[0].method,'updatePost');
  assert.equal(availabilityError(Object.assign(new Error('timeout'),{code:'ETIMEDOUT'})),true);
});
