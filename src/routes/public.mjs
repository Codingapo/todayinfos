import { Router } from 'express';
import { z } from 'zod';
import { store } from '../lib/store.mjs';
import { publicPost } from '../lib/serializers.mjs';
import { paginate } from '../lib/utils.mjs';
import { GLOBAL_FILTERS, normalizeCountryCode, queryFilters } from '../lib/global-content.mjs';
import { loadPostArtifact } from '../lib/publication-service.mjs';
import { deriveVisitorSignals, rankSearch } from '../lib/ranking.mjs';
import { smartRelated, smartRecommendations } from '../lib/related-content.mjs';
import { clickedDiscoveryRow, normalizeTargetUrl } from '../lib/demand-priority.mjs';
import { SOURCE_CATEGORIES, SOURCE_CATALOG } from '../lib/source-catalog.mjs';

export const publicRouter=Router();

const requestLocation=req=>({
  country_code:normalizeCountryCode(req.get('cf-ipcountry')||req.get('x-vercel-ip-country')||req.get('x-country-code')||''),
  region_name:req.get('cf-region')||req.get('x-vercel-ip-country-region')||req.get('x-region-name')||null,
  city:req.get('cf-ipcity')||req.get('x-vercel-ip-city')||req.get('x-city')||null
});

const collectionTypes={
  news:['news','announcement'],announcements:['announcement'],stories:['story'],articles:['news','announcement'],
  bursaries:['bursary'],scholarships:['scholarship'],jobs:['job'],internships:['internship'],
  learnerships:['learnership'],opportunities:['opportunity']
};

const listRows=async(req,extra={})=>{
  const filters={status:'published',...queryFilters(req.query),...extra};
  let rows=await store.listPosts(filters);
  if(extra.types)rows=rows.filter(p=>extra.types.includes(p.content_type));
  return rows;
};
const sendList=async(req,res,extra={})=>{
  const rows=(await listRows(req,extra)).map(p=>publicPost(p,{compact:true}));
  const payload=paginate(rows,req.query.page,req.query.limit);
  payload.meta={...(payload.meta||{}),filters:queryFilters(req.query),published_only:true};
  res.json(payload);
};

publicRouter.get('/site',async(req,res)=>{
  const s=await store.settings();
  res.json({data:{
    name:s.site_name||'TodayInfo',managed:true,publicApi:true,global:true,
    logo:s.main_logo_url||null,dark_logo:s.dark_logo_url||null,favicon:s.favicon_url||null,
    default_social_image:s.default_social_image_url||null,
    contact:{whatsapp:s.whatsapp_number||null,email:s.contact_email||null}
  }});
});

publicRouter.get('/meta',(req,res)=>res.json({data:{
  api_version:'v1',scope:'global',published_only:true,
  content_types:['news','announcement','story','bursary','scholarship','job','internship','learnership','opportunity','other'],
  filters:GLOBAL_FILTERS,
  seo_pattern:'/{country}/{collection}/{slug}',
  news_seo_pattern:'/{country}/news/{category}/{slug}',
  storage:{public_content:'R2/local fallback',index:'database abstraction'},
  tracking:{endpoint:'/api/v1/analytics/events',demand_events:['related_click','recommendation_click'],missing_link_behavior:'private_draft_priority_queue'},
  relations:{strategy:'deterministic-structured-similarity',signals:['manual','country','content_type','organisation','categories','tags','fields_of_study','education_level','work_mode']},
  sources:{endpoint:'/api/v1/sources',catalogued:SOURCE_CATALOG.length,categories:SOURCE_CATEGORIES.length}
}}));

publicRouter.get('/sources',(req,res)=>res.json({data:{
  categories:SOURCE_CATEGORIES,
  sources:SOURCE_CATALOG.map(({aliases,action,...source})=>({
    ...source,
    operational:Boolean(action),
    operation:action?.type||null
  }))
},meta:{internal_counts_hidden:true,source_catalog_version:2}}));

