import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { slugify } from '../src/lib/utils.mjs';
import { cleanSourceText, detectContentType, calculateOpportunityStatus, ruleDraftFromRecord, isIndexLikeRecord, contentQuality, sourceRecommendations } from '../src/lib/content-rules.mjs';
import { markdownToBlocks, renderBlocksHtml, extractInlineTags } from '../src/lib/rich-content.mjs';
import { publicPost } from '../src/lib/serializers.mjs';
import { ROLE_PERMISSIONS, ROLE_LABELS, hasPermission } from '../src/lib/rbac.mjs';
import { resolvedDefinition } from '../src/lib/content-types.mjs';
import { inspectDatabaseUrl, resolveStoreMode, collectDatabaseUrls } from '../src/lib/database-config.mjs';
import { normalizeGeo, normalizeClassification, normalizeCountryCode, seoPath, filterPost, matchesSearch, queryFilters } from '../src/lib/global-content.mjs';
import { publicationKey, PUBLICATION_SCHEMA } from '../src/lib/publication-service.mjs';
import { publishedObjectKey } from '../src/lib/r2.mjs';
import { PUBLISHED_INDEX_KEY, PUBLISHED_INDEX_SCHEMA } from '../src/lib/published-index.mjs';
import { FederatedStore, availabilityError } from '../src/lib/federated-store.mjs';
import { searchScore, trendScore, deriveVisitorSignals } from '../src/lib/ranking.mjs';
import { loadSouthAfricaReferenceSeed, loadAfricaReferenceSeed, loadAllReferenceSeeds } from '../src/lib/reference-seed.mjs';
import { autoPublishDecision } from '../src/lib/auto-publish.mjs';
import { applyLearningHints, learnIntoProfile, learningQualityBonus } from '../src/lib/import-learning.mjs';
import { sourceFamily, improveDraftForSource, isSourceIndexRecord, discoverSourceLinks } from '../src/lib/source-profiles.mjs';
import { demandPriority, clickedDiscoveryRow } from '../src/lib/demand-priority.mjs';
import { CONTENT_LIMITS, SEO_GUIDANCE, zodValidationDetails } from '../src/lib/content-constraints.mjs';
import { relationScore, smartRelated, recommendationFamily, recommendationCompatible } from '../src/lib/related-content.mjs';
import { GLOBAL_HARVEST_PROVIDERS } from '../src/lib/global-harvest.mjs';
import { applicationCandidates, buildApplicationGuide } from '../src/lib/application-intelligence.mjs';
import { plainEnglishNewsDraft } from '../src/lib/plain-content.mjs';
import { NEWS_FEEDS } from '../src/lib/news-harvest.mjs';
import { buildTrafficAtlas, continentForCode } from '../src/lib/geo-analytics.mjs';
import { SOURCE_CATALOG, SOURCE_CATEGORIES, sourceHubPayload, sourcePublishingPolicy, importPublishingPolicy } from '../src/lib/source-catalog.mjs';
import { parseDirectAnchors, fetchDirectSourceRecord, fetchDirectSourceFallback, directFallbackSupports } from '../src/lib/direct-source-fallback.mjs';
import { fetchImports, sourceEndpointCandidates, probeLegacySources } from '../src/lib/importer.mjs';
import { preparePrivateIngestItem, descriptiveOpportunitySlug } from '../src/lib/private-ingest.mjs';

import { PostgresStore } from '../src/lib/store-postgres.mjs';
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


test('structured search ranking favors titles tags organisations and locations',()=>{
  const strong={title:'Engineering Internship Johannesburg',summary:'Graduate opportunity',tags:['Engineering'],classification:{organisation:'Example Tech',fields_of_study:['Engineering']},geo:{city:'Johannesburg'}};
  const weak={title:'General Update',summary:'Engineering is mentioned once',tags:[],classification:{},geo:{}};
  assert.ok(searchScore(strong,'engineering johannesburg')>searchScore(weak,'engineering johannesburg'));
});

test('trending ranking uses engagement recency and manual editorial boost',()=>{
  const post={published_at:'2026-10-01T00:00:00Z',is_trending:false};
  const score=trendScore(post,{view:10,read:3,application_click:2},new Date('2026-10-01T12:00:00Z'));
  assert.ok(score>40);
  assert.ok(trendScore({...post,is_trending:true},{},new Date('2026-10-01T12:00:00Z'))>trendScore(post,{},new Date('2026-10-01T12:00:00Z')));
});

test('visitor signals are deterministic and based on anonymous event history',()=>{
  const signals=deriveVisitorSignals([
    {event_type:'search',created_at:'2026-10-01T10:00:00Z',meta:{query:'internships',country_code:'ZA',region_name:'Gauteng',content_type:'internship'}},
    {event_type:'read',created_at:'2026-10-01T09:00:00Z',meta:{country_code:'ZA',region_name:'Gauteng',content_type:'internship'}},
    {event_type:'view',created_at:'2026-10-01T08:00:00Z',meta:{country_code:'GB',content_type:'job'}}
  ]);
  assert.equal(signals.country,'ZA');
  assert.equal(signals.region,'Gauteng');
  assert.equal(signals.content_type,'internship');
  assert.equal(signals.query,'internships');
});


test('scholarships are distinct from bursaries in the global classifier',()=>{
  assert.equal(detectContentType({title:'Rhodes Scholarship 2027',type:'article'}),'scholarship');
  assert.equal(detectContentType({title:'Engineering Bursary 2027',type:'article'}),'bursary');
});

test('global filters support salary stipend eligibility and work mode',()=>{
  const post={
    tags:['Graduate'],
    geo:{country_code:'ZA',region_name:'Gauteng'},
    classification:{
      work_mode:'hybrid',eligibility_tags:['South African citizens','Graduates'],
      salary:{min:5000,max:8000,currency:'ZAR',stipend:true},
      education_level:['Graduate'],fields_of_study:['Engineering']
    },
    type_data:{}
  };
  assert.equal(filterPost(post,{salary_min:6000,currency:'zar',stipend:'true',eligibility:'citizens',work_mode:'hybrid'}),true);
  assert.equal(filterPost(post,{salary_min:9000}),false);
  assert.equal(filterPost(post,{stipend:'false'}),false);
});

test('published R2 manifest has a stable schema and key',()=>{
  assert.equal(PUBLISHED_INDEX_KEY,'published/_index.json');
  assert.equal(PUBLISHED_INDEX_SCHEMA,'todayinfo.index.v1');
});

test('partial database outage can still use the R2 or local fallback path',async()=>{
  const unavailable={listPosts:async()=>{const e=new Error('network timeout');e.code='ETIMEDOUT';throw e}};
  const healthy={listPosts:async()=>[]};
  const fallback={
    cached:[],cachePosts(rows){this.cached=rows},
    listPosts:async()=>[{id:'cached',slug:'cached',title:'Cached',status:'published',geo:{country_code:'ZA'},updated_at:'2026-10-01'}]
  };
  const fed=new FederatedStore({primary:unavailable,readers:[healthy],fallback});
  const rows=await fed.listPosts({status:'published'});
  assert.ok(rows.some(x=>x.id==='cached'));
});

