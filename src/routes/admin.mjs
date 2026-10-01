import { Router } from 'express';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { store } from '../lib/store.mjs';
import { requireAuth, requireCsrf, permit } from '../lib/auth.mjs';
import { fetchImports, probeLegacySources } from '../lib/importer.mjs';
import { saveUpload, mediaKind, retryPublicationQueue } from '../lib/r2.mjs';
import { publishPostArtifact, unpublishPostArtifact } from '../lib/publication-service.mjs';
import { sendInvite } from '../lib/resend.mjs';
import { ROLE_PERMISSIONS, ROLE_LABELS, hasPermission } from '../lib/rbac.mjs';
import { config } from '../config.mjs';
import { CONTENT_TYPE_DEFINITIONS, resolvedDefinition } from '../lib/content-types.mjs';
import { isSafeUrl, normalizeTags, contentQuality } from '../lib/content-rules.mjs';
import { normalizeGeo, normalizeClassification } from '../lib/global-content.mjs';
import { loadImportLearning, learnFromImports, publicLearningSummary } from '../lib/import-learning.mjs';
import { autoPublishDecision } from '../lib/auto-publish.mjs';
import { CONTENT_LIMITS, SEO_GUIDANCE, zodValidationDetails } from '../lib/content-constraints.mjs';
import { GLOBAL_HARVEST_PROVIDERS, harvestGlobalJobs } from '../lib/global-harvest.mjs';
import { sourceHubPayload } from '../lib/source-catalog.mjs';
import { harvestOfficialNews } from '../lib/news-harvest.mjs';
import { enrichApplicationImport } from '../lib/application-intelligence.mjs';

export const adminRouter=Router();
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:25*1024*1024}});
adminRouter.use(requireAuth,requireCsrf);
const ok=(res,data,meta)=>res.json({data,...(meta?{meta}:{})});
const audit=(req,action,type,id,meta={})=>store.audit(req.user.id,action,type,id,meta).catch(()=>{});
const safeUrl=z.string().max(CONTENT_LIMITS.url).refine(v=>!v||isSafeUrl(v),{message:'Use a valid http(s) or internal / URL'});
const nullableUrl=safeUrl.nullable().optional().or(z.literal(''));
const linkSchema=z.object({title:z.string().min(1).max(CONTENT_LIMITS.link_title),url:safeUrl,type:z.string().max(40).optional(),icon:z.string().max(40).optional().nullable()});
const documentSchema=z.object({title:z.string().min(1).max(CONTENT_LIMITS.document_title),url:safeUrl,type:z.string().max(40).optional().default('document'),mime_type:z.string().max(120).optional().nullable(),size_bytes:z.number().nonnegative().optional().nullable()});
const topicSchema=z.object({id:z.string().regex(/^t(?:[1-9]|10)$/).optional(),key:z.string().regex(/^t(?:[1-9]|10)$/).optional(),title:z.string().min(1).max(CONTENT_LIMITS.topic_title),body:z.string().max(CONTENT_LIMITS.topic_body).optional().default(''),links:z.array(linkSchema).max(30).optional().default([]),images:z.array(z.object({title:z.string().max(CONTENT_LIMITS.link_title).optional(),url:safeUrl})).max(20).optional().default([]),documents:z.array(documentSchema).max(20).optional().default([])});
const contentTypes=Object.keys(CONTENT_TYPE_DEFINITIONS);

