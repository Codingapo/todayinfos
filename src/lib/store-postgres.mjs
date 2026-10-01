import pg from 'pg';
import { id, slugify, uniqueSlug } from './utils.mjs';
import { calculateOpportunityStatus } from './content-rules.mjs';
import { filterPost, normalizeCountryCode } from './global-content.mjs';
const {Pool}=pg;
const json=v=>v==null?null:JSON.stringify(v);
const JSON_FIELDS=new Set(['source_payload','prepared_draft','topics','related_links','recommendation_links','documents','navigation_links','type_data','geo','classification','publication','source']);

export class PostgresStore{
  constructor({connectionString,ssl=true}){this.pool=new Pool({connectionString,ssl:ssl?{rejectUnauthorized:false}:false,max:10,idleTimeoutMillis:30000})}
  q(t,p=[]){return this.pool.query(t,p)}
  async #uniqueSlug(value,excludeId=null){const base=slugify(value)||'post';const rows=(await this.q(`select slug from posts ${excludeId?'where id<>$1':''}`,excludeId?[excludeId]:[])).rows.map(x=>x.slug);return uniqueSlug(base,rows)}

  async findUserByUsername(u){return(await this.q('select * from admin_users where lower(username)=lower($1) and active=true limit 1',[u])).rows[0]||null}
  async getUser(id){return(await this.q('select * from admin_users where id=$1',[id])).rows[0]||null}
  async listUsers(){return(await this.q('select id,username,email,display_name,role,active,created_at,updated_at from admin_users order by created_at desc')).rows}
  async createUser(i){return(await this.q(`insert into admin_users(username,email,display_name,role,password_hash) values($1,$2,$3,$4,$5) returning *`,[i.username,i.email||'',i.display_name||i.username,i.role||'viewer',i.password_hash||null])).rows[0]}
  async updateUser(id,p){const allowed=new Set(['role','active','display_name','password_hash']);const keys=Object.keys(p).filter(k=>allowed.has(k));if(!keys.length)return this.getUser(id);const vals=keys.map(k=>p[k]);const sets=keys.map((k,n)=>`${k}=$${n+2}`).join(',');return(await this.q(`update admin_users set ${sets},updated_at=now() where id=$1 returning *`,[id,...vals])).rows[0]||null}

  async dashboard(){
    const posts=(await this.q(`select id,title,slug,content_type,type_data from posts where status='published' and deleted_at is null`)).rows;
    const openB=posts.filter(p=>p.content_type==='bursary'&&calculateOpportunityStatus(p.type_data||{})==='open').length;const closedB=posts.filter(p=>p.content_type==='bursary'&&calculateOpportunityStatus(p.type_data||{})==='closed').length;
    const visits=(await this.q(`select count(distinct visitor_id)::int visitors,count(*) filter(where event_type='read')::int reads from analytics_events where created_at>=current_date`)).rows[0];
    const waiting=(await this.q(`select count(*)::int n from raw_imports where review_status='unreviewed'`)).rows[0].n;
    const mix={};for(const p of posts)mix[p.content_type]=(mix[p.content_type]||0)+1;
    const viewMix=(await this.q(`select coalesce(p.content_type,'other') content_type,count(*)::int n from analytics_events a left join posts p on p.id=a.post_id where a.event_type='view' and a.created_at>=current_date group by 1`)).rows;
    const top=(await this.q(`select p.id,p.title,p.slug,p.content_type,count(*) filter(where a.event_type='view')::int views,count(*) filter(where a.event_type='read')::int reads from posts p left join analytics_events a on a.post_id=p.id where p.status='published' and p.deleted_at is null group by p.id order by views desc limit 8`)).rows;
    const activity=(await this.q(`select * from audit_logs order by created_at desc limit 12`)).rows;
    return{cards:{open_bursaries:openB,closed_bursaries:closedB,published_posts:posts.length,visitors_today:visits.visitors,reads_today:visits.reads,raw_imports_waiting:waiting},content_mix:mix,views_by_type:Object.fromEntries(viewMix.map(x=>[x.content_type,x.n])),top_posts:top,recent_activity:activity}
  }