test('OpenAPI advertises the global frontend contract',()=>{
  const spec=fs.readFileSync(new URL('../public/openapi.yaml',import.meta.url),'utf8');
  assert.match(spec,/\/\{countryCode\}\/\{collection\}/);
  assert.match(spec,/\/facets:/);
  assert.match(spec,/\/locations:/);
  assert.match(spec,/published-only global content API/i);
});


test('permanent South Africa reference seed contains all 40 researched records',()=>{
  const seed=loadSouthAfricaReferenceSeed();
  assert.equal(seed.rows.length,40);
  assert.equal(seed.rows.filter(x=>x.detected_type==='job').length,20);
  assert.equal(seed.rows.filter(x=>x.detected_type==='bursary').length,20);
  assert.match(seed.metadata.publishing_note,/draft-only/i);
  assert.ok(seed.rows.filter(x=>x.quality_score>=80).length>=30);
});

test('import learning memory does not double-count the same fetched version',()=>{
  const row={
    source_key:'example:1',source_hash:'hash-a',source_url:'https://example.org/jobs/1',
    detected_type:'job',quality_score:90,prepared_draft:{content_type:'job',geo:{country_code:'ZA'}}
  };
  const once=learnIntoProfile(null,[row]);
  const twice=learnIntoProfile(once,[row]);
  assert.equal(once.records_seen,1);
  assert.equal(twice.records_seen,1);
  assert.equal(twice.sources['example.org'].count,1);
});

test('learned source patterns can improve unknown classification without overriding clear records',()=>{
  const rows=[1,2,3].map(n=>({
    source_key:`learn:${n}`,source_hash:`h${n}`,source_url:`https://learn.example/item-${n}`,
    detected_type:'bursary',quality_score:90,prepared_draft:{content_type:'bursary',geo:{country_code:'ZA'}}
  }));
  const profile=learnIntoProfile(null,rows);
  const draft=applyLearningHints({
    draft:{content_type:'other',geo:{}},
    row:{source_url:'https://learn.example/new-item'},
    profile
  });
  assert.equal(draft.content_type,'bursary');
  assert.equal(draft.geo.country_code,'ZA');
  assert.ok(learningQualityBonus({source_url:'https://learn.example/new-item'},profile)>0);
});

test('80-percent active import can auto-publish when hard checks pass',()=>{
  const draft={
    title:'Example Job',content_type:'job',body_markdown:'Useful details '.repeat(30),tags:['Jobs'],
    type_data:{company:'Example Org',closing_date:'2026-10-30',status_override:'open',how_to_apply:'Apply using the official employer instructions shown on the source page.'}
  };
  const decision=autoPublishDecision({
    importRow:{quality_score:80,source_url:'https://example.org/job'},
    draft,threshold:80,now:new Date('2026-10-01T12:00:00Z')
  });
  assert.equal(decision.eligible,true);
});

test('high-quality expired opportunity is never auto-published',()=>{
  const draft={
    title:'Expired Bursary',content_type:'bursary',body_markdown:'Useful details '.repeat(30),tags:['Bursaries'],
    type_data:{provider:'Example Fund',closing_date:'2026-08-31',status_override:'auto',how_to_apply:'Apply through the official funding portal with the required documents.'}
  };
  const decision=autoPublishDecision({
    importRow:{quality_score:95,source_url:'https://example.org/bursary'},
    draft,threshold:80,now:new Date('2026-10-01T12:00:00Z')
  });
  assert.equal(decision.eligible,false);
  assert.ok(decision.issues.some(x=>/passed|closed/i.test(x)));
});

test('Import Inbox UI advertises the 80-percent auto-publish rule',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/Auto-publish clean imports scoring 80% or higher/);
  assert.doesNotMatch(ui,/Publish up to 3 clean preview posts/);
});


test('DailyUpdate source profile removes article chrome and extracts job structure',()=>{
  const record={
    sourceId:'dailyupdate',url:'https://dailyupdate.co.za/example-hiring-2026/',
    title:'Example Stores Hiring 2026: Apply Now',
    contentText:'Table of Contents\nToggle\nExample Stores Hiring 2026: Apply Now\n## Requirements\n- Grade 12\n- Good communication\n## How to Apply\nApply on the official careers website.\n',
    links:[
      {title:'Official careers - Apply',url:'https://careers.example.org/jobs'},
      {title:'Facebook',url:'https://facebook.com/example'}
    ]
  };
  assert.equal(sourceFamily(record),'dailyupdate');
  const draft=improveDraftForSource(record,{title:record.title,content_type:'news',body_markdown:record.contentText,type_data:{}});
  assert.equal(draft.content_type,'job');
  assert.doesNotMatch(draft.body_markdown,/Table of Contents|Toggle/);
  assert.match(draft.type_data.requirements,/Grade 12/);
  assert.equal(draft.type_data.application_url,'https://careers.example.org/jobs');
});

test('ZA Bursaries source profile extracts eligibility application and closing date',()=>{
  const record={
    sourceId:'zabursaries',url:'https://www.zabursaries.co.za/example-bursary/',
    title:'Example Foundation Bursary South Africa 2027',
    contentText:'### ELIGIBILITY REQUIREMENTS FOR THE EXAMPLE BURSARY\n- South African citizen\n- Study Engineering\n### HOW TO APPLY FOR THE EXAMPLE BURSARY\nApplications must be submitted online.\n### SUPPORTING DOCUMENTS\n- ID document\n- Academic record\n### CLOSING DATE FOR THE EXAMPLE BURSARY\n31 October 2026\n',
    links:[{title:'Example Bursary Application 2027',url:'https://apply.example.org/bursary'}]
  };
  const draft=improveDraftForSource(record,{title:record.title,content_type:'other',body_markdown:record.contentText,type_data:{}});
  assert.equal(sourceFamily(record),'zabursaries');
  assert.equal(draft.content_type,'bursary');
  assert.match(draft.type_data.eligibility,/South African citizen/);
  assert.match(draft.type_data.how_to_apply,/submitted online/i);
  assert.match(draft.type_data.supporting_documents,/Academic record/);
  assert.equal(draft.type_data.closing_date,'2026-10-31');
  assert.equal(draft.type_data.application_url,'https://apply.example.org/bursary');
});

test('ZA Bursaries monthly closing pages are discovery indexes, not bursary articles',()=>{
  assert.equal(isSourceIndexRecord({
    sourceId:'zabursaries',title:'BURSARIES CLOSING IN OCTOBER 2026',
    url:'https://www.zabursaries.co.za/bursaries-closing-in-october-2026/'
  }),true);
});

