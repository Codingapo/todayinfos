import crypto from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import { config } from '../config.mjs';
import { store } from '../lib/store.mjs';
import { preparePrivateIngestItem } from '../lib/private-ingest.mjs';
import { verifyApplicationUrl, buildApplicationGuide } from '../lib/application-intelligence.mjs';
import { contentQuality } from '../lib/content-rules.mjs';
import { publishPostArtifact } from '../lib/publication-service.mjs';

export const internalRouter=Router();

const safeEqual=(a,b)=>{
  const left=Buffer.from(String(a||''));const right=Buffer.from(String(b||''));
  return left.length===right.length&&left.length>0&&crypto.timingSafeEqual(left,right);
};

internalRouter.use((req,res,next)=>{
  if(!config.internalIngestKey)return res.status(503).json({error:'Private ingestion API is disabled. Configure TODAYINFO_INGEST_KEY.'});
  const header=req.get('x-todayinfo-ingest-key')||String(req.get('authorization')||'').replace(/^Bearer\s+/i,'');
  if(!safeEqual(header,config.internalIngestKey))return res.status(401).json({error:'Invalid ingestion key'});
  next();
});

const itemSchema=z.object({
  title:z.string().min(3).max(240).optional(),
  job_title:z.string().min(3).max(240).optional(),
  name:z.string().min(3).max(240).optional(),
  company:z.string().max(180).optional(),organisation:z.string().max(180).optional(),organization:z.string().max(180).optional(),provider:z.string().max(180).optional(),
  source_url:z.string().url().max(2048),application_url:z.string().url().max(2048),
  rewritten_summary:z.string().max(1000).optional(),rewritten_body:z.string().max(30000).optional(),rewritten_content:z.string().max(30000).optional(),
  summary:z.string().max(3000).optional(),description:z.string().max(10000).optional(),
  requirements:z.union([z.string(),z.array(z.string())]).optional(),
  responsibilities:z.union([z.string(),z.array(z.string())]).optional(),
  eligibility:z.union([z.string(),z.array(z.string())]).optional(),
  supporting_documents:z.union([z.string(),z.array(z.string())]).optional(),
  how_to_apply:z.union([z.string(),z.array(z.string())]).optional(),
  application_steps:z.union([z.string(),z.array(z.string())]).optional(),
  opening_date:z.string().max(40).optional(),closing_date:z.string().max(40).optional(),posted_date:z.string().max(50).optional(),date:z.string().max(50).optional(),
  status:z.string().max(30).optional(),location:z.string().max(240).optional(),city:z.string().max(120).optional(),region:z.string().max(120).optional(),region_name:z.string().max(120).optional(),province:z.string().max(120).optional(),state:z.string().max(120).optional(),
  country_code:z.string().max(3).optional(),country_name:z.string().max(120).optional(),
  salary:z.any().optional(),job_type:z.string().max(100).optional(),work_mode:z.string().max(100).optional(),
  education_level:z.union([z.string(),z.array(z.string())]).optional(),fields_of_study:z.union([z.string(),z.array(z.string())]).optional(),
  eligibility_tags:z.union([z.string(),z.array(z.string())]).optional(),keywords:z.union([z.string(),z.array(z.string())]).optional(),tags:z.union([z.string(),z.array(z.string())]).optional(),
  main_image_url:z.string().url().max(2048).optional(),image_url:z.string().url().max(2048).optional(),seo_title:z.string().max(180).optional(),seo_description:z.string().max(500).optional()
}).passthrough();

const batchSchema=z.object({
  type:z.enum(['job','bursary']),
  country_code:z.string().min(2).max(3),
  country_name:z.string().max(120).optional(),
  source_name:z.string().min(2).max(160).optional().default('TodayInfo Private Ingest'),
  publish:z.boolean().optional().default(true),
  items:z.array(itemSchema).min(1).max(100)
});

const sameUrl=(a,b)=>String(a||'').replace(/\/$/,'')===String(b||'').replace(/\/$/,'');
const publishable=(draft,quality,route)=>Boolean(
  route?.verified&&
  Number(quality?.score||0)>=config.autoPublishMinScore&&
  draft.title&&draft.body_markdown&&draft.geo?.country_code&&
  draft.classification?.organisation&&draft.type_data?.application_url
);

internalRouter.get('/status',(req,res)=>res.json({data:{
  enabled:true,max_batch:{job:50,bursary:100},minimum_publish_score:config.autoPublishMinScore,
  publishing:'verified application URL + quality gate + required structured fields'
}}));

internalRouter.post('/batch',async(req,res)=>{
  const parsed=batchSchema.safeParse(req.body||{});
  if(!parsed.success)return res.status(400).json({error:'Invalid ingestion batch',details:parsed.error.flatten()});
  const input=parsed.data;const max=input.type==='job'?50:100;
  if(input.items.length>max)return res.status(400).json({error:`${input.type} batches are limited to ${max} items`});

  const existing=await store.listPosts({include_deleted:true});
  const results=[];let published=0,drafts=0,updated=0,created=0;

  for(const raw of input.items){
    try{
      const prepared=preparePrivateIngestItem(raw,{
        type:input.type,country_code:input.country_code,country_name:input.country_name,source_name:input.source_name
      });
      const route=await verifyApplicationUrl(prepared.application_url,{sourceUrl:prepared.source_url});
      const draft=prepared.draft;
      draft.type_data={...(draft.type_data||{}),
        application_url:route.verified?route.final_url:prepared.application_url,
        application_url_verified:Boolean(route.verified),
        application_route:route
      };
      draft.type_data.application_guide=buildApplicationGuide(draft,route);
      const quality=contentQuality(draft);
      const goLive=input.publish&&publishable(draft,quality,route);
      draft.status=goLive?'published':'draft';

      let row=existing.find(x=>sameUrl(x.source?.source_url,prepared.source_url))||
        existing.find(x=>x.slug===draft.slug&&x.content_type===input.type&&x.geo?.country_code===draft.geo?.country_code);

      if(row){
        row=await store.updatePost(row.id,{...draft,source:draft.source,deleted_at:null},null);updated+=1;
      }else{
        row=await store.createPost(draft,null);existing.push(row);created+=1;
      }

      if(goLive){
        const publication=await publishPostArtifact(store,row);
        row=await store.updatePost(row.id,{publication,status:'published'},null)||{...row,publication};
        published+=1;
      }else drafts+=1;

      await store.audit?.(null,'internal.ingest', 'post',row.id,{
        type:input.type,country_code:draft.geo?.country_code,quality_score:quality.score,
        application_verified:Boolean(route.verified),published:goLive,source_url:prepared.source_url
      });

      results.push({
        ok:true,id:row.id,title:row.title,slug:row.slug,path:`/${String(draft.geo?.country_code||'').toLowerCase()}/${input.type==='job'?'jobs':'bursaries'}/${row.slug}`,
        status:goLive?'published':'draft',quality_score:quality.score,
        application:{url:draft.type_data.application_url,verified:Boolean(route.verified),reason:route.reason},
        source_url:prepared.source_url
      });
    }catch(error){
      results.push({ok:false,title:raw.title||raw.job_title||raw.name||null,error:error.message});
    }
  }

  res.status(201).json({data:{
    type:input.type,country_code:input.country_code,received:input.items.length,created,updated,published,drafts,
    failed:results.filter(x=>!x.ok).length,results
  }});
});