function cleanTypeData(type,input={}){
  const allowed={
    news:['event_date'],announcement:['event_date'],
    bursary:['provider','opening_date','closing_date','status_override','requirements','eligibility','how_to_apply','supporting_documents','application_url','application_url_verified','application_route','application_guide'],
    scholarship:['provider','opening_date','closing_date','status_override','requirements','eligibility','how_to_apply','supporting_documents','application_url','application_url_verified','application_route','application_guide'],
    job:['company','location','salary','closing_date','status_override','requirements','responsibilities','how_to_apply','supporting_documents','application_url','application_url_verified','application_route','application_guide'],
    internship:['company','location','salary','closing_date','status_override','requirements','responsibilities','how_to_apply','supporting_documents','application_url','application_url_verified','application_route','application_guide'],
    learnership:['company','location','salary','closing_date','status_override','requirements','responsibilities','how_to_apply','supporting_documents','application_url','application_url_verified','application_route','application_guide'],
    opportunity:['closing_date','status_override','requirements','how_to_apply','supporting_documents','application_url','application_url_verified','application_route','application_guide'],
    other:['subtype'],story:[]
  }[type]||[];
  return Object.fromEntries(Object.entries(input||{}).filter(([k])=>allowed.includes(k)));
}
function publishProblems(post){
  const issues=[];if(!post.title?.trim())issues.push('Title is required.');if(!post.body_markdown?.trim())issues.push('Main content is required before publishing.');if(!post.tags?.length)issues.push('Add at least one tag.');
  if(['bursary','scholarship'].includes(post.content_type)){if(!post.type_data?.provider?.trim())issues.push('Funding provider is required.');if(!post.type_data?.closing_date)issues.push('Closing date is required.');}
  if(['job','internship','learnership'].includes(post.content_type)&&!post.type_data?.company?.trim())issues.push('Company / organisation is required.');
  return issues;
}
const geoSchema=z.object({
  country_code:z.string().max(3).optional().nullable(),country_name:z.string().max(120).optional().nullable(),
  region_code:z.string().max(30).optional().nullable(),region_name:z.string().max(120).optional().nullable(),
  city:z.string().max(120).optional().nullable(),location:z.string().max(220).optional().nullable()
}).optional().default({});
const classificationSchema=z.object({
  subcategory:z.string().max(120).optional().nullable(),opportunity_type:z.string().max(120).optional().nullable(),
  organisation:z.string().max(180).optional().nullable(),education_level:z.array(z.string().max(100)).max(40).optional().default([]),
  fields_of_study:z.array(z.string().max(120)).max(40).optional().default([]),job_type:z.string().max(80).optional().nullable(),
  work_mode:z.string().max(80).optional().nullable(),salary:z.record(z.string(),z.any()).optional().default({}),
  eligibility_tags:z.array(z.string().max(100)).max(40).optional().default([]),keywords:z.array(z.string().max(100)).max(40).optional().default([])
}).optional().default({});
const postSchema=z.object({
  title:z.string().min(2).max(CONTENT_LIMITS.title,{message:`Title can be at most ${CONTENT_LIMITS.title} characters`}),slug:z.string().max(CONTENT_LIMITS.slug,{message:`Slug can be at most ${CONTENT_LIMITS.slug} characters`}).optional(),content_type:z.enum(contentTypes).default('other'),summary:z.string().max(CONTENT_LIMITS.summary,{message:`Short description can be at most ${CONTENT_LIMITS.summary} characters`}).optional().default(''),body_markdown:z.string().max(250000).optional().default(''),posted_date:z.string().nullable().optional(),category:z.string().max(CONTENT_LIMITS.category,{message:`Category can be at most ${CONTENT_LIMITS.category} characters`}).optional().default(''),categories:z.array(z.string().max(CONTENT_LIMITS.category,{message:`Each category can be at most ${CONTENT_LIMITS.category} characters`})).max(20).optional().default([]),tags:z.array(z.string().max(CONTENT_LIMITS.tag,{message:`Each tag can be at most ${CONTENT_LIMITS.tag} characters`})).max(CONTENT_LIMITS.tags,{message:`Use at most ${CONTENT_LIMITS.tags} tags`}).optional().default([]),topics:z.array(topicSchema).max(10).optional().default([]),related_links:z.array(linkSchema).max(40).optional().default([]),related_ids:z.array(z.string()).max(40).optional().default([]),recommendation_ids:z.array(z.string()).max(40).optional().default([]),recommendation_links:z.array(linkSchema).max(40).optional().default([]),documents:z.array(documentSchema).max(40).optional().default([]),navigation_links:z.array(linkSchema).max(30).optional().default([]),type_data:z.record(z.string(),z.any()).optional().default({}),geo:geoSchema,classification:classificationSchema,main_image_url:nullableUrl,seo_title:z.string().max(CONTENT_LIMITS.seo_title,{message:`SEO title can be at most ${CONTENT_LIMITS.seo_title} characters`}).optional().default(''),seo_description:z.string().max(CONTENT_LIMITS.seo_description,{message:`SEO description can be at most ${CONTENT_LIMITS.seo_description} characters`}).optional().default(''),status:z.enum(['draft','scheduled','published','archived','trash']).optional().default('draft'),is_trending:z.boolean().optional().default(false)
});
function normalizePost(input){
  const topics=(input.topics||[]).map((t,i)=>({...t,id:`t${i+1}`,key:`t${i+1}`}));
  const type_data=cleanTypeData(input.content_type,input.type_data);
  const geo=normalizeGeo(input.geo||{});
  const classification=normalizeClassification({
    ...(input.classification||{}),
    organisation:input.classification?.organisation||type_data.company||type_data.provider||''
  });
  return{...input,tags:normalizeTags(input.tags),topics,type_data,geo,classification};
}
async function syncPublication(row,actor){
  if(!row)return row;
  if(row.status==='published'&&!row.deleted_at){
    const publication=await publishPostArtifact(store,row);
    return await store.updatePost(row.id,{publication},actor)||{...row,publication};
  }
  if(row.publication?.key){
    const result=await unpublishPostArtifact(row);
    const publication={...row.publication,sync_status:result.sync_status||'unpublished',last_synced_at:result.last_synced_at||row.publication.last_synced_at||null};
    return await store.updatePost(row.id,{publication},actor)||{...row,publication};
  }
  return row;
}

