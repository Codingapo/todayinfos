import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { id, nowIso, uniqueSlug, slugify } from './utils.mjs';
import { calculateOpportunityStatus } from './content-rules.mjs';
import { filterPost } from './global-content.mjs';
import { rankTrending } from './ranking.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));
const DB_FILE=path.resolve(__dirname,'../../data/demo-db.json');
const initial=()=>({
  users:[{id:'admin-apo',username:'apo',email:'apo@local.todayinfo',display_name:'Apo',role:'owner',active:true,created_at:nowIso()}],
  imports:[],posts:[],revisions:[],redirects:[],analytics:[],media:[],audit:[],
  settings:{site_name:'TodayInfo',whatsapp_number:'',contact_email:'',main_logo_url:'',dark_logo_url:'',favicon_url:'',default_social_image_url:''}
});
const normalizeDb=db=>{
  const base=initial();const merged={...base,...db};
  for(const key of ['users','imports','posts','revisions','redirects','analytics','media','audit'])if(!Array.isArray(merged[key]))merged[key]=[];
  merged.imports=merged.imports.map(row=>row?.review_status==='ignored'?{...row,review_status:'unreviewed'}:row);
  return merged;
};
const postStatus=p=>p.content_type==='bursary'?calculateOpportunityStatus(p.type_data||{}):null;