test('source discovery keeps opportunity links but drops junk links',()=>{
  const rows=discoverSourceLinks([{
    sourceId:'zabursaries',title:'BURSARIES CLOSING IN OCTOBER 2026',
    url:'https://www.zabursaries.co.za/bursaries-closing-in-october-2026/',
    links:[
      {title:'NSFAS Funding',url:'https://www.zabursaries.co.za/nsfas-funding/'},
      {title:'Privacy Policy',url:'https://www.zabursaries.co.za/privacy/'}
    ]
  }]);
  assert.equal(rows.length,1);
  assert.equal(rows[0].suggested_type,'bursary');
  assert.equal(rows[0].reason,'source_index');
});

test('visitor click makes a missing content lead highest priority',()=>{
  const p=demandPriority({clicks:1,quality:10,fetchCount:1});
  const ordinary=demandPriority({clicks:0,quality:100,fetchCount:10,sourceChanged:true});
  assert.equal(p.priority,'highest');
  assert.ok(p.priority_score>ordinary.priority_score);
});

test('clicked missing URL becomes a private draft discovery row',()=>{
  const row=clickedDiscoveryRow({url:'https://source.example/new-bursary',title:'New Bursary',suggestedType:'bursary',sourcePostId:'p1'});
  assert.equal(row.review_status,'unreviewed');
  assert.equal(row.prepared_draft.status,'draft');
  assert.equal(row.detected_type,'bursary');
  assert.equal(row.source_payload.reason,'visitor_click');
});

test('public links include frontend-ready demand tracking metadata',()=>{
  const p=publicPost({
    id:'track1',slug:'tracked-bursary',title:'Tracked Bursary',content_type:'bursary',summary:'Funding',
    body_markdown:'Details',posted_date:'2026-10-01',category:'Bursaries',categories:['Bursaries'],tags:['Bursaries'],
    topics:[],related_links:[{title:'Official guide',url:'https://example.org/guide'}],related_ids:[],recommendation_ids:[],
    recommendation_links:[{title:'Another bursary',url:'https://source.example/another'}],documents:[],navigation_links:[],
    type_data:{provider:'Example',closing_date:'2026-11-01',status_override:'open',application_url:'https://apply.example.org'},
    status:'published',created_at:'2026-10-01',updated_at:'2026-10-01'
  });
  assert.equal(p.related_links[0].tracking.event_type,'related_click');
  assert.equal(p.recommendation_links[0].tracking.event_type,'recommendation_click');
  assert.equal(p.recommendation_links[0].tracking.target_url,'https://source.example/another');
  assert.equal(p.application_tracking.event_type,'application_click');
});

test('reference bootstrap is coded to publish and artifact-sync the 40 seed records',()=>{
  const src=fs.readFileSync(new URL('../src/lib/reference-seed.mjs',import.meta.url),'utf8');
  assert.match(src,/status:'published'/);
  assert.match(src,/publishPostArtifact\(store,post\)/);
  const seed=loadSouthAfricaReferenceSeed();
  assert.equal(seed.rows.length,40);
});

test('dashboard exposes demand queue and richer analytics',()=>{
  const html=fs.readFileSync(new URL('../public/admin/index.html',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(html,/data-view="demand"/);
  assert.match(ui,/Missing content users actually want/);
  assert.match(ui,/Top searches/);
  assert.match(ui,/Visitors by country/);
  assert.match(ui,/Fetch & process/);
});


test('editor limits are practical and no longer use the old 60/320 caps',()=>{
  assert.ok(CONTENT_LIMITS.tag>=120);
  assert.ok(CONTENT_LIMITS.seo_description>=1000);
  assert.ok(CONTENT_LIMITS.summary>=2000);
  assert.equal(SEO_GUIDANCE.description_recommended,160);
});

test('validation details preserve exact field paths for the dashboard',()=>{
  const details=zodValidationDetails({issues:[
    {path:['tags',2],message:'Each tag can be at most 120 characters',code:'too_big',maximum:120},
    {path:['seo_description'],message:'SEO description can be at most 1000 characters',code:'too_big',maximum:1000}
  ]});
  assert.equal(details.issues[0].path,'tags.2');
  assert.equal(details.issues[1].path,'seo_description');
  assert.deepEqual(details.fieldErrors.tags,['Each tag can be at most 120 characters']);
});

test('dashboard editor shows counters tag validation and SEO preview instead of raw limits',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  const css=fs.readFileSync(new URL('../public/admin/styles.css',import.meta.url),'utf8');
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  assert.match(ui,/field-counter/);
  assert.match(ui,/tagPreview/);
  assert.match(ui,/seoPreview/);
  assert.match(ui,/showEditorValidation/);
  assert.doesNotMatch(ui,/SEO description<input name="seo_description" maxlength="320"/);
  assert.match(css,/\.field\.invalid/);
  assert.match(admin,/\/content-constraints/);
  assert.match(admin,/Each tag can be at most/);
  assert.match(admin,/SEO description can be at most/);
});

test('content editor disables save while submitting and restores it after errors',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/save\.disabled=true/);
  assert.match(ui,/save\.disabled=false/);
  assert.match(ui,/Saving…/);
});


test('Africa reference seed adds forty permanent opportunities across eight countries',()=>{
  const seed=loadAfricaReferenceSeed();
  assert.equal(seed.rows.length,40);
  assert.equal(seed.metadata.countries.length,8);
  assert.equal(seed.rows.filter(x=>x.detected_type==='job').length,16);
  assert.equal(seed.rows.filter(x=>x.detected_type==='internship').length,7);
  assert.equal(seed.rows.filter(x=>x.detected_type==='bursary').length,16);
  assert.equal(seed.rows.filter(x=>x.detected_type==='learnership').length,1);
  assert.deepEqual(new Set(seed.rows.map(x=>x.prepared_draft.geo.country_code)),new Set(['KE','NG','GH','UG','TZ','ZM','ZW','BW']));
});

test('all permanent reference datasets total eighty records',()=>{
  const all=loadAllReferenceSeeds();
  assert.equal(all.record_count,80);
  assert.equal(all.datasets.length,2);
  assert.equal(loadSouthAfricaReferenceSeed().rows.length,40);
});

test('Africa and major-market country names normalize to ISO-style codes',()=>{
  assert.equal(normalizeCountryCode('Kenya'),'KE');
  assert.equal(normalizeCountryCode('Ghana'),'GH');
  assert.equal(normalizeCountryCode('Uganda'),'UG');
  assert.equal(normalizeCountryCode('Tanzania'),'TZ');
  assert.equal(normalizeCountryCode('Zambia'),'ZM');
  assert.equal(normalizeCountryCode('Zimbabwe'),'ZW');
  assert.equal(normalizeCountryCode('Botswana'),'BW');
  assert.equal(normalizeCountryCode('Germany'),'DE');
});