adminRouter.get('/dashboard',permit('dashboard.view'),async(req,res)=>ok(res,await store.dashboard()));
adminRouter.get('/content-types',permit('posts.view'),(req,res)=>ok(res,Object.fromEntries(contentTypes.map(t=>[t,resolvedDefinition(t)]))));
adminRouter.get('/content-constraints',permit('posts.view'),(req,res)=>ok(res,{limits:CONTENT_LIMITS,seo:SEO_GUIDANCE}));
adminRouter.get('/sources/hub',permit('imports.fetch'),async(req,res)=>{
  const [imports,posts]=await Promise.all([store.listImports({}),store.listPosts({include_deleted:true})]);
  ok(res,sourceHubPayload({imports,posts,permanentRecords:80}));
});
adminRouter.get('/sources/diagnostics',permit('imports.fetch'),async(req,res)=>ok(res,await probeLegacySources()));
adminRouter.get('/source-presets',permit('imports.fetch'),(req,res)=>ok(res,[
  {id:'pages',label:'All source pages'},{id:'bursaries',label:'ZA Bursaries'},{id:'articles',label:'Articles / news'},{id:'dailyupdate/jobs',label:'DailyUpdate jobs + related'},
  {id:'tag:psychometric-test',label:'Psychometric Test tag',kind:'tag',tagSlug:'psychometric-test'}
]));
adminRouter.get('/imports',permit('imports.view'),async(req,res)=>ok(res,await store.listImports({status:req.query.status,type:req.query.type,q:req.query.q})));
adminRouter.post('/imports/fetch',permit('imports.fetch'),async(req,res)=>{
  const schema=z.object({
    kind:z.enum(['pages','bursaries','articles','dailyupdate','dailyupdate/jobs','tag','search','url']).default('pages'),
    tagSlug:z.string().max(120).optional(),
    query:z.string().max(200).optional(),
    url:z.string().url().max(2048).optional(),
    year:z.union([z.string(),z.number()]).optional(),
    country_code:z.string().max(3).optional(),region_name:z.string().max(120).optional(),city:z.string().max(120).optional(),
    expand:z.boolean().optional().default(true),
    expandRelated:z.boolean().optional().default(false),
    relatedLimit:z.number().int().min(1).max(250).optional().default(100),
    maxPages:z.number().int().min(1).max(100).optional().default(100),
    autoPublish:z.boolean().optional(),
    publishSamples:z.number().int().min(0).max(5).optional().default(0)
  });
  const p=schema.safeParse(req.body);
  if(!p.success)return res.status(400).json({error:'Invalid fetch options',details:p.error.flatten()});

  const learningBefore=await loadImportLearning();
  const sync=await fetchImports({...p.data,learningProfile:learningBefore});
  const result=await store.upsertImports(sync.rows);
  const learningAfter=await learnFromImports(sync.rows);

  const autoPublishEnabled=p.data.autoPublish ?? config.autoPublishImports;
  const auto_published=[];const auto_publish_skipped=[];
  if(autoPublishEnabled){
    const keys=new Set(sync.rows.map(x=>x.source_key));
    const remembered=await store.listImports({});
    const candidates=remembered
      .filter(x=>keys.has(x.source_key)&&x.review_status==='unreviewed'&&!x.promoted_post_id)
      .sort((a,b)=>Number(b.quality_score||0)-Number(a.quality_score||0));

    for(const imp of candidates.slice(0,config.autoPublishMaxPerFetch)){
      const draft=normalizePost({...imp.prepared_draft,content_type:imp.detected_type||imp.prepared_draft?.content_type||'other'});
      const decision=autoPublishDecision({importRow:imp,draft,threshold:config.autoPublishMinScore,now:new Date()});
      const issues=[...new Set([...publishProblems(draft),...decision.issues])];
      if(issues.length){
        auto_publish_skipped.push({id:imp.id,title:draft.title,score:Number(imp.quality_score||0),issues});
        continue;
      }
      const post=await store.promoteImport(imp.id,req.user.id);
      let published=await store.updatePost(post.id,{status:'published'},req.user.id);
      published=await syncPublication(published,req.user.id);
      auto_published.push({
        id:published.id,title:published.title,slug:published.slug,type:published.content_type,
        score:Number(imp.quality_score||0),publication:published.publication?.sync_status||null
      });
    }
  }

  await audit(req,'imports.fetch','source',p.data.kind,{
    ...p.data,...result,...sync.stats,auto_publish_enabled:autoPublishEnabled,
    auto_publish_threshold:config.autoPublishMinScore,auto_published:auto_published.length,
    auto_publish_skipped:auto_publish_skipped.length
  });
  ok(res,{
    ...result,...sync.stats,
    auto_publish:{
      enabled:autoPublishEnabled,threshold:config.autoPublishMinScore,
      published:auto_published,skipped:auto_publish_skipped
    },
    learning:publicLearningSummary(learningAfter),
    records:sync.rows.slice(0,100)
  });
});

