import fs from 'node:fs';
import path from 'node:path';
import { contentQuality } from './content-rules.mjs';
import { hashKey } from './utils.mjs';
import { normalizeClassification, normalizeGeo } from './global-content.mjs';
import { learnFromImports } from './import-learning.mjs';
import { publishPostArtifact } from './publication-service.mjs';

export const SOUTH_AFRICA_SEED_PATH=path.resolve('data','seeds','south-africa-opportunities-drafts.json');
export const AFRICA_SEED_PATH=path.resolve('data','seeds','africa-opportunities-drafts.json');

const SEEDS=[
  {id:'sa-opportunities',path:SOUTH_AFRICA_SEED_PATH,label:'TodayInfo South Africa verified reference seed',fallbackCountry:'South Africa'},
  {id:'africa-opportunities',path:AFRICA_SEED_PATH,label:'TodayInfo Africa verified reference seed',fallbackCountry:null}
];

const toDraft=(record,seed)=>{
  const td=record.type_data||{};
  const country=td.country||record.country||seed.fallbackCountry||null;
  const organisation=td.company||td.provider||record.organization||record.organisation||'';
  const contentType=record.content_type||'other';
  return {
    title:record.title||'Untitled',
    slug:record.slug,
    content_type:contentType,
    summary:record.summary||'',
    body_markdown:record.body_markdown||'',
    posted_date:record.posted_date||null,
    category:record.category||'',
    categories:record.categories||[],
    tags:record.tags||[],
    topics:record.topics||[],
    related_links:record.related_links||[],
    related_ids:record.related_ids||[],
    recommendation_ids:record.recommendation_ids||[],
    recommendation_links:record.recommendation_links||[],
    documents:record.documents||[],
    navigation_links:record.navigation_links||[],
    type_data:td,
    geo:normalizeGeo({
      country,
      country_name:country,
      region_name:td.region||td.province||td.state||null,
      city:td.city||null,
      location:td.location||country||null
    }),
    classification:normalizeClassification({
      organisation,
      opportunity_type:contentType,
      job_type:td.subtype||record.subtype||null,
      work_mode:/\bremote\b/i.test(td.location||'')?'remote':null
    }),
    main_image_url:record.main_image_url||null,
    seo_title:record.seo_title||record.title||'',
    seo_description:record.seo_description||record.summary||'',
    is_trending:Boolean(record.is_trending),
    status:'draft'
  };
};

function loadSeed(seed){
  if(!fs.existsSync(seed.path))return {metadata:{seed_id:seed.id,dataset_title:seed.label,record_count:0,missing:true},rows:[]};
  const payload=JSON.parse(fs.readFileSync(seed.path,'utf8'));
  const records=Array.isArray(payload.records)?payload.records:[];
  const rows=records.map(record=>{
    const prepared_draft=toDraft(record,seed);
    const quality=contentQuality(prepared_draft);
    const source=record.source||{};
    return {
      source_key:`reference:${seed.id}:${record.id||record.slug}`,
      source_hash:hashKey(JSON.stringify(record)),
      source_name:seed.label,
      source_id:record.id||null,
      source_url:source.source_url||record.type_data?.source_url||null,
      source_slug:record.slug||null,
      source_payload:record,
      detected_type:prepared_draft.content_type,
      prepared_draft,
      review_status:'unreviewed',
      source_changed:false,
      quality_score:quality.score,
      quality_issues:quality.issues,
      source_record_date:record.posted_date||source.verified_as_of||payload.researched_on||null
    };
  });
  return {
    metadata:{
      seed_id:seed.id,
      dataset_title:payload.dataset_title||seed.label,
      researched_on:payload.researched_on||null,
      publishing_note:payload.publishing_note||null,
      scope:payload.scope||null,
      countries:payload.countries||[],
      record_count:records.length
    },
    rows
  };
}

export function loadSouthAfricaReferenceSeed(){return loadSeed(SEEDS[0])}
export function loadAfricaReferenceSeed(){return loadSeed(SEEDS[1])}
export function loadAllReferenceSeeds(){
  const datasets=SEEDS.map(loadSeed);
  return {datasets,rows:datasets.flatMap(x=>x.rows),record_count:datasets.reduce((n,x)=>n+x.rows.length,0)};
}

