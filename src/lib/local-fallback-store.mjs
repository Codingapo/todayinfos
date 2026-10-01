import fs from 'node:fs';
import path from 'node:path';
import { id, nowIso, slugify, uniqueSlug } from './utils.mjs';
import { filterPost } from './global-content.mjs';
import { calculateOpportunityStatus } from './content-rules.mjs';
import { rankTrending } from './ranking.mjs';

const FILE=path.resolve('data','fallback-index.json');
const initial=()=>({posts:[],analytics:[],media:[],audit:[],settings:{},database_queue:[]});

export class LocalFallbackStore {
  constructor(){
    fs.mkdirSync(path.dirname(FILE),{recursive:true});
    try{this.db={...initial(),...JSON.parse(fs.readFileSync(FILE,'utf8'))}}catch{this.db=initial()}
    for(const k of ['posts','analytics','media','audit','database_queue'])if(!Array.isArray(this.db[k]))this.db[k]=[];
  }
  save(){fs.writeFileSync(FILE,JSON.stringify(this.db,null,2))}
  cachePost(row){
    if(!row)return row;
    const i=this.db.posts.findIndex(x=>x.id===row.id||(x.slug===row.slug&&x.geo?.country_code===row.geo?.country_code));
    if(i>=0)this.db.posts[i]={...this.db.posts[i],...structuredClone(row)};
    else this.db.posts.push(structuredClone(row));
    this.save();return row;
  }
  cachePosts(rows=[]){for(const row of rows)this.cachePost(row);return rows}
  async listPosts(f={}){
    let rows=this.db.posts.filter(p=>f.include_deleted?true:!p.deleted_at);
    if(f.status)rows=rows.filter(p=>p.status===f.status);
    if(f.type)rows=rows.filter(p=>p.content_type===f.type);
    if(f.trending!==undefined)rows=rows.filter(p=>Boolean(p.is_trending)===Boolean(f.trending));
    if(f.q){const n=String(f.q).toLowerCase();rows=rows.filter(p=>JSON.stringify(p).toLowerCase().includes(n))}
    if(f.tag)rows=rows.filter(p=>(p.tags||[]).map(slugify).includes(slugify(f.tag)));
    if(f.category)rows=rows.filter(p=>(p.categories||[]).map(slugify).includes(slugify(f.category))||slugify(p.category||'')===slugify(f.category));
    rows=rows.filter(p=>filterPost(p,f));
    if(f.opportunity_status)rows=rows.filter(p=>calculateOpportunityStatus(p.type_data||{})===f.opportunity_status);
    return rows.sort((a,b)=>String(b.published_at||b.posted_date||b.updated_at).localeCompare(String(a.published_at||a.posted_date||a.updated_at)))
      .map(p=>({...p,views:this.db.analytics.filter(e=>e.post_id===p.id&&e.event_type==='view').length,reads:this.db.analytics.filter(e=>e.post_id===p.id&&e.event_type==='read').length}));
  }
  async trendingPosts(f={}){
    const rows=await this.listPosts({...f,status:'published'});const cutoff=Date.now()-14*86400000;const counts={};
    for(const e of this.db.analytics){if(!e.post_id||new Date(e.created_at).getTime()<cutoff)continue;counts[e.post_id]||={};counts[e.post_id][e.event_type]=(counts[e.post_id][e.event_type]||0)+1}
    return rankTrending(rows,counts);
  }
  async visitorEvents(visitorId,limit=200){return this.db.analytics.filter(e=>e.visitor_id===visitorId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,limit)}
  async getPost(v){return this.db.posts.find(p=>p.id===v)||null}
  async getPostBySlug(slug){return this.db.posts.find(p=>p.slug===slug&&p.status==='published'&&!p.deleted_at)||null}
  async createPost(i,actor=null){
    const ts=nowIso();const postId=i.id||id();
    const row={
      id:postId,title:i.title||'Untitled',slug:uniqueSlug(i.slug||i.title,this.db.posts.map(p=>p.slug)),
      content_type:i.content_type||'other',summary:i.summary||'',body_markdown:i.body_markdown||'',
      posted_date:i.posted_date||null,category:i.category||'',categories:i.categories||[],tags:i.tags||[],
      topics:i.topics||[],related_links:i.related_links||[],related_ids:i.related_ids||[],
      recommendation_ids:i.recommendation_ids||[],recommendation_links:i.recommendation_links||[],
      documents:i.documents||[],navigation_links:i.navigation_links||[],type_data:i.type_data||{},
      geo:i.geo||{},classification:i.classification||{},publication:i.publication||{},
      main_image_url:i.main_image_url||null,seo_title:i.seo_title||'',seo_description:i.seo_description||'',
      source:i.source||null,status:i.status||'draft',is_trending:Boolean(i.is_trending),
      created_by:actor,updated_by:actor,published_at:i.status==='published'?ts:null,
      created_at:ts,updated_at:ts,deleted_at:null
    };
    this.cachePost(row);return row;
  }
  async updatePost(v,patch,actor=null){
    const row=await this.getPost(v);if(!row)return null;
    Object.assign(row,structuredClone(patch),{updated_by:actor,updated_at:nowIso()});
    if(row.status==='published'&&!row.published_at)row.published_at=nowIso();
    this.save();return row;
  }
  async trashPost(v,a=null){return this.updatePost(v,{deleted_at:nowIso(),status:'trash'},a)}
  async restorePost(v,a=null){return this.updatePost(v,{deleted_at:null,status:'draft'},a)}
  async recordEvent(i){const row={id:id(),...i,created_at:nowIso()};this.db.analytics.push(row);if(this.db.analytics.length>50000)this.db.analytics=this.db.analytics.slice(-50000);this.save();return row}
  async analyticsSummary(){
    const totals={};const countries={};const regions={};const searches={};
    for(const e of this.db.analytics){
      totals[e.event_type]=(totals[e.event_type]||0)+1;
      const country=e.meta?.country_code||e.meta?.country;if(country)countries[country]=(countries[country]||0)+1;
      const region=e.meta?.region_name||e.meta?.region;if(region)regions[region]=(regions[region]||0)+1;
      if(e.event_type==='search'&&e.meta?.query)searches[e.meta.query]=(searches[e.meta.query]||0)+1;
    }
    return{totals,countries,regions,searches,unique_visitors:new Set(this.db.analytics.map(x=>x.visitor_id).filter(Boolean)).size};
  }
  async dashboard(){const posts=await this.listPosts({status:'published'});return{cards:{published_posts:posts.length},content_mix:Object.fromEntries(Object.entries(posts.reduce((a,p)=>(a[p.content_type]=(a[p.content_type]||0)+1,a),{}))),top_posts:posts.slice(0,8),recent_activity:this.db.audit.slice(-12).reverse()}}
  async settings(){return this.db.settings||{}}
  async updateSettings(p){Object.assign(this.db.settings,p);this.save();return this.db.settings}
  async addMedia(i){const row={id:id(),...i,created_at:nowIso()};this.db.media.push(row);this.save();return row}
  async listMedia(){return [...this.db.media].reverse()}
  async audit(actor,action,entityType,entityId,meta={}){const row={id:id(),actor_id:actor,action,entity_type:entityType,entity_id:entityId,meta,created_at:nowIso()};this.db.audit.push(row);this.save();return row}
  async listAudit(){return [...this.db.audit].reverse().slice(0,500)}
  async tags(){const c={};for(const p of await this.listPosts({status:'published'}))for(const t of p.tags||[])c[t]=(c[t]||0)+1;return Object.entries(c).map(([name,count])=>({name,slug:slugify(name),count})).sort((a,b)=>b.count-a.count)}
  async categories(){const c={};for(const p of await this.listPosts({status:'published'})){for(const t of p.categories||[])c[t]=(c[t]||0)+1;if(p.category)c[p.category]=(c[p.category]||0)+1}return Object.entries(c).map(([name,count])=>({title:name,name,slug:slugify(name),count})).sort((a,b)=>b.count-a.count)}
  enqueueDatabaseOperation(method,args=[]){const row={id:id(),method,args,attempts:0,created_at:nowIso(),last_error:null};this.db.database_queue.push(row);this.save();return row}
  databaseQueue(){return [...this.db.database_queue]}
  updateQueuedOperation(queueId,patch){const row=this.db.database_queue.find(x=>x.id===queueId);if(row)Object.assign(row,patch);this.save();return row}
  removeQueuedOperation(queueId){this.db.database_queue=this.db.database_queue.filter(x=>x.id!==queueId);this.save()}
}