adminRouter.post('/harvest/global',permit('imports.fetch'),async(req,res)=>{
  const schema=z.object({
    target:z.number().int().min(1).max(5000).optional().default(1000),
    maxAgeDays:z.number().int().min(1).max(120).optional().default(60),
    providers:z.array(z.enum(['arbeitnow','jobicy','remoteok','remotive','lever','ashby','greenhouse','workable','smartrecruiters'])).max(9).optional().default(['arbeitnow','jobicy']),
    leverSites:z.array(z.string().min(1).max(120)).max(100).optional().default([]),
    ashbyBoards:z.array(z.string().min(1).max(120)).max(100).optional().default([]),
    greenhouseBoards:z.array(z.string().min(1).max(120)).max(100).optional().default([]),
    workableAccounts:z.array(z.string().min(1).max(120)).max(100).optional().default([]),
    smartRecruitersCompanies:z.array(z.string().min(1).max(160)).max(100).optional().default([]),
    autoPublish:z.boolean().optional().default(true)
  });
  const p=schema.safeParse(req.body||{});
  if(!p.success)return res.status(400).json({error:'Invalid global harvest options',details:p.error.flatten()});
  const harvest=await harvestGlobalJobs(p.data);
  const stored=await store.upsertImports(harvest.rows);
  const keys=new Set(harvest.rows.map(x=>x.source_key));
  const remembered=await store.listImports({});
  const published=[];const review=[];
  if(p.data.autoPublish){
    const candidates=remembered.filter(x=>keys.has(x.source_key)&&x.review_status==='unreviewed'&&!x.promoted_post_id)
      .sort((a,b)=>Number(b.quality_score||0)-Number(a.quality_score||0));
    for(const imp of candidates.slice(0,config.autoPublishMaxPerFetch)){
      const draft=normalizePost({...imp.prepared_draft,content_type:imp.detected_type||imp.prepared_draft?.content_type||'job'});
      const decision=autoPublishDecision({importRow:imp,draft,threshold:config.autoPublishMinScore,now:new Date()});
      const issues=[...new Set([...publishProblems(draft),...decision.issues])];
      if(issues.length){review.push({id:imp.id,title:draft.title,score:Number(imp.quality_score||0),issues});continue}
      const post=await store.promoteImport(imp.id,req.user.id);
      let live=await store.updatePost(post.id,{status:'published'},req.user.id);
      live=await syncPublication(live,req.user.id);
      published.push({id:live.id,title:live.title,type:live.content_type,country:live.geo?.country_code||null,score:Number(imp.quality_score||0)});
    }
  }
  await audit(req,'harvest.global','source','global',{target:p.data.target,providers:p.data.providers,...harvest.stats,...stored,published:published.length,review:review.length});
  ok(res,{...harvest.stats,...stored,published,review:review.slice(0,100)});
});

