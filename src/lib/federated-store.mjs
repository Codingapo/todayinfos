import { slugify } from './utils.mjs';
import { getPublishedIndexPost, listPublishedIndex } from './published-index.mjs';
import { rankTrending } from './ranking.mjs';

function availabilityError(error){
  const code=String(error?.code||'').toUpperCase();
  if(['ENOTFOUND','ECONNREFUSED','ECONNRESET','ETIMEDOUT','EHOSTUNREACH','ENETUNREACH','EAI_AGAIN','57P01','57P02','57P03','08000','08001','08003','08004','08006','08007','08P01'].includes(code))return true;
  const msg=String(error?.message||'').toLowerCase();
  return /getaddrinfo|connection refused|connection terminated|timeout|network|enetunreach|socket|could not connect|server closed the connection/.test(msg);
}

const dedupeKey=row=>row?.id||`${row?.geo?.country_code||''}|${row?.slug||''}`;

export class FederatedStore {
  constructor({primary,readers=[],fallback}){
    this.primary=primary;
    this.readers=[primary,...readers].filter(Boolean);
    this.fallback=fallback;
  }

  async #primary(method,args=[]){
    if(!this.primary?.[method])throw new Error(`Primary store does not support ${method}`);
    return this.primary[method](...args);
  }

  async #publicRead(method,args=[],fallbackMethod=method){
    const settled=await Promise.allSettled(this.readers.map(store=>store[method](...args)));
    const successes=settled.filter(x=>x.status==='fulfilled');
    if(successes.length)return {successes,failed:settled.length-successes.length};
    if(this.fallback?.[fallbackMethod])return {fallback:await this.fallback[fallbackMethod](...args),failed:settled.length};
    const first=settled.find(x=>x.status==='rejected');throw first?.reason||new Error('All data sources unavailable');
  }

  async listPosts(filters={}){
    const result=await this.#publicRead('listPosts',[filters]);
    if(result.fallback){
      const r2=await listPublishedIndex(filters).catch(()=>[]);
      const map=new Map();
      for(const row of [...r2,...(result.fallback||[])]){const key=dedupeKey(row);const old=map.get(key);if(!old||String(row.updated_at||'')>String(old.updated_at||''))map.set(key,row)}
      const rows=[...map.values()].sort((a,b)=>String(b.published_at||b.posted_date||b.updated_at).localeCompare(String(a.published_at||a.posted_date||a.updated_at)));
      this.fallback.cachePosts(rows);return rows;
    }
    const map=new Map();
    for(const r of result.successes)for(const row of r.value||[]){
      const key=dedupeKey(row);const existing=map.get(key);
      if(!existing||String(row.updated_at||'')>String(existing.updated_at||''))map.set(key,row);
    }
    if(result.failed>0){
      const local=await this.fallback.listPosts(filters).catch(()=>[]);
      const r2=await listPublishedIndex(filters).catch(()=>[]);
      for(const row of [...r2,...local]){
        const key=dedupeKey(row);const existing=map.get(key);
        if(!existing||String(row.updated_at||'')>String(existing.updated_at||''))map.set(key,row);
      }
    }
    const rows=[...map.values()].sort((a,b)=>String(b.published_at||b.posted_date||b.updated_at).localeCompare(String(a.published_at||a.posted_date||a.updated_at)));
    this.fallback?.cachePosts(rows);
    return rows;
  }

  async trendingPosts(filters={}){
    const settled=await Promise.allSettled(this.readers.map(store=>store.trendingPosts(filters)));
    const successes=settled.filter(x=>x.status==='fulfilled');
    if(!successes.length){
      const local=await this.fallback.trendingPosts(filters);
      const r2=await listPublishedIndex(filters).catch(()=>[]);
      const merged=new Map();
      for(const row of [...r2,...local])merged.set(dedupeKey(row),row);
      return rankTrending([...merged.values()],{});
    }
    const map=new Map();
    for(const result of successes)for(const row of result.value||[]){
      const key=dedupeKey(row);const existing=map.get(key);
      if(!existing||Number(row.trending_score||0)>Number(existing.trending_score||0))map.set(key,row);
    }
    if(settled.some(x=>x.status==='rejected')){
      const local=await this.fallback.trendingPosts(filters).catch(()=>[]);
      const r2=rankTrending(await listPublishedIndex(filters).catch(()=>[]),{});
      for(const row of [...r2,...local]){
        const key=dedupeKey(row);const existing=map.get(key);
        if(!existing||Number(row.trending_score||0)>Number(existing.trending_score||0))map.set(key,row);
      }
    }
    const rows=[...map.values()].sort((a,b)=>Number(b.trending_score||0)-Number(a.trending_score||0));
    this.fallback.cachePosts(rows);return rows;
  }

  async visitorEvents(visitorId,limit=200){
    const settled=await Promise.allSettled(this.readers.map(store=>store.visitorEvents(visitorId,limit)));
    const successes=settled.filter(x=>x.status==='fulfilled');
    if(!successes.length)return this.fallback.visitorEvents(visitorId,limit);
    const map=new Map();
    for(const result of successes)for(const event of result.value||[])map.set(event.id||`${event.created_at}|${event.event_type}|${event.post_id||''}`,event);
    return [...map.values()].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,limit);
  }

  async getPost(id){
    const result=await this.#publicRead('getPost',[id]);
    if(result.fallback){
      const r2=await getPublishedIndexPost({id}).catch(()=>null);
      const row=r2||result.fallback;if(row)this.fallback?.cachePost(row);return row;
    }
    let row=result.successes.map(x=>x.value).find(Boolean)||null;
    if(!row&&result.failed>0)row=await getPublishedIndexPost({id}).catch(()=>null)||await this.fallback.getPost(id);
    if(row)this.fallback?.cachePost(row);
    return row;
  }

  async getPostBySlug(slug){
    const result=await this.#publicRead('getPostBySlug',[slug]);
    if(result.fallback){
      const r2=await getPublishedIndexPost({slug}).catch(()=>null);
      const row=r2||result.fallback;if(row)this.fallback?.cachePost(row);return row;
    }
    let row=result.successes.map(x=>x.value).find(Boolean)||null;
    if(!row&&result.failed>0)row=await getPublishedIndexPost({slug}).catch(()=>null)||await this.fallback.getPostBySlug(slug);
    if(row)this.fallback?.cachePost(row);
    return row;
  }

  async createPost(input,actor){
    try{
      const row=await this.#primary('createPost',[input,actor]);this.fallback?.cachePost(row);return row;
    }catch(error){
      if(!availabilityError(error))throw error;
      const local=await this.fallback.createPost(input,actor);
      this.fallback.enqueueDatabaseOperation('createPost',[local,actor]);
      return {...local,_database_fallback:true};
    }
  }

  async updatePost(id,patch,actor){
    try{
      const row=await this.#primary('updatePost',[id,patch,actor]);if(row)this.fallback?.cachePost(row);return row;
    }catch(error){
      if(!availabilityError(error))throw error;
      const local=await this.fallback.updatePost(id,patch,actor);
      if(!local)throw error;
      this.fallback.enqueueDatabaseOperation('updatePost',[id,patch,actor]);
      return {...local,_database_fallback:true};
    }
  }

  async trashPost(id,actor){
    try{const row=await this.#primary('trashPost',[id,actor]);if(row)this.fallback?.cachePost(row);return row}
    catch(error){if(!availabilityError(error))throw error;const local=await this.fallback.trashPost(id,actor);if(!local)throw error;this.fallback.enqueueDatabaseOperation('trashPost',[id,actor]);return {...local,_database_fallback:true}}
  }

  async restorePost(id,actor){
    try{const row=await this.#primary('restorePost',[id,actor]);if(row)this.fallback?.cachePost(row);return row}
    catch(error){if(!availabilityError(error))throw error;const local=await this.fallback.restorePost(id,actor);if(!local)throw error;this.fallback.enqueueDatabaseOperation('restorePost',[id,actor]);return {...local,_database_fallback:true}}
  }

  async recordEvent(input){
    try{return await this.#primary('recordEvent',[input])}
    catch(error){if(!availabilityError(error))throw error;const local=await this.fallback.recordEvent(input);this.fallback.enqueueDatabaseOperation('recordEvent',[input]);return local}
  }

  async settings(){
    try{const value=await this.#primary('settings');await this.fallback.updateSettings(value);return value}
    catch(error){if(!availabilityError(error))throw error;return this.fallback.settings()}
  }
  async updateSettings(patch){
    try{const value=await this.#primary('updateSettings',[patch]);await this.fallback.updateSettings(value);return value}
    catch(error){if(!availabilityError(error))throw error;const local=await this.fallback.updateSettings(patch);this.fallback.enqueueDatabaseOperation('updateSettings',[patch]);return local}
  }
  async addMedia(input){
    try{return await this.#primary('addMedia',[input])}
    catch(error){if(!availabilityError(error))throw error;const local=await this.fallback.addMedia(input);this.fallback.enqueueDatabaseOperation('addMedia',[input]);return local}
  }
  async audit(actor,action,type,id,meta={}){
    try{return await this.#primary('audit',[actor,action,type,id,meta])}
    catch(error){if(!availabilityError(error))throw error;const local=await this.fallback.audit(actor,action,type,id,meta);this.fallback.enqueueDatabaseOperation('audit',[actor,action,type,id,meta]);return local}
  }

  async tags(){
    const rows=await this.listPosts({status:'published'});const count={};
    for(const p of rows)for(const tag of p.tags||[])count[tag]=(count[tag]||0)+1;
    return Object.entries(count).map(([name,n])=>({name,slug:slugify(name),count:n})).sort((a,b)=>b.count-a.count);
  }
  async categories(){
    const rows=await this.listPosts({status:'published'});const count={};
    for(const p of rows){for(const c of p.categories||[])count[c]=(count[c]||0)+1;if(p.category)count[p.category]=(count[p.category]||0)+1}
    return Object.entries(count).map(([name,n])=>({name,title:name,slug:slugify(name),count:n})).sort((a,b)=>b.count-a.count);
  }

  async findRedirect(slug){
    const settled=await Promise.allSettled(this.readers.map(store=>store.findRedirect(slug)));
    return settled.filter(x=>x.status==='fulfilled').map(x=>x.value).find(Boolean)||null;
  }

  async analyticsSummary(){
    try{return await this.#primary('analyticsSummary')}
    catch(error){if(!availabilityError(error))throw error;return this.fallback.analyticsSummary()}
  }
  async dashboard(){
    try{return await this.#primary('dashboard')}
    catch(error){if(!availabilityError(error))throw error;return this.fallback.dashboard()}
  }

  // Administration stays anchored to the primary database.
  findUserByUsername(...a){return this.#primary('findUserByUsername',a)}
  getUser(...a){return this.#primary('getUser',a)}
  listUsers(...a){return this.#primary('listUsers',a)}
  teamPerformance(...a){return this.#primary('teamPerformance',a)}
  createUser(...a){return this.#primary('createUser',a)}
  updateUser(...a){return this.#primary('updateUser',a)}
  upsertImports(...a){return this.#primary('upsertImports',a)}
  listImports(...a){return this.#primary('listImports',a)}
  priorityImports(...a){return this.#primary('priorityImports',a)}
  getImport(...a){return this.#primary('getImport',a)}
  updateImport(...a){return this.#primary('updateImport',a)}
  promoteImport(...a){return this.#primary('promoteImport',a)}
  revisions(...a){return this.#primary('revisions',a)}
  listMedia(...a){return this.#primary('listMedia',a).catch(async error=>availabilityError(error)?this.fallback.listMedia():Promise.reject(error))}
  listAudit(...a){return this.#primary('listAudit',a).catch(async error=>availabilityError(error)?this.fallback.listAudit():Promise.reject(error))}

  async retryDatabaseQueue({limit=100}={}){
    const queue=this.fallback.databaseQueue().slice(0,limit);
    let synced=0,failed=0;
    for(const item of queue){
      try{
        const result=await this.#primary(item.method,item.args||[]);
        if(result?.id&&['createPost','updatePost','trashPost','restorePost'].includes(item.method))this.fallback.cachePost(result);
        this.fallback.removeQueuedOperation(item.id);synced+=1;
      }catch(error){
        failed+=1;
        this.fallback.updateQueuedOperation(item.id,{attempts:Number(item.attempts||0)+1,last_error:error.message,last_attempt_at:new Date().toISOString()});
        if(availabilityError(error))break;
      }
    }
    return{processed:synced+failed,synced,failed,remaining:this.fallback.databaseQueue().length};
  }

  health(){
    return {mode:'federated',databases:this.readers.length,pending_database_writes:this.fallback.databaseQueue().length};
  }
}

export { availabilityError };
