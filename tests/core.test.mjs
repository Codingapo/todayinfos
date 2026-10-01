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
import { normalizeGeo, normalizeClassification, normalizeCountryCode, seoPath, filterPost } from '../src/lib/global-content.mjs';
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
import { relationScore, smartRelated } from '../src/lib/related-content.mjs';
import { GLOBAL_HARVEST_PROVIDERS } from '../src/lib/global-harvest.mjs';

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

test('global harvest exposes public-feed and public-board providers without requiring AI',()=>{
  const ids=GLOBAL_HARVEST_PROVIDERS.map(x=>x.id);
  assert.deepEqual(ids,['arbeitnow','jobicy','remoteok','lever','ashby']);
  assert.ok(GLOBAL_HARVEST_PROVIDERS.filter(x=>x.attribution).length>=3);
});

test('Source Hub dashboard exposes regional related-page fetch and global harvest controls',()=>{
  const ui=fs.readFileSync(new URL('../public/admin/app.js',import.meta.url),'utf8');
  const html=fs.readFileSync(new URL('../public/admin/index.html',import.meta.url),'utf8');
  const admin=fs.readFileSync(new URL('../src/routes/admin.mjs',import.meta.url),'utf8');
  assert.match(html,/data-view="sources"/);
  assert.match(ui,/Fetch pages/);
  assert.match(ui,/Start global harvest/);
  assert.match(ui,/Follow useful related opportunity pages/);
  assert.match(admin,/\/sources\/hub/);
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