adminRouter.post('/harvest/news',permit('imports.fetch'),async(req,res)=>{
  const schema=z.object({
    source:z.enum(['sanews','dsti']).default('sanews'),
    limit:z.number().int().min(1).max(10).optional().default(10),
    autoPublish:z.boolean().optional().default(true)
  });
  const p=schema.safeParse(req.body||{});
  if(!p.success)return res.status(400).json({error:'Invalid news harvest options',details:p.error.flatten()});
  const harvest=await harvestOfficialNews(p.data);
  const stored=await store.upsertImports(harvest.rows);
  const keys=new Set(harvest.rows.map(x=>x.source_key));
  const remembered=await store.listImports({});
  const published=[];const review=[];
  if(p.data.autoPublish){
    const candidates=remembered.filter(x=>keys.has(x.source_key)&&x.review_status==='unreviewed'&&!x.promoted_post_id)
      .sort((a,b)=>Number(b.quality_score||0)-Number(a.quality_score||0)).slice(0,p.data.limit);
    for(const imp of candidates){
      const draft=normalizePost({...imp.prepared_draft,content_type:'news'});
      const decision=autoPublishDecision({importRow:imp,draft,threshold:config.autoPublishMinScore,now:new Date()});
      const issues=[...new Set([...publishProblems(draft),...decision.issues])];
      if(issues.length){review.push({id:imp.id,title:draft.title,score:Number(imp.quality_score||0),issues});continue}
      const post=await store.promoteImport(imp.id,req.user.id);
      let live=await store.updatePost(post.id,{status:'published'},req.user.id);
      live=await syncPublication(live,req.user.id);
      published.push({id:live.id,title:live.title,slug:live.slug,publication:live.publication?.sync_status||null});
      await audit(req,'post.publish','post',live.id,{via:'official-news-batch',source:p.data.source});
    }
  }
  await audit(req,'harvest.news','source',p.data.source,{...harvest.stats,...stored,published:published.length,review:review.length});
  ok(res,{...harvest.stats,...stored,published,review});
});

adminRouter.post('/imports/process-batch',permit('imports.fetch'),async(req,res)=>{
  const schema=z.object({
    type:z.enum(contentTypes).optional(),
    limit:z.number().int().min(1).max(10).optional().default(10),
    publishEligible:z.boolean().optional().default(true)
  });
  const p=schema.safeParse(req.body||{});
  if(!p.success)return res.status(400).json({error:'Invalid batch options',details:p.error.flatten()});
  let rows=await store.listImports({});
  rows=rows.filter(x=>['unreviewed','reviewing'].includes(x.review_status)&&!x.promoted_post_id);
  if(p.data.type)rows=rows.filter(x=>x.detected_type===p.data.type);
  rows=rows.sort((a,b)=>Number(b.quality_score||0)-Number(a.quality_score||0)).slice(0,p.data.limit);
  const processed=[];const published=[];

  for(const imp of rows){
    let draft=normalizePost({...imp.prepared_draft,content_type:imp.detected_type||imp.prepared_draft?.content_type||'other'});
    let route=null;
    const isOpportunity=['bursary','scholarship','job','internship','learnership','opportunity'].includes(draft.content_type);
    if(isOpportunity){
      const enriched=await enrichApplicationImport({...imp,prepared_draft:draft});
      draft=normalizePost(enriched.draft);route=enriched.route;
    }
    const quality=contentQuality(draft);
    await store.updateImport(imp.id,{prepared_draft:draft,quality_score:quality.score,quality_issues:quality.issues,review_status:'reviewing'});
    await audit(req,'import.clean','raw_import',imp.id,{batch:true,type:draft.content_type,quality_score:quality.score,application_verified:Boolean(route?.verified)});
    const issues=[...publishProblems(draft)];
    if(isOpportunity&&!route?.verified)issues.push('Direct application link has not been verified.');
    const decision=autoPublishDecision({importRow:{...imp,quality_score:quality.score},draft,threshold:config.autoPublishMinScore,now:new Date()});
    issues.push(...decision.issues);
    const uniqueIssues=[...new Set(issues)];
    const result={id:imp.id,title:draft.title,type:draft.content_type,score:quality.score,application:route,issues:uniqueIssues};

    if(p.data.publishEligible&&uniqueIssues.length===0){
      const post=await store.promoteImport(imp.id,req.user.id);
      let live=await store.updatePost(post.id,{status:'published'},req.user.id);
      live=await syncPublication(live,req.user.id);
      published.push({id:live.id,title:live.title,slug:live.slug,type:live.content_type,publication:live.publication});
      result.published=true;result.post_id=live.id;
      await audit(req,'post.publish','post',live.id,{via:'ten-item-batch',source_import:imp.id,application_verified:Boolean(route?.verified)});
    }else result.published=false;
    processed.push(result);
  }
  await audit(req,'imports.process_batch','raw_import',p.data.type||'mixed',{requested:p.data.limit,processed:processed.length,published:published.length});
  ok(res,{requested:p.data.limit,processed,published});
});