test('smart related content strongly prefers shared organisation country tags and type',()=>{
  const base={id:'a',status:'published',content_type:'bursary',geo:{country_code:'ZA'},tags:['NSFAS','Engineering'],categories:['Bursaries'],classification:{organisation:'Example Fund',fields_of_study:['Engineering']}};
  const strong={id:'b',status:'published',content_type:'bursary',geo:{country_code:'ZA'},tags:['NSFAS','Engineering'],categories:['Bursaries'],classification:{organisation:'Example Fund',fields_of_study:['Engineering']}};
  const weak={id:'c',status:'published',content_type:'job',geo:{country_code:'GB'},tags:['Retail'],categories:['Jobs'],classification:{organisation:'Other Org'}};
  assert.ok(relationScore(base,strong)>relationScore(base,weak));
  assert.equal(smartRelated(base,[weak,strong],{limit:1})[0].post.id,'b');
});

test('global harvest exposes expanded public-feed and public-board providers without requiring AI',()=>{
  const ids=GLOBAL_HARVEST_PROVIDERS.map(x=>x.id);
  assert.deepEqual(ids,['arbeitnow','jobicy','remoteok','remotive','lever','ashby','greenhouse','workable','smartrecruiters']);
  assert.ok(GLOBAL_HARVEST_PROVIDERS.filter(x=>x.attribution).length>=4);
});

test('Source Hub dashboard exposes categorized sources and expanded harvest controls',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/admin/index.html',import.meta.url),'utf8');
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  assert.match(html,/data-view="sources"/);
  assert.match(ui,/One hub, many source families/);
  assert.match(ui,/All categories/);
  assert.match(ui,/Greenhouse board tokens/);
  assert.match(ui,/Workable account subdomains/);
  assert.match(ui,/SmartRecruiters company identifiers/);
  assert.match(ui,/Start harvest/);
  assert.match(admin,/\/sources\/hub/);
  assert.match(admin,/sourceHubPayload/);
  assert.match(admin,/\/harvest\/global/);
  assert.match(admin,/expandRelated:z\.boolean/);
});

test('Content Library has country source opportunity and sort filters',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/id="postCountry"/);
  assert.match(ui,/id="postSource"/);
  assert.match(ui,/id="opStatus"/);
  assert.match(ui,/id="postSort"/);
});

test('deep sync importer can fetch discovered related detail pages',()=>{
  const src=fs.readFileSync(new URL('../src/lib/importer.mjs',import.meta.url),'utf8');
  assert.match(src,/expandRelatedRecords/);
  assert.match(src,/relatedPagesFetched/);
  assert.match(src,/\/extract\?url=/);
});


test('PostgreSQL public filters keep parameter markers and import search includes source URLs',async()=>{
  const src=fs.readFileSync(new URL('../src/lib/store-postgres.mjs',import.meta.url),'utf8');
  assert.match(src,/status=\$\$\{n\}/);
  assert.match(src,/content_type=\$\$\{n\}/);
  assert.doesNotMatch(src,/status=\$\{p\.length\}/);

  const fake=Object.create(PostgresStore.prototype);
  fake.tableColumns=async()=>new Set(['source_key','source_name','source_slug','source_url','source_payload','review_status','detected_type','updated_at']);
  let query='',params=[];
  fake.q=async(sql,p=[])=>{query=sql;params=p;return{rows:[]}};
  await fake.listImports({q:'bursary'});
  assert.match(query,/source_url/);
  assert.match(query,/\$1/);
  assert.deepEqual(params,['%bursary%']);
});


test('source catalog keeps expanding beyond the original eight',()=>{
  const original=new Set(['dailyupdate','zabursaries','psychometric-test','arbeitnow','jobicy','remoteok','lever','ashby']);
  assert.equal(SOURCE_CATALOG.length,30);
  assert.equal(SOURCE_CATALOG.filter(x=>!original.has(x.id)).length,22);
  assert.equal(SOURCE_CATEGORIES.length,6);
  assert.ok(SOURCE_CATALOG.some(x=>x.id==='eures'&&x.integration_status==='discovery'));
  assert.ok(SOURCE_CATALOG.some(x=>x.id==='usajobs'&&x.integration_status==='credentials_required'));
  assert.ok(SOURCE_CATALOG.some(x=>x.id==='adzuna'&&x.integration_status==='licence_required'));
  assert.ok(SOURCE_CATALOG.some(x=>x.id==='recruitee'&&x.integration_status==='credentials_required'));
});

test('categorized Source Hub reports source health without exposing it through the public catalog',()=>{
  const payload=sourceHubPayload({
    imports:[{source_name:'Remotive',source_url:'https://remotive.com/remote-jobs/x',review_status:'unreviewed',quality_score:90,last_seen_at:'2026-10-01'}],
    posts:[{source:{source_name:'Remotive',source_url:'https://remotive.com/remote-jobs/x'},status:'published',deleted_at:null}],
    permanentRecords:80
  });
  assert.equal(payload.totals.sources,30);
  assert.equal(payload.categories.length,6);
  const remotive=payload.sources.find(x=>x.id==='remotive');
  assert.equal(remotive.stats.imports,1);
  assert.equal(remotive.stats.published,1);
  assert.equal(remotive.stats.average_quality,90);
});

test('Editor and Content Worker are publishing employees but cannot access CEO intelligence areas',()=>{
  for(const role of ['editor','content_worker']){
    assert.equal(hasPermission(role,'imports.view'),true);
    assert.equal(hasPermission(role,'imports.review'),true);
    assert.equal(hasPermission(role,'posts.edit'),true);
    assert.equal(hasPermission(role,'posts.publish'),true);
    assert.equal(hasPermission(role,'media.upload'),true);
    assert.equal(hasPermission(role,'imports.fetch'),false);
    assert.equal(hasPermission(role,'dashboard.view'),false);
    assert.equal(hasPermission(role,'analytics.view'),false);
    assert.equal(hasPermission(role,'team.view'),false);
    assert.equal(hasPermission(role,'settings.view'),false);
    assert.equal(hasPermission(role,'audit.view'),false);
  }
  assert.equal(ROLE_LABELS.owner,'CEO / Owner');
  assert.equal(hasPermission('owner','anything.at.all'),true);
});