publicRouter.get('/posts',async(req,res)=>sendList(req,res));
publicRouter.get('/pages',async(req,res)=>sendList(req,res));
for(const [name,types] of Object.entries(collectionTypes)){
  publicRouter.get(`/${name}`,async(req,res)=>sendList(req,res,{types}));
}
async function sendTrending(req,res,extra={}){
  const filters={...queryFilters(req.query),...extra};
  if(req.query.type)filters.type=String(req.query.type);
  let rows=await store.trendingPosts(filters);
  if(filters.type)rows=rows.filter(p=>p.content_type===filters.type);
  const items=rows.map(p=>({...publicPost(p,{compact:true}),trending_score:Number(p.trending_score||0)}));
  const payload=paginate(items,req.query.page,req.query.limit);
  payload.meta={...(payload.meta||{}),filters,published_only:true,ranking:'engagement_14d'};
  res.json(payload);
}
publicRouter.get('/trending',sendTrending);
publicRouter.get('/trending/:countryCode',async(req,res)=>sendTrending(req,res,{country:normalizeCountryCode(req.params.countryCode)}));
publicRouter.get('/trending/:countryCode/:region',async(req,res)=>sendTrending(req,res,{country:normalizeCountryCode(req.params.countryCode),region:req.params.region}));
publicRouter.get('/dailyupdate/jobs',async(req,res)=>sendList(req,res,{types:['job']}));

async function detailPayload(row){
  const artifact=await loadPostArtifact(row);
  const base=artifact||publicPost(row);
  let candidates=await store.listPosts({status:'published',country:row.geo?.country_code||undefined});
  if(candidates.length<16)candidates=await store.listPosts({status:'published'});
  const related=smartRelated(row,candidates,{limit:8}).map(x=>({...publicPost(x.post,{compact:true}),relation_score:x.score}));
  const recs=smartRecommendations(row,candidates,{limit:6}).map(x=>({...publicPost(x.post,{compact:true}),relation_score:x.score}));
  return{
    ...base,
    related_content:related,
    recommendations:recs,
    relation_meta:{strategy:'deterministic-structured-similarity',signals:['manual','country','content_type','organisation','categories','tags','fields_of_study','education_level','work_mode']},
    _artifact:artifact?base._artifact||{provider:'published-artifact'}:{provider:'database-fallback'}
  };
}

const expected={
  posts:null,pages:null,news:['news','announcement'],announcements:['announcement'],articles:['news','announcement'],
  bursaries:['bursary'],scholarships:['scholarship'],jobs:['job'],internships:['internship'],
  learnerships:['learnership'],opportunities:['opportunity'],stories:['story']
};
for(const prefix of Object.keys(expected))publicRouter.get(`/${prefix}/:slug`,async(req,res)=>{
  const row=await store.getPostBySlug(req.params.slug);
  if(!row)return res.status(404).json({error:'Not found'});
  if(expected[prefix]&&!expected[prefix].includes(row.content_type))return res.status(404).json({error:'Not found'});
  res.json({data:await detailPayload(row)});
});

publicRouter.get('/search',async(req,res)=>{
  const q=String(req.query.q||'').trim();
  const filters=queryFilters(req.query);
  if(!q&&!Object.values(filters).some(Boolean))return res.json({data:[],meta:{query:q,total:0,filters,published_only:true}});
  const raw=await store.listPosts({status:'published',...filters});
  const ranked=rankSearch(raw,q);
  const rows=ranked.slice(0,250).map(p=>({...publicPost(p,{compact:true}),search_score:Number(p.search_score||0)}));
  if(req.query.visitor_id){
    const location=requestLocation(req);
    store.recordEvent({visitor_id:String(req.query.visitor_id).slice(0,120),event_type:'search',meta:{query:q,...location,filters}}).catch(()=>{});
  }
  res.json({data:rows,meta:{query:q,total:ranked.length,filters,published_only:true,ranking:'structured_relevance'}});
});