async function publishSeedRows(store,rows){
  const published={created:0,updated:0,unchanged:0,artifacts:0,failed:0,total:rows.length};
  const imports=await store.listImports({});
  const byKey=new Map(imports.map(x=>[x.source_key,x]));
  const posts=await store.listPosts({include_deleted:true});
  const byIdentity=new Map();
  for(const p of posts){
    if(p.source?.source_url)byIdentity.set(`url:${p.source.source_url}`,p);
    if(p.slug)byIdentity.set(`slug:${p.geo?.country_code||''}:${p.slug}`,p);
  }

  for(const item of rows){
    try{
      const draft=item.prepared_draft;
      const imp=byKey.get(item.source_key);
      const source={
        source_name:item.source_name,source_id:item.source_id,source_url:item.source_url,source_slug:item.source_slug,
        source_hash:item.source_hash,raw_import_id:imp?.id||null,reference_seed:true,verified_dataset:true
      };
      let post=(item.source_url&&byIdentity.get(`url:${item.source_url}`))||byIdentity.get(`slug:${draft.geo?.country_code||''}:${draft.slug}`)||null;
      const publicPatch={
        title:draft.title,slug:draft.slug,content_type:draft.content_type,summary:draft.summary,body_markdown:draft.body_markdown,
        posted_date:draft.posted_date,category:draft.category,categories:draft.categories,tags:draft.tags,topics:draft.topics,
        related_links:draft.related_links,related_ids:draft.related_ids,recommendation_ids:draft.recommendation_ids,
        recommendation_links:draft.recommendation_links,documents:draft.documents,navigation_links:draft.navigation_links,
        type_data:draft.type_data,geo:draft.geo,classification:draft.classification,main_image_url:draft.main_image_url,
        seo_title:draft.seo_title,seo_description:draft.seo_description,is_trending:draft.is_trending,status:'published',deleted_at:null
      };
      const unchanged=Boolean(post&&post.status==='published'&&!post.deleted_at&&post.source?.reference_seed&&post.source?.source_hash===item.source_hash);
      if(unchanged){
        published.unchanged+=1;
      }else if(post){
        post=await store.updatePost(post.id,{...publicPatch,source},null);
        published.updated+=1;
      }else{
        post=await store.createPost({...publicPatch,source},null);
        published.created+=1;
      }
      if(!unchanged){
        const publication=await publishPostArtifact(store,post);
        post=await store.updatePost(post.id,{publication},null)||{...post,publication};
        published.artifacts+=1;
      }
      if(post?.source?.source_url)byIdentity.set(`url:${post.source.source_url}`,post);
      if(post?.slug)byIdentity.set(`slug:${post.geo?.country_code||''}:${post.slug}`,post);
      if(imp)await store.updateImport(imp.id,{review_status:'promoted',promoted_post_id:post.id,source_changed:false});
    }catch{
      published.failed+=1;
    }
  }
  return published;
}

export async function bootstrapReferenceSeeds(store){
  const all=loadAllReferenceSeeds();
  const learning=await learnFromImports(all.rows);
  let storage={inserted:0,changed:0,unchanged:0,total:all.rows.length,deferred:false};
  let published={created:0,updated:0,unchanged:0,artifacts:0,failed:0,total:all.rows.length};
  try{
    storage=await store.upsertImports(all.rows);
    published=await publishSeedRows(store,all.rows);
  }catch(error){
    storage={inserted:0,changed:0,unchanged:0,total:all.rows.length,deferred:true,error:error.message};
  }
  return {
    ...storage,
    seed_records:all.rows.length,
    seed_published:published,
    datasets:all.datasets.map(x=>x.metadata),
    learning_records_seen:learning.records_seen||0
  };
}

export async function bootstrapSouthAfricaReferenceSeed(store){
  const seed=loadSouthAfricaReferenceSeed();
  const learning=await learnFromImports(seed.rows);
  let storage={inserted:0,changed:0,unchanged:0,total:seed.rows.length,deferred:false};
  let published={created:0,updated:0,unchanged:0,artifacts:0,failed:0,total:seed.rows.length};
  try{
    storage=await store.upsertImports(seed.rows);
    published=await publishSeedRows(store,seed.rows);
  }catch(error){
    storage={inserted:0,changed:0,unchanged:0,total:seed.rows.length,deferred:true,error:error.message};
  }
  return {...storage,seed_records:seed.rows.length,seed_published:published,dataset_title:seed.metadata.dataset_title,research_on:seed.metadata.researched_on,learning_records_seen:learning.records_seen||0};
}