test('worker access is enforced in backend routes and mirrored in dashboard navigation',()=>{
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(admin,/sources\/hub',permit\('imports\.fetch'\)/);
  assert.match(admin,/imports\/priority',permit\('imports\.fetch'\)/);
  assert.match(admin,/hasPermission\(req\.user\.role,'posts\.publish'\)/);
  assert.match(ui,/VIEW_PERMISSION/);
  assert.match(ui,/firstAllowedView/);
  assert.match(ui,/applyAccess/);
  assert.match(ui,/Editors and Content Workers only see Import Inbox, Content Library and Media/);
  assert.match(ui,/\$\$\('\#nav button\[data-view\]'\)\.forEach/);
});

test('employee productivity is audit-derived and shown to the CEO',()=>{
  const demo=fs.readFileSync(new URL('../src/lib/store-demo.mjs',import.meta.url),'utf8');
  const pg=fs.readFileSync(new URL('../src/lib/store-postgres.mjs',import.meta.url),'utf8');
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  for(const src of [demo,pg]){
    assert.match(src,/teamPerformance/);
    assert.match(src,/import\.clean/);
    assert.match(src,/import\.promote/);
    assert.match(src,/post\.publish/);
  }
  assert.match(admin,/import\.clean/);
  assert.match(admin,/teamPerformance/);
  assert.match(ui,/Cleaned records/);
  assert.match(ui,/Published by employees/);
  assert.match(ui,/Apo is CEO\. Employees clean and publish/);
});

test('public API advertises source catalog without public internal source counts',()=>{
  const route=fs.readFileSync(new URL('../src/routes/public.mjs',import.meta.url),'utf8');
  assert.match(route,/publicRouter\.get\('\/sources'/);
  assert.match(route,/source_catalog_version:2/);
  assert.match(route,/internal_counts_hidden:true/);
  assert.match(route,/endpoint:'\/api\/v1\/sources'/);
});


test('direct application candidate selection rejects the source article itself',()=>{
  const row={
    source_url:'https://publisher.example/job-story',
    source_payload:{links:[
      {title:'Read this story',url:'https://publisher.example/job-story'},
      {title:'Apply on employer careers portal',url:'https://careers.example.org/apply/123'},
      {title:'Privacy',url:'https://publisher.example/privacy'}
    ]},
    prepared_draft:{type_data:{application_url:'https://publisher.example/job-story'}}
  };
  const candidates=applicationCandidates(row);
  assert.equal(candidates[0].url,'https://careers.example.org/apply/123');
  assert.ok(!candidates.some(x=>x.url===row.source_url));
});

test('application guide adds useful steps without inventing source-specific requirements',()=>{
  const guide=buildApplicationGuide({
    title:'Example Bursary',
    type_data:{
      requirements:'Applicants must meet the published academic criteria.',
      how_to_apply:'Create an account.\nComplete the online form.\nUpload the requested documents.',
      supporting_documents:'Identity document\nAcademic record'
    }
  },{verified:true,final_url:'https://apply.example.org'});
  assert.equal(guide.useful,true);
  assert.equal(guide.official_application_url,'https://apply.example.org');
  assert.ok(guide.steps.length>=4);
  assert.ok(guide.supporting_documents.includes('Identity document'));
});

test('plain-English news drafts are structured attributed summaries rather than copied article pages',()=>{
  const draft=plainEnglishNewsDraft({
    title:'Department announces new student support programme',
    url:'https://official.example/news/support',
    contentText:'The department announced a new support programme for university students. The programme will begin next month. Students should check the official notice for eligibility requirements and dates.',
    publishedAt:'2026-10-01'
  },{label:'Official Department',country_code:'ZA'});
  assert.equal(draft.content_type,'news');
  assert.match(draft.body_markdown,/In simple terms/);
  assert.match(draft.body_markdown,/Key points/);
  assert.match(draft.body_markdown,/Official Department/);
  assert.equal(draft.geo.country_code,'ZA');
});

test('official news engine is limited to ten-at-a-time feeds',()=>{
  assert.ok(NEWS_FEEDS.some(x=>x.id==='sanews'));
  assert.ok(NEWS_FEEDS.some(x=>x.id==='dsti'));
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  assert.match(admin,/\/harvest\/news/);
  assert.match(admin,/max\(10\)/);
  assert.match(admin,/\/imports\/process-batch/);
  assert.match(admin,/limit:z\.number\(\)\.int\(\)\.min\(1\)\.max\(10\)/);
});

test('published opportunities can create separate R2 application-guide artifacts',()=>{
  const pub=fs.readFileSync(new URL('../src/lib/publication-service.mjs',import.meta.url),'utf8');
  const routes=fs.readFileSync(new URL('../src/routes/public.mjs',import.meta.url),'utf8');
  assert.match(pub,/todayinfo\.application-guide\.v1/);
  assert.match(pub,/collection:'guides'/);
  assert.match(pub,/application_guide/);
  assert.match(routes,/\/guides\/\:slug/);
  assert.match(routes,/loadApplicationGuideArtifact/);
});

test('recommendations stay inside education career or news families',()=>{
  assert.equal(recommendationFamily({content_type:'bursary'}),'education');
  assert.equal(recommendationFamily({content_type:'job'}),'career');
  assert.equal(recommendationFamily({content_type:'news'}),'news');
  assert.equal(recommendationCompatible({content_type:'bursary'},{content_type:'scholarship'}),true);
  assert.equal(recommendationCompatible({content_type:'bursary'},{content_type:'job'}),false);
});

test('traffic atlas aggregates countries into continents and action counts',()=>{
  assert.equal(continentForCode('ZA'),'Africa');
  assert.equal(continentForCode('GB'),'Europe');
  const atlas=buildTrafficAtlas([
    {code:'ZA',visitors:4,events:10,views:6,searches:2,application_clicks:1},
    {code:'NG',visitors:2,events:5,views:3,searches:1,application_clicks:1},
    {code:'GB',visitors:3,events:7,views:4,searches:2}
  ]);
  assert.equal(atlas.countries.length,3);
  assert.equal(atlas.continents.find(x=>x.name==='Africa').visitors,6);
});

test('dashboard exposes official-news batches direct-link processing and world traffic atlas',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/Discover 10/);
  assert.match(ui,/Process 10/);
  assert.match(ui,/Checking apply links/);
  assert.match(ui,/WORLD TRAFFIC ATLAS/);
  assert.match(ui,/application clicks/);
});


test('repair: dashboard collection selectors use the multi-element helper',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  const forbidden=[
    "$('#nav button[data-view]').forEach",
    "$('#nav p').forEach",
    "$('.traffic-dot').forEach",
    "$('.continent-card').forEach",
    "$('.run-news').forEach",
    "$('.choose-harvest').forEach"
  ];
  for(const pattern of forbidden){
    const trueSingle=ui.split('\n').some(line=>line.trimStart().startsWith(pattern));
    assert.equal(trueSingle,false,pattern);
  }
  assert.match(ui,/\$\$\('#nav button\[data-view\]'\)\.forEach/);
  assert.match(ui,/\$\$\('\.traffic-dot'\)\.forEach/);
});

test('repair: Import Inbox review is editable and can save then promote',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/Clean imported content/);
  assert.match(ui,/name="title"/);
  assert.match(ui,/name="summary"/);
  assert.match(ui,/name="body_markdown"/);
  assert.match(ui,/name="application_url"/);
  assert.match(ui,/Save cleanup/);
  assert.match(ui,/Save & promote to draft/);
  assert.match(ui,/Open draft/);
});

test('repair: partial import cleanup merges with the existing prepared draft',()=>{
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  assert.match(admin,/const current=await store\.getImport\(req\.params\.id\)/);
  assert.match(admin,/\.\.\.oldDraft,\.\.\.incoming/);
  assert.match(admin,/type_data:\{\.\.\.\(oldDraft\.type_data\|\|\{\}\),\.\.\.\(incoming\.type_data\|\|\{\}\)\}/);
});