publicRouter.get('/personalized',async(req,res)=>{
  const visitorId=String(req.query.visitor_id||'').trim();
  if(!visitorId)return res.status(400).json({error:'visitor_id is required'});
  const events=await store.visitorEvents(visitorId,200);
  const signals=deriveVisitorSignals(events);
  const explicit=queryFilters(req.query);
  const location=requestLocation(req);
  const filters={
    country:explicit.country||signals.country||location.country_code||undefined,
    region:explicit.region||signals.region||undefined,
    q:explicit.q||signals.query||undefined
  };
  if(signals.content_type)filters.type=signals.content_type;
  let rows=await store.trendingPosts(filters);
  if(filters.type)rows=rows.filter(x=>x.content_type===filters.type);
  if(rows.length<12&&filters.region){delete filters.region;rows=await store.trendingPosts(filters)}
  if(rows.length<12&&filters.type){delete filters.type;rows=await store.trendingPosts(filters)}
  const data=rows.slice(0,50).map(p=>({...publicPost(p,{compact:true}),trending_score:Number(p.trending_score||0)}));
  res.json({data,meta:{published_only:true,personalized:true,signals,filters}});
});

publicRouter.get('/facets',async(req,res)=>{
  const rows=await store.listPosts({status:'published',...queryFilters(req.query)});
  const bucket=getter=>{const m=new Map();for(const row of rows){const values=getter(row);for(const value of (Array.isArray(values)?values:[values])){if(!value)continue;const key=String(value);m.set(key,(m.get(key)||0)+1)}}return [...m.entries()].map(([value,count])=>({value,count})).sort((a,b)=>b.count-a.count)};
  res.json({data:{
    total:rows.length,
    content_types:bucket(x=>x.content_type),countries:bucket(x=>x.geo?.country_code),regions:bucket(x=>x.geo?.region_name),
    cities:bucket(x=>x.geo?.city),categories:bucket(x=>[x.category,...(x.categories||[])]),
    organisations:bucket(x=>x.classification?.organisation),education_levels:bucket(x=>x.classification?.education_level||[]),
    fields_of_study:bucket(x=>x.classification?.fields_of_study||[]),job_types:bucket(x=>x.classification?.job_type),
    work_modes:bucket(x=>x.classification?.work_mode),currencies:bucket(x=>x.classification?.salary?.currency)
  },meta:{published_only:true,filters:queryFilters(req.query)}});
});

publicRouter.get('/locations',async(req,res)=>{
  const filters=queryFilters(req.query);const rows=await store.listPosts({status:'published',...filters});
  const countries=new Map();
  for(const row of rows){
    const code=normalizeCountryCode(row.geo?.country_code||'');if(!code)continue;
    let country=countries.get(code);
    if(!country){country={code,name:row.geo?.country_name||code,count:0,regions:new Map(),cities:new Map()};countries.set(code,country)}
    country.count+=1;
    if(row.geo?.region_name)country.regions.set(row.geo.region_name,(country.regions.get(row.geo.region_name)||0)+1);
    if(row.geo?.city)country.cities.set(row.geo.city,(country.cities.get(row.geo.city)||0)+1);
  }
  res.json({data:[...countries.values()].map(c=>({code:c.code,name:c.name,count:c.count,regions:[...c.regions].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),cities:[...c.cities].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count)})).sort((a,b)=>b.count-a.count),meta:{published_only:true,filters}});
});

publicRouter.get('/countries',async(req,res)=>{
  const rows=await store.listPosts({status:'published'});
  const map=new Map();
  for(const p of rows){
    const code=normalizeCountryCode(p.geo?.country_code||'');
    if(!code)continue;
    const cur=map.get(code)||{code,name:p.geo?.country_name||code,count:0,types:{}};
    cur.count+=1;cur.types[p.content_type]=(cur.types[p.content_type]||0)+1;map.set(code,cur);
  }
  res.json({data:[...map.values()].sort((a,b)=>b.count-a.count)});
});

publicRouter.get('/tags',async(req,res)=>res.json({data:await store.tags()}));
publicRouter.get('/tags/:slug',async(req,res)=>{
  const tags=await store.tags();const tag=tags.find(t=>t.slug===req.params.slug);
  const records=(await store.listPosts({status:'published',tag:req.params.slug,...queryFilters(req.query)})).map(p=>publicPost(p,{compact:true}));
  res.json({data:{name:tag?.name||req.params.slug.replaceAll('-',' '),slug:req.params.slug,count:records.length,records}});
});
publicRouter.get('/categories',async(req,res)=>res.json({data:await store.categories()}));
publicRouter.get('/categories/:slug',async(req,res)=>{
  const categories=await store.categories();const category=categories.find(t=>t.slug===req.params.slug);
  const records=(await store.listPosts({status:'published',category:req.params.slug,...queryFilters(req.query)})).map(p=>publicPost(p,{compact:true}));
  res.json({data:{title:category?.title||req.params.slug.replaceAll('-',' '),slug:req.params.slug,count:records.length,records}});
});