adminRouter.get('/imports/learning',permit('imports.fetch'),async(req,res)=>ok(res,publicLearningSummary(await loadImportLearning())));
adminRouter.get('/imports/priority',permit('imports.fetch'),async(req,res)=>ok(res,await store.priorityImports({limit:Math.min(500,Math.max(1,Number(req.query.limit)||200))})));
adminRouter.get('/imports/:id',permit('imports.view'),async(req,res)=>{const row=await store.getImport(req.params.id);if(!row)return res.status(404).json({error:'Import not found'});ok(res,row)});
adminRouter.patch('/imports/:id',permit('imports.review'),async(req,res)=>{const schema=z.object({review_status:z.enum(['unreviewed','reviewing','promoted']).optional(),detected_type:z.enum(contentTypes).optional(),prepared_draft:postSchema.partial().optional()});const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid import update',details:p.error.flatten()});const patch={...p.data};if(patch.prepared_draft)patch.prepared_draft=normalizePost({...patch.prepared_draft,content_type:patch.prepared_draft.content_type||patch.detected_type||'other'});const row=await store.updateImport(req.params.id,patch);if(!row)return res.status(404).json({error:'Import not found'});await audit(req,'import.update','raw_import',row.id,{fields:Object.keys(patch)});if(patch.prepared_draft)await audit(req,'import.clean','raw_import',row.id,{fields:Object.keys(patch.prepared_draft||{})});ok(res,row)});
adminRouter.post('/imports/:id/promote',permit('imports.review'),async(req,res)=>{const row=await store.promoteImport(req.params.id,req.user.id);if(!row)return res.status(404).json({error:'Import not found'});await audit(req,'import.promote','post',row.id,{source_import:req.params.id});res.status(201).json({data:row})});
adminRouter.post('/imports/:id/publish',permit('imports.review'),async(req,res)=>{
  if(!hasPermission(req.user.role,'posts.publish'))return res.status(403).json({error:'Your role cannot publish'});
  const imp=await store.getImport(req.params.id);if(!imp)return res.status(404).json({error:'Import not found'});
  const draft=normalizePost({...imp.prepared_draft,content_type:imp.detected_type||imp.prepared_draft?.content_type||'other'});
  const issues=publishProblems(draft);
  if(issues.length)return res.status(400).json({error:'Publishing checklist failed',details:{formErrors:issues}});
  let row=await store.promoteImport(req.params.id,req.user.id);if(!row)return res.status(404).json({error:'Import not found'});
  row=await store.updatePost(row.id,{status:'published'},req.user.id);
  row=await syncPublication(row,req.user.id);
  await audit(req,'import.promote','post',row.id,{source_import:req.params.id,via:'direct-publish'});
  await audit(req,'post.publish','post',row.id,{source_import:req.params.id,via:'direct-publish',publication:row.publication?.sync_status||null});
  res.status(201).json({data:row});
});

adminRouter.get('/posts',permit('posts.view'),async(req,res)=>{
  let rows=await store.listPosts({
    status:req.query.status,type:req.query.type,q:req.query.q,country:req.query.country,region:req.query.region,city:req.query.city,
    organisation:req.query.organisation,opportunity_status:req.query.opportunity_status,include_deleted:req.query.include_deleted==='true'
  });
  if(req.query.source){const source=String(req.query.source).toLowerCase();rows=rows.filter(x=>String(x.source?.source_name||'').toLowerCase().includes(source))}
  ok(res,rows);
});
adminRouter.post('/posts',permit('posts.create'),async(req,res)=>{const p=postSchema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid content',details:zodValidationDetails(p.error)});const body=normalizePost(p.data);if(body.status==='published'&&!hasPermission(req.user.role,'posts.publish'))return res.status(403).json({error:'Your role cannot publish'});if(body.status==='published'){const issues=publishProblems(body);if(issues.length)return res.status(400).json({error:'Publishing checklist failed',details:{formErrors:issues}})}let row=await store.createPost(body,req.user.id);if(row.status==='published')row=await syncPublication(row,req.user.id);await audit(req,'post.create','post',row.id,{title:row.title,type:row.content_type,publication:row.publication?.sync_status||null});if(row.status==='published')await audit(req,'post.publish','post',row.id,{via:'create',publication:row.publication?.sync_status||null});res.status(201).json({data:row})});
adminRouter.get('/posts/:id',permit('posts.view'),async(req,res)=>{const row=await store.getPost(req.params.id);if(!row)return res.status(404).json({error:'Post not found'});ok(res,row)});
adminRouter.patch('/posts/:id',permit('posts.edit'),async(req,res)=>{const p=postSchema.partial().safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid content update',details:zodValidationDetails(p.error)});const current=await store.getPost(req.params.id);if(!current)return res.status(404).json({error:'Post not found'});const merged=normalizePost({...current,...p.data,content_type:p.data.content_type||current.content_type,type_data:{...(current.type_data||{}),...(p.data.type_data||{})},geo:{...(current.geo||{}),...(p.data.geo||{})},classification:{...(current.classification||{}),...(p.data.classification||{})}});if(p.data.status==='published'&&!hasPermission(req.user.role,'posts.publish'))return res.status(403).json({error:'Your role cannot publish'});if((p.data.status==='published'||current.status==='published')&&merged.status==='published'){const issues=publishProblems(merged);if(issues.length)return res.status(400).json({error:'Publishing checklist failed',details:{formErrors:issues}})}const patch=Object.fromEntries(Object.keys(p.data).map(k=>[k,merged[k]]));let row=await store.updatePost(req.params.id,patch,req.user.id);row=await syncPublication(row,req.user.id);await audit(req,p.data.status==='published'?'post.publish':'post.update','post',row.id,{fields:Object.keys(patch),publication:row.publication?.sync_status||null});ok(res,row)});
adminRouter.delete('/posts/:id',permit('posts.delete'),async(req,res)=>{let row=await store.trashPost(req.params.id,req.user.id);if(!row)return res.status(404).json({error:'Post not found'});row=await syncPublication(row,req.user.id);await audit(req,'post.trash','post',row.id,{publication:row.publication?.sync_status||null});ok(res,row)});
adminRouter.post('/posts/:id/restore',permit('posts.edit'),async(req,res)=>{const row=await store.restorePost(req.params.id,req.user.id);if(!row)return res.status(404).json({error:'Post not found'});await audit(req,'post.restore','post',row.id);ok(res,row)});
adminRouter.get('/posts/:id/revisions',permit('posts.view'),async(req,res)=>ok(res,await store.revisions(req.params.id)));

adminRouter.post('/sync/publications',permit('posts.publish'),async(req,res)=>{const result=await retryPublicationQueue({limit:250});await audit(req,'publications.sync','system','r2',result);ok(res,result)});
adminRouter.post('/sync/databases',permit('posts.publish'),async(req,res)=>{if(typeof store.retryDatabaseQueue!=='function')return ok(res,{processed:0,synced:0,failed:0,remaining:0,mode:'single-store'});const result=await store.retryDatabaseQueue({limit:250});await audit(req,'databases.sync','system','database',result);ok(res,result)});
adminRouter.get('/sync/status',permit('dashboard.view'),async(req,res)=>ok(res,{store:store.health?.()||{mode:config.dataStore}}));

adminRouter.get('/analytics',permit('analytics.view'),async(req,res)=>ok(res,await store.analyticsSummary()));
adminRouter.get('/team',permit('team.view'),async(req,res)=>{
  const [users,performance]=await Promise.all([store.listUsers(),store.teamPerformance()]);
  const byUser=new Map(performance.map(x=>[x.user_id,x]));
  ok(res,users.map(user=>({...user,role_label:ROLE_LABELS[user.role]||user.role,performance:byUser.get(user.id)||{cleaned:0,promoted:0,published:0,edited:0,last_activity_at:null}})));
});
adminRouter.post('/team',permit('team.create'),async(req,res)=>{const schema=z.object({username:z.string().min(3).max(80),email:z.string().email(),display_name:z.string().min(2).max(120),role:z.enum(Object.keys(ROLE_PERMISSIONS)),password:z.string().min(8).max(200)});const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid team member',details:p.error.flatten()});if(p.data.role==='owner'&&req.user.role!=='owner')return res.status(403).json({error:'Only the CEO / Owner can create another owner account'});const password_hash=await bcrypt.hash(p.data.password,12);const user=await store.createUser({...p.data,password_hash});let email=null;try{email=await sendInvite({email:user.email,displayName:user.display_name,role:user.role,inviteUrl:`${config.appOrigin}/admin/`})}catch(e){email={sent:false,reason:e.message}}await audit(req,'team.create','admin_user',user.id,{role:user.role});res.status(201).json({data:{user:{id:user.id,username:user.username,email:user.email,display_name:user.display_name,role:user.role},email}})});
adminRouter.patch('/team/:id',permit('team.edit'),async(req,res)=>{const allowed=['role','active','display_name'];const patch=Object.fromEntries(Object.entries(req.body||{}).filter(([k])=>allowed.includes(k)));if(patch.role&&!ROLE_PERMISSIONS[patch.role])return res.status(400).json({error:'Invalid role'});const target=await store.getUser(req.params.id);if(!target)return res.status(404).json({error:'User not found'});if((target.role==='owner'||patch.role==='owner')&&req.user.role!=='owner')return res.status(403).json({error:'Only the CEO / Owner can change owner access'});const row=await store.updateUser(req.params.id,patch);if(!row)return res.status(404).json({error:'User not found'});await audit(req,'team.update','admin_user',row.id,patch);ok(res,row)});
adminRouter.get('/roles',permit('team.view'),(req,res)=>ok(res,Object.fromEntries(Object.entries(ROLE_PERMISSIONS).map(([id,permissions])=>[id,{label:ROLE_LABELS[id]||id,permissions}]))));

adminRouter.get('/settings',permit('settings.view'),async(req,res)=>ok(res,await store.settings()));
adminRouter.patch('/settings',permit('settings.edit'),async(req,res)=>{const allowed=['site_name','whatsapp_number','contact_email','main_logo_url','dark_logo_url','favicon_url','default_social_image_url'];const patch=Object.fromEntries(Object.entries(req.body||{}).filter(([k])=>allowed.includes(k)));const row=await store.updateSettings(patch);await audit(req,'settings.update','settings','site',{fields:Object.keys(patch)});ok(res,row)});
adminRouter.get('/media',permit('media.view'),async(req,res)=>ok(res,await store.listMedia()));
adminRouter.post('/media/upload',permit('media.upload'),upload.single('file'),async(req,res)=>{try{const saved=await saveUpload(req.file);const row=await store.addMedia({...saved,media_kind:mediaKind(req.file.mimetype),mime_type:req.file.mimetype,size_bytes:req.file.size,title:req.body?.title||req.file.originalname||'',alt_text:req.body?.alt_text||'',uploaded_by:req.user.id});await audit(req,'media.upload','media',row.id,{provider:saved.provider,mime:req.file.mimetype,size:req.file.size});res.status(201).json({data:row})}catch(e){res.status(400).json({error:e.message})}});
adminRouter.get('/audit',permit('audit.view'),async(req,res)=>ok(res,await store.listAudit()));