test('repair: DailyUpdate and bursary source fetches have fallback candidates',()=>{
  assert.deepEqual(sourceEndpointCandidates('dailyupdate/jobs'),['/dailyupdate/jobs','/dailyupdate','/articles','/search?q=jobs']);
  assert.deepEqual(sourceEndpointCandidates('bursaries'),['/bursaries','/search?q=bursary']);
  const src=fs.readFileSync(new URL('../src/lib/importer.mjs',import.meta.url),'utf8');
  assert.match(src,/attempts=3/);
  assert.match(src,/Source API returned HTTP/);
});

test('repair: Deep Sync defaults to all years instead of silently filtering current year',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/Leave blank to fetch all years/);
  assert.doesNotMatch(ui,/name="year" inputmode="numeric" value="\$\{currentYear\}"/);
});

test('repair: Source Hub publishes explicit non-AI reuse and paraphrase policies',()=>{
  const sanews=SOURCE_CATALOG.find(x=>x.id==='sanews');
  const gov=SOURCE_CATALOG.find(x=>x.id==='govza');
  const jobs=SOURCE_CATALOG.find(x=>x.id==='greenhouse');
  const daily=SOURCE_CATALOG.find(x=>x.id==='dailyupdate');
  const bursary=SOURCE_CATALOG.find(x=>x.id==='zabursaries');
  const a=sourcePublishingPolicy(sanews),b=sourcePublishingPolicy(gov),c=sourcePublishingPolicy(jobs);
  assert.equal(a.ai_rewriting,false);
  assert.equal(a.mode,'manual_editorial_summary');
  assert.equal(a.can_paraphrase,true);
  assert.equal(a.auto_publish,false);
  assert.equal(b.mode,'facts_and_link');
  assert.equal(c.mode,'structured_facts_and_link');
  assert.equal(c.can_paraphrase,false);
  assert.equal(c.auto_publish,true);
  assert.equal(sourcePublishingPolicy(daily).auto_publish,false);
  assert.equal(sourcePublishingPolicy(daily).can_paraphrase,false);
  assert.equal(sourcePublishingPolicy(bursary).auto_publish,false);
  assert.equal(sourcePublishingPolicy(bursary).can_paraphrase,false);
});

test('repair: official news discovery is private and never auto-rewrites or auto-publishes',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  const news=fs.readFileSync(new URL('../src/lib/news-harvest.mjs',import.meta.url),'utf8');
  assert.match(ui,/Discover 10/);
  assert.match(ui,/manual editing required/);
  assert.match(admin,/discoverOfficialNews/);
  assert.match(admin,/manual_review_required:true/);
  assert.match(news,/manual_editorial_summary/);
  assert.match(news,/auto_rewrite:false/);
});

test('repair: CEO Owner still has full edit review promote and publish permissions',()=>{
  assert.equal(hasPermission('owner','imports.view'),true);
  assert.equal(hasPermission('owner','imports.fetch'),true);
  assert.equal(hasPermission('owner','imports.review'),true);
  assert.equal(hasPermission('owner','posts.view'),true);
  assert.equal(hasPermission('owner','posts.edit'),true);
  assert.equal(hasPermission('owner','posts.publish'),true);
});


test('v0.8.2: DailyUpdate has a final search fallback and diagnostics are wired',()=>{
  assert.deepEqual(sourceEndpointCandidates('dailyupdate/jobs'),['/dailyupdate/jobs','/dailyupdate','/articles','/search?q=jobs']);
  assert.deepEqual(sourceEndpointCandidates('bursaries'),['/bursaries','/search?q=bursary']);
  assert.equal(typeof probeLegacySources,'function');
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(admin,/\/sources\/diagnostics/);
  assert.match(ui,/Check jobs & bursaries health/);
  assert.match(ui,/r\.usedEndpoint/);
});

test('v0.8.2: current main repair keeps editable import review and safe news draft-first behavior',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  assert.match(ui,/Clean imported content/);
  assert.match(ui,/Save cleanup/);
  assert.match(ui,/Save & promote to draft/);
  assert.match(admin,/autoPublish:z\.boolean\(\)\.optional\(\)\.default\(false\)/);
  assert.equal(hasPermission('owner','posts.publish'),true);
});


test('v0.8.3: legacy raw_imports schemas still support Import Inbox searches',async()=>{
  const fake=Object.create(PostgresStore.prototype);
  fake.tableColumns=async()=>new Set([
    'id','source_key','source_name','source_url','source_payload',
    'detected_type','prepared_draft','review_status','created_at','updated_at'
  ]);
  let query='',params=[];
  fake.q=async(sql,p=[])=>{query=sql;params=p;return{rows:[]}};
  await fake.listImports({q:'bursary'});
  assert.match(query,/source_url/);
  assert.match(query,/order by coalesce\(updated_at,created_at\) desc/);
  assert.doesNotMatch(query,/source_record_date/);
  assert.doesNotMatch(query,/last_seen_at/);
  assert.deepEqual(params,['%bursary%']);
});

test('v0.8.3: legacy import upsert only writes columns present in Supabase',async()=>{
  const fake=Object.create(PostgresStore.prototype);
  fake.tableColumns=async()=>new Set([
    'id','source_key','source_name','source_url','source_payload',
    'detected_type','prepared_draft','review_status','created_at','updated_at'
  ]);
  const queries=[];
  fake.q=async(sql,params=[])=>{queries.push({sql,params});return{rows:[{inserted:true}]}};
  const result=await fake.upsertImports([{
    source_key:'legacy:test',source_name:'Legacy Source',source_url:'https://example.com/item',
    source_payload:{title:'Item'},detected_type:'bursary',
    prepared_draft:{title:'Item'},review_status:'unreviewed',
    source_hash:'new-column',quality_score:99
  }]);
  assert.equal(result.inserted,1);
  assert.equal(result.legacy_schema,true);
  assert.doesNotMatch(queries[0].sql,/source_hash/);
  assert.doesNotMatch(queries[0].sql,/quality_score/);
  assert.match(queries[0].sql,/source_key/);
});

test('v0.8.3: Demand Queue survives unavailable click analytics',async()=>{
  const fake=Object.create(PostgresStore.prototype);
  fake.listImports=async()=>[{id:'1',source_url:'https://example.com/item',review_status:'unreviewed',quality_score:80,fetch_count:1,updated_at:'2026-10-01'}];
  fake.q=async()=>{throw new Error('analytics temporarily unavailable')};
  const rows=await fake.priorityImports({limit:10});
  assert.equal(rows.length,1);
  assert.equal(rows[0].source_url,'https://example.com/item');
  assert.ok(rows[0].priority);
});

test('v0.8.3: admin assets cannot keep stale repaired JavaScript',()=>{
  const server=fs.readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(server,/maxAge:0/);
  assert.match(server,/no-store, no-cache, must-revalidate/);
});