publicRouter.post('/analytics/events',async(req,res)=>{
  const schema=z.object({
    visitor_id:z.string().max(120).optional(),
    event_type:z.enum(['view','read','search','application_click','download','related_click','recommendation_click','tag_click']),
    post_id:z.string().optional(),
    meta:z.record(z.string(),z.any()).optional()
  });
  const p=schema.safeParse(req.body);if(!p.success)return res.status(400).json({error:'Invalid analytics event'});
  const location=requestLocation(req);const meta={...(p.data.meta||{})};
  if(!meta.country_code&&location.country_code)meta.country_code=location.country_code;
  if(!meta.region_name&&location.region_name)meta.region_name=location.region_name;
  if(!meta.city&&location.city)meta.city=location.city;
  if(p.data.post_id){
    const post=await store.getPost(p.data.post_id).catch(()=>null);
    if(post){
      meta.content_type=meta.content_type||post.content_type;
      meta.country_code=meta.country_code||post.geo?.country_code||null;
      meta.region_name=meta.region_name||post.geo?.region_name||null;
      meta.city=meta.city||post.geo?.city||null;
    }
  }
  await store.recordEvent({...p.data,meta});
  let demand_tracked=false;
  if(['related_click','recommendation_click'].includes(p.data.event_type)&&meta.target_url){
    const target=normalizeTargetUrl(meta.target_url);
    let external=false;try{external=Boolean(target)&&new URL(target).hostname!==req.hostname}catch{}
    if(external){
      try{
        const existing=(await store.listImports({q:target})).find(x=>normalizeTargetUrl(x.source_url)===target);
        if(!existing){
          const row=clickedDiscoveryRow({
            url:target,title:meta.target_title||meta.link_title||'',
            suggestedType:meta.target_type||meta.content_type||'other',
            sourcePostId:p.data.post_id||null,sourceTitle:meta.source_title||''
          });
          if(row){await store.upsertImports([row]);demand_tracked=true}
        }else demand_tracked=true;
      }catch{}
    }
  }
  res.status(202).json({data:{accepted:true,demand_tracked}});
});
publicRouter.get('/crawl/status',(req,res)=>res.json({data:{state:'managed',publicCountsHidden:true,message:'Raw crawler/index statistics are private to TodayInfo administrators.'}}));
publicRouter.get('/redirect/:slug',async(req,res)=>{
  const r=await store.findRedirect(req.params.slug);if(!r)return res.status(404).json({error:'Not found'});
  res.json({data:{from:r.from_slug,to:r.to_slug}});
});

// Country-prefixed collection routes. Old non-country routes above remain supported.
publicRouter.get('/:countryCode/:collection',async(req,res,next)=>{
  const types=collectionTypes[req.params.collection];
  const code=normalizeCountryCode(req.params.countryCode);
  if(!types||!code||String(req.params.countryCode).length>3)return next();
  return sendList(req,res,{types,country:code});
});
publicRouter.get('/:countryCode/news/:category/:slug',async(req,res,next)=>{
  const code=normalizeCountryCode(req.params.countryCode);if(!code)return next();
  const row=await store.getPostBySlug(req.params.slug);
  if(!row||!['news','announcement'].includes(row.content_type))return res.status(404).json({error:'Not found'});
  if(normalizeCountryCode(row.geo?.country_code)!==code)return res.status(404).json({error:'Not found'});
  return res.json({data:await detailPayload(row)});
});
publicRouter.get('/:countryCode/:collection/:slug',async(req,res,next)=>{
  const types=collectionTypes[req.params.collection];
  const code=normalizeCountryCode(req.params.countryCode);
  if(!types||!code)return next();
  const row=await store.getPostBySlug(req.params.slug);
  if(!row||!types.includes(row.content_type)||normalizeCountryCode(row.geo?.country_code)!==code)return res.status(404).json({error:'Not found'});
  return res.json({data:await detailPayload(row)});
});