  async upsertImports(rows){
    let inserted=0,changed=0,unchanged=0;
    for(const i of rows){
      const existing=(await this.q('select source_hash,review_status,promoted_post_id from raw_imports where source_key=$1',[i.source_key])).rows[0];
      const isChanged=Boolean(existing&&i.source_hash&&existing.source_hash&&i.source_hash!==existing.source_hash);
      const r=await this.q(`
        insert into raw_imports(
          source_key,source_name,source_id,source_url,source_slug,source_hash,source_payload,detected_type,prepared_draft,review_status,
          source_changed,quality_score,quality_issues,source_record_date,fetch_count,first_seen_at,last_seen_at,last_changed_at
        ) values($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,false,$11,$12::jsonb,$13,1,now(),now(),now())
        on conflict(source_key) do update set
          source_name=excluded.source_name,source_id=excluded.source_id,source_url=excluded.source_url,source_slug=excluded.source_slug,
          source_hash=excluded.source_hash,source_payload=excluded.source_payload,detected_type=excluded.detected_type,
          prepared_draft=case when raw_imports.review_status in ('unreviewed','reviewing') and raw_imports.source_hash is distinct from excluded.source_hash then excluded.prepared_draft else raw_imports.prepared_draft end,
          source_changed=raw_imports.source_changed or (raw_imports.source_hash is distinct from excluded.source_hash),
          quality_score=excluded.quality_score,quality_issues=excluded.quality_issues,source_record_date=excluded.source_record_date,
          fetch_count=coalesce(raw_imports.fetch_count,1)+1,last_seen_at=now(),
          last_changed_at=case when raw_imports.source_hash is distinct from excluded.source_hash then now() else raw_imports.last_changed_at end,
          updated_at=now()
        returning (xmax=0) inserted
      `,[i.source_key,i.source_name,i.source_id,i.source_url,i.source_slug,i.source_hash,json(i.source_payload||{}),i.detected_type,json(i.prepared_draft||{}),i.review_status||'unreviewed',i.quality_score||0,json(i.quality_issues||[]),i.source_record_date||null]);
      if(r.rows[0]?.inserted)inserted++;else if(isChanged)changed++;else unchanged++;
    }
    return{inserted,changed,unchanged,total:rows.length};
  }
  async listImports(f={}){const p=[];const w=[];if(f.status){p.push(f.status);w.push(`review_status=$${p.length}`)}if(f.type){p.push(f.type);w.push(`detected_type=$${p.length}`)}if(f.q){p.push(`%${f.q}%`);w.push(`(coalesce(source_name,'') ilike $${p.length} or coalesce(source_slug,'') ilike $${p.length} or source_payload::text ilike $${p.length})`)}return(await this.q(`select * from raw_imports ${w.length?'where '+w.join(' and '):''} order by coalesce(source_record_date,last_seen_at,updated_at) desc limit 5000`,p)).rows}
  async getImport(id){return(await this.q('select * from raw_imports where id=$1',[id])).rows[0]||null}
  async updateImport(id,p){const allowed=new Set(['review_status','detected_type','prepared_draft','promoted_post_id','source_changed']);const keys=Object.keys(p).filter(k=>allowed.has(k));if(!keys.length)return this.getImport(id);const vals=keys.map(k=>JSON_FIELDS.has(k)?json(p[k]):p[k]);const sets=keys.map((k,n)=>`${k}=$${n+2}${JSON_FIELDS.has(k)?'::jsonb':''}`).join(',');return(await this.q(`update raw_imports set ${sets},updated_at=now() where id=$1 returning *`,[id,...vals])).rows[0]||null}