export class DemoStore{
  constructor(){this.db=this.#load()}
  #load(){try{return normalizeDb(JSON.parse(fs.readFileSync(DB_FILE,'utf8')))}catch{const db=initial();fs.mkdirSync(path.dirname(DB_FILE),{recursive:true});fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));return db}}
  #save(){fs.writeFileSync(DB_FILE,JSON.stringify(this.db,null,2))}

  async findUserByUsername(username){return this.db.users.find(u=>u.username.toLowerCase()===String(username).toLowerCase()&&u.active)||null}
  async getUser(v){return this.db.users.find(u=>u.id===v)||null}
  async listUsers(){return this.db.users.map(({password_hash,...u})=>u)}
  async createUser(i){if(this.db.users.some(u=>u.username.toLowerCase()===i.username.toLowerCase()))throw new Error('Username already exists');if(i.email&&this.db.users.some(u=>u.email?.toLowerCase()===i.email.toLowerCase()))throw new Error('Email already exists');const row={id:id(),username:i.username,email:i.email||'',display_name:i.display_name||i.username,role:i.role||'viewer',active:true,password_hash:i.password_hash||null,created_at:nowIso()};this.db.users.push(row);this.#save();return row}
  async updateUser(v,p){const row=this.db.users.find(u=>u.id===v);if(!row)return null;Object.assign(row,p,{updated_at:nowIso()});this.#save();return row}

  async dashboard(){
    const published=this.db.posts.filter(p=>p.status==='published'&&!p.deleted_at);const today=new Date().toISOString().slice(0,10);const ev=this.db.analytics.filter(e=>e.created_at.startsWith(today));
    const openB=published.filter(p=>p.content_type==='bursary'&&postStatus(p)==='open').length;const closedB=published.filter(p=>p.content_type==='bursary'&&postStatus(p)==='closed').length;
    const mix={};for(const p of published)mix[p.content_type]=(mix[p.content_type]||0)+1;const viewsByType={};for(const e of ev.filter(x=>x.event_type==='view')){const p=this.db.posts.find(x=>x.id===e.post_id);const t=p?.content_type||'other';viewsByType[t]=(viewsByType[t]||0)+1}
    return{cards:{open_bursaries:openB,closed_bursaries:closedB,published_posts:published.length,visitors_today:new Set(ev.map(e=>e.visitor_id).filter(Boolean)).size,reads_today:ev.filter(e=>e.event_type==='read').length,raw_imports_waiting:this.db.imports.filter(i=>i.review_status==='unreviewed').length},content_mix:mix,views_by_type:viewsByType,recent_activity:this.db.audit.slice(-12).reverse(),top_posts:published.map(p=>({id:p.id,title:p.title,slug:p.slug,content_type:p.content_type,views:this.db.analytics.filter(e=>e.post_id===p.id&&e.event_type==='view').length,reads:this.db.analytics.filter(e=>e.post_id===p.id&&e.event_type==='read').length})).sort((a,b)=>b.views-a.views).slice(0,8)}
  }

  async upsertImports(rows){
    let inserted=0,changed=0,unchanged=0;
    const now=nowIso();
    for(const input of rows){
      const found=this.db.imports.find(i=>i.source_key===input.source_key);
      if(!found){
        this.db.imports.push({id:id(),...input,source_changed:false,fetch_count:1,first_seen_at:now,last_seen_at:now,last_changed_at:now,created_at:now,updated_at:now});
        inserted++;continue;
      }
      const isChanged=Boolean(input.source_hash&&found.source_hash&&input.source_hash!==found.source_hash);
      const keepReview=found.review_status||'unreviewed';
      const keepPromoted=found.promoted_post_id||null;
      Object.assign(found,{
        source_name:input.source_name,source_id:input.source_id,source_url:input.source_url,source_slug:input.source_slug,
        source_hash:input.source_hash,source_payload:input.source_payload,detected_type:input.detected_type,
        source_record_date:input.source_record_date||found.source_record_date||null,
        quality_score:input.quality_score,quality_issues:input.quality_issues||[],
        review_status:keepReview,promoted_post_id:keepPromoted,
        source_changed:isChanged || Boolean(found.source_changed),
        fetch_count:Number(found.fetch_count||1)+1,last_seen_at:now,updated_at:now
      });
      if(isChanged){
        found.last_changed_at=now;
        if(['unreviewed','reviewing'].includes(keepReview)) found.prepared_draft=input.prepared_draft;
        changed++;
      } else unchanged++;
    }
    this.#save();
    return{inserted,changed,unchanged,total:rows.length};
  }
  async listImports({status,type,q}={}){let rows=[...this.db.imports];if(status)rows=rows.filter(x=>x.review_status===status);if(type)rows=rows.filter(x=>x.detected_type===type);if(q){const n=String(q).toLowerCase();rows=rows.filter(x=>JSON.stringify(x).toLowerCase().includes(n))}return rows.sort((a,b)=>String(b.updated_at).localeCompare(String(a.updated_at)))}
  async getImport(v){return this.db.imports.find(i=>i.id===v)||null}
  async updateImport(v,p){const row=await this.getImport(v);if(!row)return null;Object.assign(row,p,{updated_at:nowIso()});this.#save();return row}

  async listPosts(f={}){
    let rows=this.db.posts.filter(p=>f.include_deleted?true:!p.deleted_at);
    if(f.status)rows=rows.filter(p=>p.status===f.status);
    if(f.type)rows=rows.filter(p=>p.content_type===f.type);
    if(f.trending!==undefined)rows=rows.filter(p=>Boolean(p.is_trending)===Boolean(f.trending));
    if(f.q){
      const n=String(f.q).toLowerCase();
      rows=rows.filter(p=>`${p.title} ${p.summary} ${p.body_markdown} ${JSON.stringify(p.type_data||{})} ${JSON.stringify(p.geo||{})} ${JSON.stringify(p.classification||{})} ${(p.tags||[]).join(' ')}`.toLowerCase().includes(n));
    }
    if(f.tag)rows=rows.filter(p=>(p.tags||[]).map(slugify).includes(slugify(f.tag)));
    if(f.category)rows=rows.filter(p=>(p.categories||[]).map(slugify).includes(slugify(f.category))||slugify(p.category||'')===slugify(f.category));
    rows=rows.filter(p=>filterPost(p,f));
    if(f.opportunity_status)rows=rows.filter(p=>calculateOpportunityStatus(p.type_data||{})===f.opportunity_status);
    rows=rows.sort((a,b)=>String(b.published_at||b.posted_date||b.updated_at).localeCompare(String(a.published_at||a.posted_date||a.updated_at)));
    return rows.map(p=>({...p,views:this.db.analytics.filter(e=>e.post_id===p.id&&e.event_type==='view').length,reads:this.db.analytics.filter(e=>e.post_id===p.id&&e.event_type==='read').length}));
  }
  async trendingPosts(f={}){
    const rows=await this.listPosts({...f,status:'published'});
    const cutoff=Date.now()-14*86400000;const counts={};
    for(const e of this.db.analytics){
      if(!e.post_id||new Date(e.created_at).getTime()<cutoff)continue;
      counts[e.post_id]||={};counts[e.post_id][e.event_type]=(counts[e.post_id][e.event_type]||0)+1;
    }
    return rankTrending(rows,counts);
  }
  async visitorEvents(visitorId,limit=200){return this.db.analytics.filter(e=>e.visitor_id===visitorId).sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,limit)}
  async getPost(v){return this.db.posts.find(p=>p.id===v)||null}
  async getPostBySlug(slug){return this.db.posts.find(p=>p.slug===slug&&p.status==='published'&&!p.deleted_at)||null}
  async createPost(i,actor=null){
    const ts=nowIso();
    const row={
      id:id(),title:i.title||'Untitled',slug:uniqueSlug(i.slug||i.title,this.db.posts.map(p=>p.slug)),
      content_type:i.content_type||'other',summary:i.summary||'',body_markdown:i.body_markdown||'',
      posted_date:i.posted_date||null,category:i.category||'',categories:i.categories||[],tags:i.tags||[],
      topics:i.topics||[],related_links:i.related_links||[],related_ids:i.related_ids||[],
      recommendation_ids:i.recommendation_ids||[],recommendation_links:i.recommendation_links||[],
      documents:i.documents||[],navigation_links:i.navigation_links||[],type_data:i.type_data||{},
      geo:i.geo||{},classification:i.classification||{},publication:i.publication||{},
      main_image_url:i.main_image_url||null,seo_title:i.seo_title||'',seo_description:i.seo_description||'',
      source:i.source||null,status:i.status||'draft',is_trending:Boolean(i.is_trending),created_by:actor,updated_by:actor,
      published_at:i.status==='published'?ts:null,created_at:ts,updated_at:ts,deleted_at:null
    };
    this.db.posts.push(row);
    this.db.revisions.push({id:id(),post_id:row.id,snapshot:{...row},actor_id:actor,created_at:ts});
    this.#save();return row;
  }
  async updatePost(v,patch,actor=null){const row=await this.getPost(v);if(!row)return null;const before=structuredClone(row);if(patch.slug&&patch.slug!==row.slug){const next=uniqueSlug(patch.slug,this.db.posts.filter(p=>p.id!==row.id).map(p=>p.slug));this.db.redirects.push({id:id(),from_slug:row.slug,to_slug:next,created_at:nowIso()});patch={...patch,slug:next}}Object.assign(row,patch,{updated_by:actor,updated_at:nowIso()});if(patch.status==='published'&&!row.published_at)row.published_at=nowIso();this.db.revisions.push({id:id(),post_id:row.id,snapshot:before,actor_id:actor,created_at:nowIso()});this.#save();return row}
  async trashPost(v,a=null){return this.updatePost(v,{deleted_at:nowIso(),status:'trash'},a)}
  async restorePost(v,a=null){return this.updatePost(v,{deleted_at:null,status:'draft'},a)}
  async revisions(v){return this.db.revisions.filter(r=>r.post_id===v).sort((a,b)=>b.created_at.localeCompare(a.created_at))}
  async promoteImport(v,actor){
    const imp=await this.getImport(v);if(!imp)return null;
    if(imp.promoted_post_id){const existing=await this.getPost(imp.promoted_post_id);if(existing)return existing}
    const post=await this.createPost({...imp.prepared_draft,status:'draft',source:{source_name:imp.source_name,source_id:imp.source_id,source_url:imp.source_url,source_slug:imp.source_slug,raw_import_id:imp.id}},actor);
    await this.updateImport(v,{review_status:'promoted',promoted_post_id:post.id,source_changed:false});
    return post;
  }

  async recordEvent(i){const row={id:id(),...i,created_at:nowIso()};this.db.analytics.push(row);if(this.db.analytics.length>50000)this.db.analytics=this.db.analytics.slice(-50000);this.#save();return row}
  async analyticsSummary(){
    const e=this.db.analytics;const totals={},days={},byContent={},countries={},regions={},searches={};
    for(const x of e){
      totals[x.event_type]=(totals[x.event_type]||0)+1;
      const d=String(x.created_at||'').slice(0,10);if(d)days[d]=(days[d]||0)+1;
      const cc=x.meta?.country_code||x.meta?.country;if(cc)countries[cc]=(countries[cc]||0)+1;
      const rg=x.meta?.region_name||x.meta?.region;if(rg)regions[rg]=(regions[rg]||0)+1;
      if(x.event_type==='search'&&x.meta?.query){const q=String(x.meta.query).toLowerCase();searches[q]=(searches[q]||0)+1}
      if(x.event_type==='view'){const p=this.db.posts.find(p=>p.id===x.post_id);const t=p?.content_type||x.meta?.content_type||'other';byContent[t]=(byContent[t]||0)+1}
    }
    const topEntries=o=>Object.entries(o).map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count).slice(0,50);
    return{totals,daily:Object.entries(days).sort().slice(-30).map(([date,total])=>({date,total})),unique_visitors:new Set(e.map(x=>x.visitor_id).filter(Boolean)).size,views_by_content_type:byContent,visitors_by_country:topEntries(countries),visitors_by_region:topEntries(regions),top_searches:topEntries(searches)}
  }

  async settings(){return this.db.settings}
  async updateSettings(p){Object.assign(this.db.settings,p);this.#save();return this.db.settings}
  async addMedia(i){const row={id:id(),...i,created_at:nowIso()};this.db.media.push(row);this.#save();return row}
  async listMedia(){return [...this.db.media].reverse()}
  async audit(actor,action,entityType,entityId,meta={}){const row={id:id(),actor_id:actor,action,entity_type:entityType,entity_id:entityId,meta,created_at:nowIso()};this.db.audit.push(row);this.#save();return row}
  async listAudit(){return [...this.db.audit].reverse().slice(0,500)}
  async tags(){const c={};for(const p of await this.listPosts({status:'published'}))for(const t of p.tags||[])c[t]=(c[t]||0)+1;return Object.entries(c).map(([name,count])=>({name,slug:slugify(name),count})).sort((a,b)=>b.count-a.count)}
  async categories(){const c={};for(const p of await this.listPosts({status:'published'})){for(const t of p.categories||[])c[t]=(c[t]||0)+1;if(p.category)c[p.category]=(c[p.category]||0)+1}return Object.entries(c).map(([name,count])=>({title:name,name,slug:slugify(name),count})).sort((a,b)=>b.count-a.count)}
  async findRedirect(s){return this.db.redirects.find(r=>r.from_slug===s)||null}
}