test('v0.8.4: direct legacy fallback parses only metadata and useful links',async()=>{
  const original=globalThis.fetch;
  const html=`<!doctype html><html><head>
    <title>Example Engineering Bursary 2027</title>
    <meta name="description" content="Example Fund is inviting students to apply for its 2027 engineering bursary.">
    <link rel="canonical" href="https://www.zabursaries.co.za/example-engineering-bursary/">
  </head><body>
    <h1>Example Engineering Bursary 2027</h1>
    <article><p>This long article text must not become the fallback draft body.</p></article>
    <a href="https://apply.example.org/bursary">Apply for the bursary</a>
    <a href="/another-bursary/">Another Science Bursary 2027</a>
  </body></html>`;
  globalThis.fetch=async()=>new Response(html,{status:200,headers:{'content-type':'text/html; charset=utf-8'}});
  try{
    const anchors=parseDirectAnchors(html,'https://www.zabursaries.co.za/example-engineering-bursary/');
    assert.ok(anchors.some(x=>x.url==='https://apply.example.org/bursary'));
    const row=await fetchDirectSourceRecord('https://www.zabursaries.co.za/example-engineering-bursary/');
    assert.equal(row.sourceId,'zabursaries');
    assert.equal(row.directFallback,true);
    assert.equal(row.contentText,'Example Fund is inviting students to apply for its 2027 engineering bursary.');
    assert.ok(!row.contentText.includes('long article text'));
    assert.equal(row.applicationLinks[0].url,'https://apply.example.org/bursary');
  }finally{globalThis.fetch=original}
});

test('v0.8.4: source importer falls back to ZA Bursaries website and keeps results private-quality',async()=>{
  const original=globalThis.fetch;
  const indexHtml=`<html><body><a href="/government-bursaries-south-africa/example-bursary/">Example Municipality Bursary 2027</a></body></html>`;
  const detailHtml=`<html><head><meta name="description" content="Example Municipality bursary opportunity for 2027 studies."><link rel="canonical" href="https://www.zabursaries.co.za/government-bursaries-south-africa/example-bursary/"></head><body><h1>Example Municipality Bursary 2027</h1><a href="https://apply.example.gov.za/form">Application form</a></body></html>`;
  globalThis.fetch=async url=>{
    const u=String(url);
    if(u.startsWith('https://todayinfo-zpshgscq.manus.space/api/v1/')){
      return new Response(JSON.stringify({data:{records:[]},meta:{pagination:{totalPages:1}}}),{status:200,headers:{'content-type':'application/json'}});
    }
    if(u.includes('example-bursary'))return new Response(detailHtml,{status:200,headers:{'content-type':'text/html'}});
    if(u.startsWith('https://www.zabursaries.co.za/'))return new Response(indexHtml,{status:200,headers:{'content-type':'text/html'}});
    throw new Error('Unexpected URL '+u);
  };
  try{
    assert.equal(directFallbackSupports('bursaries'),true);
    const direct=await fetchDirectSourceFallback('bursaries',{limit:5});
    assert.equal(direct.records.length,1);
    const out=await fetchImports({kind:'bursaries',maxPages:1,expand:false,expandRelated:false});
    assert.equal(out.stats.directFallbackUsed,true);
    assert.equal(out.stats.usedEndpoint,'direct:zabursaries');
    assert.ok(out.rows.length>=1);
    const row=out.rows.find(x=>x.source_id==='zabursaries');
    assert.ok(row);
    assert.ok(Number(row.quality_score)<=55);
    assert.ok((row.quality_issues||[]).some(x=>/manual review|review and edit/i.test(x)));
  }finally{globalThis.fetch=original}
});

test('v0.8.4: direct website fallback can never auto-publish from the import fetch route',()=>{
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  assert.match(admin,/autoPublishRequested/);
  assert.match(admin,/autoPublishRequested&&!sync\.stats\.directFallbackUsed/);
  assert.match(admin,/direct-website-fallback-needs-human-review/);
});

test('v0.8.4: Demand Queue and Source Hub explain direct fallback review behavior',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  const importer=fs.readFileSync(new URL('../src/lib/importer.mjs',import.meta.url),'utf8');
  assert.match(ui,/direct website fallback used — review required/);
  assert.match(ui,/Fetched directly from the source website into Import Inbox/);
  assert.match(ui,/manual review required/);
  assert.match(importer,/fetchDirectSourceFallback/);
  assert.match(importer,/fetchDirectSourceRecord/);
  assert.match(importer,/Direct website fallback — review and edit before publishing/);
});


test('v0.8.5: source policy overrides autoPublish requests for narrative sources',()=>{
  const daily=importPublishingPolicy({source_name:'DailyUpdate',source_url:'https://dailyupdate.co.za/example-job/'});
  const bursary=importPublishingPolicy({source_name:'ZA Bursaries',source_url:'https://www.zabursaries.co.za/example-bursary/'});
  const greenhouse=importPublishingPolicy({source_name:'Greenhouse · Example',source_url:'https://boards.greenhouse.io/example/jobs/1'});
  assert.equal(daily.auto_publish,false);
  assert.equal(daily.ai_rewriting,false);
  assert.equal(bursary.auto_publish,false);
  assert.equal(greenhouse.auto_publish,true);
});

test('v0.8.5: every automatic publishing path enforces source policy',()=>{
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  assert.ok((admin.match(/Source policy requires manual review/g)||[]).length>=3);
  assert.match(admin,/importPublishingPolicy/);
});

test('v0.8.5: Source Hub visibly reports rights AI rewriting and auto-publish policy',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/AI rewriting:/);
  assert.match(ui,/Auto publish:/);
  assert.match(ui,/Rights:/);
  assert.match(ui,/Discover 10/);
});

test('v0.8.5: CEO editing Import Inbox and Demand Queue controls remain intact',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/class="ghost review-import"/);
  assert.match(ui,/class="primary promote-import"/);
  assert.match(ui,/Fetch & process/);
  assert.match(ui,/Save cleanup/);
  assert.match(ui,/Save & promote to draft/);
  assert.match(ui,/openPostEditor/);
  assert.equal(hasPermission('owner','imports.review'),true);
  assert.equal(hasPermission('owner','posts.edit'),true);
  assert.equal(hasPermission('owner','posts.publish'),true);
});


test('global country names and search aliases normalize correctly',()=>{
  assert.equal(normalizeCountryCode('Namibia'),'NA');
  assert.equal(normalizeCountryCode('South Africa'),'ZA');
  const filters=queryFilters({search:'software developer',countryName:'Namibia'});
  assert.equal(filters.q,'software developer');
  assert.equal(filters.country,'NA');
});

test('search tolerates useful multi-word queries while keeping relevance',()=>{
  const post={
    content_type:'job',title:'Graduate Software Developer',summary:'Entry level technology role',
    body_markdown:'Build web applications',category:'Jobs',categories:['Jobs'],tags:['Technology'],
    type_data:{company:'Example Tech'},geo:{country_code:'ZA',country_name:'South Africa',city:'Johannesburg'},
    classification:{organisation:'Example Tech',fields_of_study:['Computer Science'],education_level:[],eligibility_tags:[],keywords:['graduate']}
  };
  assert.equal(matchesSearch(post,'software developer johannesburg technology'),true);
  assert.equal(matchesSearch(post,'medical nursing hospital'),false);
});

