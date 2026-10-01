import { readPublishedJson, savePublishedJson } from './r2.mjs';
import { calculateOpportunityStatus } from './content-rules.mjs';
import { filterPost } from './global-content.mjs';
import { slugify } from './utils.mjs';

export const PUBLISHED_INDEX_KEY='published/_index.json';
export const PUBLISHED_INDEX_SCHEMA='todayinfo.index.v1';

const indexRecord=post=>({
  id:post.id,slug:post.slug,title:post.title,content_type:post.content_type,summary:post.summary||'',
  posted_date:post.posted_date||null,published_at:post.published_at||null,updated_at:post.updated_at||null,
  category:post.category||'',categories:post.categories||[],tags:post.tags||[],
  type_data:post.type_data||{},geo:post.geo||{},classification:post.classification||{},
  main_image_url:post.main_image_url||null,seo_title:post.seo_title||'',seo_description:post.seo_description||'',
  is_trending:Boolean(post.is_trending),status:'published',deleted_at:null,publication:post.publication||{}
});

async function manifest(){
  const found=await readPublishedJson(PUBLISHED_INDEX_KEY);
  const payload=found?.payload;
  if(payload?.schema===PUBLISHED_INDEX_SCHEMA&&Array.isArray(payload.items))return payload;
  return {schema:PUBLISHED_INDEX_SCHEMA,generated_at:new Date(0).toISOString(),items:[]};
}

export async function upsertPublishedIndex(post){
  const data=await manifest();const item=indexRecord(post);
  const i=data.items.findIndex(x=>x.id===item.id||(x.slug===item.slug&&x.geo?.country_code===item.geo?.country_code));
  if(i>=0)data.items[i]=item;else data.items.push(item);
  data.generated_at=new Date().toISOString();
  data.items=data.items.slice(-100000);
  return savePublishedJson({key:PUBLISHED_INDEX_KEY,payload:data});
}

export async function removePublishedIndex(post){
  const data=await manifest();
  data.items=data.items.filter(x=>x.id!==post.id&&!(x.slug===post.slug&&x.geo?.country_code===post.geo?.country_code));
  data.generated_at=new Date().toISOString();
  return savePublishedJson({key:PUBLISHED_INDEX_KEY,payload:data});
}

export async function listPublishedIndex(filters={}){
  const data=await manifest();let rows=[...data.items];
  if(filters.status&&filters.status!=='published')return [];
  if(filters.type)rows=rows.filter(x=>x.content_type===filters.type);
  if(filters.trending!==undefined)rows=rows.filter(x=>Boolean(x.is_trending)===Boolean(filters.trending));
  if(filters.q){const q=String(filters.q).toLowerCase();rows=rows.filter(x=>JSON.stringify(x).toLowerCase().includes(q))}
  if(filters.tag)rows=rows.filter(x=>(x.tags||[]).map(slugify).includes(slugify(filters.tag)));
  if(filters.category)rows=rows.filter(x=>(x.categories||[]).map(slugify).includes(slugify(filters.category))||slugify(x.category||'')===slugify(filters.category));
  rows=rows.filter(x=>filterPost(x,filters));
  if(filters.opportunity_status)rows=rows.filter(x=>calculateOpportunityStatus(x.type_data||{})===filters.opportunity_status);
  return rows.sort((a,b)=>String(b.published_at||b.posted_date||b.updated_at).localeCompare(String(a.published_at||a.posted_date||a.updated_at)));
}

export async function getPublishedIndexPost({id,slug}={}){
  const data=await manifest();
  return data.items.find(x=>(id&&x.id===id)||(slug&&x.slug===slug))||null;
}
