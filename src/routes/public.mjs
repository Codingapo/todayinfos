import { Router } from 'express';
import { z } from 'zod';
import { store } from '../lib/store.mjs';
import { publicPost } from '../lib/serializers.mjs';
import { paginate } from '../lib/utils.mjs';
import { GLOBAL_FILTERS, normalizeCountryCode, queryFilters } from '../lib/global-content.mjs';
import { loadPostArtifact } from '../lib/publication-service.mjs';

export const publicRouter=Router();

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
  storage:{public_content:'R2/local fallback',index:'database abstraction'}
}}));

publicRouter.get('/posts',async(req,res)=>sendList(req,res));
publicRouter.get('/pages',async(req,res)=>sendList(req,res));
for(const [name,types] of Object.entries(collectionTypes)){
  publicRouter.get(`/${name}`,async(req,res)=>sendList(req,res,{types}));
}
publicRouter.get('/trending',async(req,res)=>sendList(req,res,{trending:true}));
publicRouter.get('/dailyupdate/jobs',async(req,res)=>sendList(req,res,{types:['job']}));

async function detailPayload(row){
  const artifact=await loadPostArtifact(row);
  if(artifact)return artifact;
  const base=publicPost(row);const related=[];const recs=[];
  for(const id of row.related_ids||[]){const p=await store.getPost(id);if(p&&p.status==='published'&&!p.deleted_at)related.push(publicPost(p,{compact:true}))}
  for(const id of row.recommendation_ids||[]){const p=await store.getPost(id);if(p&&p.status==='published'&&!p.deleted_at)recs.push(publicPost(p,{compact:true}))}
  return{...base,related_content:related,recommendations:recs,_artifact:{provider:'database-fallback'}};
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
  const rows=(await store.listPosts({status:'published',...filters})).map(p=>publicPost(p,{compact:true}));
  res.json({data:rows.slice(0,250),meta:{query:q,total:rows.length,filters,published_only:true}});
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
  await store.recordEvent(p.data);res.status(202).json({data:{accepted:true}});
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