test('shared token search works with country and type across storage modes',()=>{
  const post={
    content_type:'job',title:'Graduate Software Developer',summary:'Entry level role',
    body_markdown:'Build web applications',category:'Jobs',categories:['Jobs'],tags:['Technology'],
    type_data:{company:'Example Tech'},geo:{country_code:'ZA',country_name:'South Africa',city:'Johannesburg'},
    classification:{organisation:'Example Tech',fields_of_study:['Computer Science'],education_level:[],eligibility_tags:[],keywords:['graduate']}
  };
  assert.equal(matchesSearch(post,'software johannesburg'),true);
  assert.equal(filterPost(post,{q:'software johannesburg',country:'ZA',type:'job'}),true);
  assert.equal(filterPost(post,{q:'software johannesburg',country:'GB',type:'job'}),false);
  assert.equal(queryFilters({country:'South Africa',type:'job',q:'software'}).country,'ZA');
});

test('private ingestion creates descriptive SEO slugs and structured rule-based content',()=>{
  const item={
    title:'Graduate Software Developer',company:'Example Tech',city:'Johannesburg',
    source_url:'https://publisher.example/jobs/123',application_url:'https://careers.example.com/jobs/123',
    requirements:['Degree or diploma','JavaScript'],closing_date:'2026-11-30'
  };
  const slug=descriptiveOpportunitySlug(item,'job','ZA');
  assert.match(slug,/example-tech-graduate-software-developer-johannesburg-za-2026/);
  const prepared=preparePrivateIngestItem(item,{type:'job',country_code:'ZA',country_name:'South Africa'});
  assert.equal(prepared.draft.geo.country_code,'ZA');
  assert.equal(prepared.draft.content_type,'job');
  assert.match(prepared.draft.body_markdown,/## Overview/);
  assert.match(prepared.draft.body_markdown,/## Requirements/);
});

test('private ingestion API is secret protected and enforces 50 jobs or 100 bursaries',()=>{
  const route=fs.readFileSync(new URL('../src/routes/internal.mjs',import.meta.url),'utf8');
  const server=fs.readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
  const config=fs.readFileSync(new URL('../src/config.mjs',import.meta.url),'utf8');
  assert.match(route,/x-todayinfo-ingest-key/);
  assert.match(route,/input\.type==='job'\?50:100/);
  assert.match(route,/verifyApplicationUrl/);
  assert.match(route,/config\.autoPublishMinScore/);
  assert.match(server,/\/internal\/ingest\/v1/);
  assert.match(config,/TODAYINFO_INGEST_KEY/);
});

test('CEO Import Inbox Demand Queue and content editor controls remain wired',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  assert.match(ui,/\$\$\('\#nav button\[data-view\]'\)\.forEach/);
  assert.equal(ui.split('\n').some(line=>line.trim().startsWith("$('#nav button[data-view]').forEach")),false);
  assert.match(ui,/id="saveImportReview"/);
  assert.match(ui,/id="promoteImport"/);
  assert.match(ui,/id="publishImport"/);
  assert.match(ui,/fetch-demand/);
  assert.match(ui,/review-demand/);
  assert.match(ui,/openImportReview/);
});

test('public API exposes application prominently and paginates filtered search',()=>{
  const serializer=fs.readFileSync(new URL('../src/lib/serializers.mjs',import.meta.url),'utf8');
  const routes=fs.readFileSync(new URL('../src/routes/public.mjs',import.meta.url),'utf8');
  assert.match(serializer,/label:'Apply on the official website'/);
  assert.match(serializer,/application:\['bursary','scholarship','job','internship','learnership','opportunity'\]/);
  assert.match(routes,/const payload=paginate\(items,req\.query\.page,req\.query\.limit\)/);
  assert.match(routes,/req\.query\.query/);
});


test('production deployment defaults to port 3009 and keeps the R2 bucket name',()=>{
  const config=fs.readFileSync(new URL('../src/config.mjs',import.meta.url),'utf8');
  const env=fs.readFileSync(new URL('../.env.production.example',import.meta.url),'utf8');
  assert.match(config,/process\.env\.PORT \|\| 3009/);
  assert.match(config,/https:\/\/todayinfo\.co\.za/);
  assert.match(config,/https:\/\/api\.todayinfo\.co\.za/);
  assert.match(env,/PORT=3009/);
  assert.match(env,/R2_BUCKET=todayinfo/);
  assert.match(env,/SEED_ADMIN_USERNAME=apo/);
});

test('public API caching is fast while admin auth and writes stay no-store',()=>{
  const server=fs.readFileSync(new URL('../src/server.mjs',import.meta.url),'utf8');
  assert.match(server,/function publicApiCache/);
  assert.match(server,/Cloudflare-CDN-Cache-Control/);
  assert.match(server,/stale-while-revalidate=600/);
  assert.match(server,/stale-if-error=86400/);
  assert.match(server,/app\.use\('\/admin\/api\/auth',noStore,authRouter\)/);
  assert.match(server,/app\.use\('\/admin\/api',noStore,adminRouter\)/);
  assert.match(server,/app\.use\('\/internal\/ingest\/v1',noStore,internalRouter\)/);
});

test('VPS deployment files target nginx certbot and local node port 3009',()=>{
  const nginx=fs.readFileSync(new URL('../deploy/nginx/todayinfo-api.conf',import.meta.url),'utf8');
  const service=fs.readFileSync(new URL('../deploy/systemd/todayinfo-api.service',import.meta.url),'utf8');
  const guide=fs.readFileSync(new URL('../deploy/VPS_DEPLOY.md',import.meta.url),'utf8');
  assert.match(nginx,/server_name api\.todayinfo\.co\.za/);
  assert.match(nginx,/proxy_pass http:\/\/127\.0\.0\.1:3009/);
  assert.match(service,/EnvironmentFile=\/var\/www\/todayinfos\/\.env/);
  assert.match(service,/src\/server\.mjs/);
  assert.match(guide,/certbot --nginx -d api\.todayinfo\.co\.za/);
  assert.match(guide,/todayinfo\.co\.za/);
});

test('frontend production API config supports VPS primary and Render fallback',()=>{
  const config=fs.readFileSync(new URL('../frontend/api-config.production.js',import.meta.url),'utf8');
  const readme=fs.readFileSync(new URL('../frontend/README.md',import.meta.url),'utf8');
  assert.match(config,/https:\/\/api\.todayinfo\.co\.za\/api\/v1/);
  assert.match(config,/https:\/\/todayinfos\.onrender\.com\/api\/v1/);
  assert.match(readme,/_redirects/);
  assert.match(readme,/_headers/);
});