  async listPosts(f={}){
    const p=[];const w=[];
    if(!f.include_deleted)w.push('deleted_at is null');
    if(f.status){p.push(f.status);w.push(`status=${p.length}`)}
    if(f.type){p.push(f.type);w.push(`content_type=${p.length}`)}
    if(f.trending!==undefined){p.push(Boolean(f.trending));w.push(`is_trending=${p.length}`)}
    if(f.q){p.push(`%${f.q}%`);w.push(`(title ilike ${p.length} or summary ilike ${p.length} or body_markdown ilike ${p.length} or type_data::text ilike ${p.length} or geo::text ilike ${p.length} or classification::text ilike ${p.length} or array_to_string(tags,' ') ilike ${p.length})`)}
    if(f.tag){p.push(slugify(f.tag));w.push(`exists(select 1 from unnest(tags)t where regexp_replace(lower(t),'[^a-z0-9]+','-','g')=${p.length})`)}
    if(f.category){p.push(slugify(f.category));w.push(`(regexp_replace(lower(coalesce(category,'')),'[^a-z0-9]+','-','g')=${p.length} or exists(select 1 from unnest(categories)t where regexp_replace(lower(t),'[^a-z0-9]+','-','g')=${p.length}))`)}
    if(f.country){p.push(normalizeCountryCode(f.country));w.push(`upper(coalesce(geo->>'country_code',''))=${p.length}`)}
    if(f.region){p.push(`%${f.region}%`);w.push(`(coalesce(geo->>'region_name','') ilike ${p.length} or coalesce(geo->>'region_code','') ilike ${p.length})`)}
    if(f.city){p.push(`%${f.city}%`);w.push(`coalesce(geo->>'city','') ilike ${p.length}`)}
    if(f.subcategory){p.push(f.subcategory);w.push(`lower(coalesce(classification->>'subcategory',''))=lower(${p.length})`)}
    if(f.organisation){p.push(`%${f.organisation}%`);w.push(`coalesce(classification->>'organisation','') ilike ${p.length}`)}
    if(f.opportunity_type){p.push(f.opportunity_type);w.push(`lower(coalesce(classification->>'opportunity_type',''))=lower(${p.length})`)}
    if(f.job_type){p.push(f.job_type);w.push(`lower(coalesce(classification->>'job_type',''))=lower(${p.length})`)}
    if(f.work_mode){p.push(f.work_mode);w.push(`lower(coalesce(classification->>'work_mode',''))=lower(${p.length})`)}
    if(f.education_level){p.push(`%${f.education_level}%`);w.push(`coalesce(classification->'education_level','[]'::jsonb)::text ilike ${p.length}`)}
    if(f.field_of_study){p.push(`%${f.field_of_study}%`);w.push(`coalesce(classification->'fields_of_study','[]'::jsonb)::text ilike ${p.length}`)}
    if(f.closing_before){p.push(f.closing_before);w.push(`nullif(type_data->>'closing_date','')::date <= ${p.length}::date`)}
    if(f.closing_after){p.push(f.closing_after);w.push(`nullif(type_data->>'closing_date','')::date >= ${p.length}::date`)}
    if(f.posted_before){p.push(f.posted_before);w.push(`posted_date::date <= ${p.length}::date`)}
    if(f.posted_after){p.push(f.posted_after);w.push(`posted_date::date >= ${p.length}::date`)}
    let rows=(await this.q(`select posts.*,(select count(*)::int from analytics_events a where a.post_id=posts.id and a.event_type='view') views,(select count(*)::int from analytics_events a where a.post_id=posts.id and a.event_type='read') reads from posts ${w.length?'where '+w.join(' and '):''} order by coalesce(published_at,posted_date,updated_at) desc limit 5000`,p)).rows;
    rows=rows.filter(row=>filterPost(row,f));
    if(f.opportunity_status)rows=rows.filter(row=>calculateOpportunityStatus(row.type_data||{})===f.opportunity_status);
    return rows;
  }
  async getPost(id){return(await this.q('select * from posts where id=$1',[id])).rows[0]||null}
  async getPostBySlug(slug){return(await this.q(`select * from posts where slug=$1 and status='published' and deleted_at is null limit 1`,[slug])).rows[0]||null}
  async createPost(i,actor){
    const postId=i.id||id();
    const slug=await this.#uniqueSlug(i.slug||i.title);
    return(await this.q(`insert into posts(
      id,title,slug,content_type,summary,body_markdown,posted_date,category,categories,tags,topics,related_links,
      related_ids,recommendation_ids,recommendation_links,documents,navigation_links,type_data,geo,classification,publication,
      main_image_url,seo_title,seo_description,source,status,is_trending,created_by,updated_by,published_at
    ) values(
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13,$14,$15::jsonb,$16::jsonb,$17::jsonb,$18::jsonb,
      $19::jsonb,$20::jsonb,$21::jsonb,$22,$23,$24,$25::jsonb,$26,$27,$28,$28,case when $26='published' then now() else null end
    ) returning *`,[
      postId,i.title,slug,i.content_type||'other',i.summary||'',i.body_markdown||'',i.posted_date||null,i.category||'',
      i.categories||[],i.tags||[],json(i.topics||[]),json(i.related_links||[]),i.related_ids||[],i.recommendation_ids||[],
      json(i.recommendation_links||[]),json(i.documents||[]),json(i.navigation_links||[]),json(i.type_data||{}),
      json(i.geo||{}),json(i.classification||{}),json(i.publication||{}),i.main_image_url||null,i.seo_title||'',i.seo_description||'',
      json(i.source||null),i.status||'draft',Boolean(i.is_trending),actor
    ])).rows[0]
  }
  async updatePost(id,p,actor){const allowed=new Set(['title','slug','content_type','summary','body_markdown','posted_date','category','categories','tags','topics','related_links','related_ids','recommendation_ids','recommendation_links','documents','navigation_links','type_data','geo','classification','publication','main_image_url','seo_title','seo_description','status','is_trending','deleted_at']);const patch={...p};const old=await this.getPost(id);if(!old)return null;if(patch.slug&&patch.slug!==old.slug){patch.slug=await this.#uniqueSlug(patch.slug,id);await this.q(`insert into redirects(from_slug,to_slug) values($1,$2) on conflict(from_slug) do update set to_slug=excluded.to_slug`,[old.slug,patch.slug])}const keys=Object.keys(patch).filter(k=>allowed.has(k));if(!keys.length)return old;await this.q(`insert into post_revisions(post_id,snapshot,actor_id) values($1,$2::jsonb,$3)`,[id,json(old),actor]);const vals=keys.map(k=>JSON_FIELDS.has(k)?json(patch[k]):patch[k]);const sets=keys.map((k,n)=>`${k}=$${n+2}${JSON_FIELDS.has(k)?'::jsonb':''}`).join(',');return(await this.q(`update posts set ${sets},updated_by=$${keys.length+2},updated_at=now(),published_at=case when status='published' and published_at is null then now() else published_at end where id=$1 returning *`,[id,...vals,actor])).rows[0]||null}
  async trashPost(id,a){return this.updatePost(id,{deleted_at:new Date().toISOString(),status:'trash'},a)}
  async restorePost(id,a){return this.updatePost(id,{deleted_at:null,status:'draft'},a)}
  async revisions(id){return(await this.q('select * from post_revisions where post_id=$1 order by created_at desc',[id])).rows}
  async promoteImport(id,actor){
    const imp=await this.getImport(id);if(!imp)return null;
    if(imp.promoted_post_id){const existing=await this.getPost(imp.promoted_post_id);if(existing)return existing}
    const post=await this.createPost({...imp.prepared_draft,status:'draft',source:{source_name:imp.source_name,source_id:imp.source_id,source_url:imp.source_url,source_slug:imp.source_slug,raw_import_id:imp.id}},actor);
    await this.updateImport(id,{review_status:'promoted',promoted_post_id:post.id,source_changed:false});
    return post;
  }

  async recordEvent(i){return(await this.q(`insert into analytics_events(visitor_id,event_type,post_id,meta) values($1,$2,$3,$4::jsonb) returning *`,[i.visitor_id||null,i.event_type,i.post_id||null,json(i.meta||{})])).rows[0]}
  async analyticsSummary(){const totals=(await this.q(`select event_type,count(*)::int n from analytics_events group by event_type`)).rows;const daily=(await this.q(`select created_at::date date,count(*)::int total from analytics_events where created_at>=current_date-interval '30 days' group by 1 order by 1`)).rows;const u=(await this.q(`select count(distinct visitor_id)::int n from analytics_events`)).rows[0].n;const mix=(await this.q(`select coalesce(p.content_type,'other') content_type,count(*)::int n from analytics_events a left join posts p on p.id=a.post_id where a.event_type='view' group by 1`)).rows;return{totals:Object.fromEntries(totals.map(x=>[x.event_type,x.n])),daily,unique_visitors:u,views_by_content_type:Object.fromEntries(mix.map(x=>[x.content_type,x.n]))}}

  async settings(){const rows=(await this.q('select key,value from site_settings')).rows;return Object.fromEntries(rows.map(r=>[r.key,r.value?.value??r.value]))}
  async updateSettings(p){for(const[k,v]of Object.entries(p))await this.q(`insert into site_settings(key,value) values($1,$2::jsonb) on conflict(key) do update set value=excluded.value,updated_at=now()`,[k,json({value:v})]);return this.settings()}
  async addMedia(i){return(await this.q(`insert into media(url,key,provider,media_kind,mime_type,size_bytes,title,alt_text,uploaded_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[i.url,i.key,i.provider||null,i.media_kind||null,i.mime_type,i.size_bytes,i.title||'',i.alt_text||'',i.uploaded_by||null])).rows[0]}
  async listMedia(){return(await this.q('select * from media order by created_at desc limit 500')).rows}
  async audit(a,action,entityType,entityId,meta={}){return(await this.q(`insert into audit_logs(actor_id,action,entity_type,entity_id,meta) values($1,$2,$3,$4,$5::jsonb) returning *`,[a,action,entityType,entityId,json(meta)])).rows[0]}
  async listAudit(){return(await this.q('select * from audit_logs order by created_at desc limit 500')).rows}
  async tags(){return(await this.q(`select t name,regexp_replace(lower(t),'[^a-z0-9]+','-','g') slug,count(*)::int count from posts,cross join unnest(tags)t where status='published' and deleted_at is null group by t order by count desc`)).rows}
  async categories(){return(await this.q(`select c name,regexp_replace(lower(c),'[^a-z0-9]+','-','g') slug,count(*)::int count from (select unnest(categories)c from posts where status='published' and deleted_at is null union all select category c from posts where status='published' and deleted_at is null and coalesce(category,'')<>'')s group by c order by count desc`)).rows.map(x=>({...x,title:x.name}))}
  async findRedirect(s){return(await this.q('select * from redirects where from_slug=$1',[s])).rows[0]||null}
}
