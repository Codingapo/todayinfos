import { config } from '../config.mjs';
import { hashKey, slugify } from './utils.mjs';
import { detectContentType, ruleDraftFromRecord, isIndexLikeRecord, contentQuality } from './content-rules.mjs';
import { normalizeClassification, normalizeGeo } from './global-content.mjs';
import { applyLearningHints, learningQualityBonus } from './import-learning.mjs';
import { discoverSourceLinks } from './source-profiles.mjs';
import { directFallbackSupports, fetchDirectSourceFallback, fetchDirectSourceRecord } from './direct-source-fallback.mjs';

const MAX_SOURCE_PAGES = 100;
const PAGE_SIZE = 100;

const endpointFor = ({ kind, tagSlug, query, url }) => {
  if (kind === 'tag') return `/tags/${encodeURIComponent(tagSlug || 'psychometric-test')}`;
  if (kind === 'search') return `/search?q=${encodeURIComponent(query || '')}`;
  if (kind === 'url') return `/extract?url=${encodeURIComponent(url || '')}`;
  const allowed = new Set(['pages','bursaries','articles','dailyupdate','dailyupdate/jobs']);
  return `/${allowed.has(kind) ? kind : 'pages'}`;
};

function extractRecords(payload) {
  const data = payload?.data;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.records)) return data.records;
  if (data && typeof data === 'object' && (data.id || data.title)) return [data];
  return [];
}

const includesYear = (record, year) => {
  if (!year) return true;
  const y = String(year).replace(/[^0-9]/g,'');
  if (!y) return true;
  return new RegExp(`\\b${y}\\b`).test(JSON.stringify(record));
};

const recordDate = (r={}) =>
  r.modifiedAt || r.updatedAt || r.publishedAt || r.posted_date || r.closingDate || r.openingDate || null;

async function fetchJson(url,{attempts=3}={}) {
  let lastError=null;
  for(let attempt=1;attempt<=attempts;attempt+=1){
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),30000);
    try{
      const res=await fetch(url,{
        headers:{accept:'application/json','user-agent':'TodayInfo-Control-Center/0.8.1'},
        signal:controller.signal
      });
      if(res.ok)return await res.json();
      const error=new Error(`Source API returned HTTP ${res.status}`);
      error.status=res.status;
      if(![408,425,429,500,502,503,504].includes(res.status))throw error;
      lastError=error;
    }catch(error){
      lastError=error;
      if(attempt>=attempts)break;
    }finally{clearTimeout(timer)}
    await new Promise(resolve=>setTimeout(resolve,Math.min(1500,250*attempt)));
  }
  throw lastError||new Error('Source API request failed');
}

export const sourceEndpointCandidates=kind=>{
  if(kind==='dailyupdate/jobs')return['/dailyupdate/jobs','/dailyupdate','/articles','/search?q=jobs'];
  if(kind==='bursaries')return['/bursaries','/search?q=bursary'];
  return[endpointFor({kind})];
};

async function fetchCollection(endpoint, maxPages) {
  const sep = endpoint.includes('?') ? '&' : '?';
  const makeUrl = page => `${config.sourceApiBase}${endpoint}${sep}page=${page}&limit=${PAGE_SIZE}`;

  const first = await fetchJson(makeUrl(1));
  const firstBatch = extractRecords(first);
  const pagination = first?.meta?.pagination || {};
  const declaredTotalPages = Number(pagination.totalPages || pagination.total_pages || 0);
  const wanted = Math.min(MAX_SOURCE_PAGES, Math.max(1, Number(maxPages || MAX_SOURCE_PAGES)));
  const totalPages = declaredTotalPages > 0 ? Math.min(wanted, declaredTotalPages) : wanted;
  const all = [...firstBatch];
  let pagesFetched = 1;

  if (declaredTotalPages > 0) {
    const remaining = [];
    for (let page=2; page<=totalPages; page+=1) remaining.push(page);
    for (let i=0; i<remaining.length; i+=4) {
      const chunk = remaining.slice(i,i+4);
      const payloads = await Promise.all(chunk.map(page => fetchJson(makeUrl(page)).catch(() => null)));
      payloads.forEach(payload => {
        if (!payload) return;
        pagesFetched += 1;
        all.push(...extractRecords(payload));
      });
    }
  } else {
    let hasNext = Boolean(pagination?.hasNext);
    for (let page=2; page<=wanted && hasNext; page+=1) {
      const payload = await fetchJson(makeUrl(page));
      const batch = extractRecords(payload);
      pagesFetched += 1;
      all.push(...batch);
      hasNext = Boolean(payload?.meta?.pagination?.hasNext) && batch.length > 0;
    }
  }

  return { records: all, pagesFetched };
}

async function expandTagRecords(records, tagSlug) {
  const needles = String(tagSlug || '').split('-').filter(Boolean);
  const urls = new Set();
  for (const record of records) {
    for (const link of record.links || []) {
      const hay = `${link.title || ''} ${link.url || ''}`.toLowerCase();
      if (
        needles.length &&
        needles.every(n => hay.includes(n)) &&
        /^https?:/i.test(link.url || '') &&
        !/\/tag\//i.test(link.url)
      ) urls.add(link.url);
    }
  }

  const expanded = [];
  for (const url of [...urls].slice(0, 30)) {
    try {
      const u = new URL(url);
      let payload;
      try {
        payload = await fetchJson(`${config.sourceApiBase}/extract?path=${encodeURIComponent(u.pathname + u.search)}`);
      } catch {
        payload = await fetchJson(`${config.sourceApiBase}/extract?url=${encodeURIComponent(url)}`);
      }
      expanded.push(...extractRecords(payload));
    } catch {
      // Keep the tag sync useful even if a single expansion fails.
    }
  }
  return expanded;
}


async function expandRelatedRecords(records,limit=100){
  const discovered=discoverSourceLinks(records).slice(0,Math.min(250,Math.max(1,Number(limit)||100)));
  const expanded=[];let fetched=0,failed=0;
  for(let i=0;i<discovered.length;i+=4){
    const chunk=discovered.slice(i,i+4);
    const payloads=await Promise.all(chunk.map(async item=>{
      try{
        const payload=await fetchJson(`${config.sourceApiBase}/extract?url=${encodeURIComponent(item.url)}`);
        fetched+=1;return extractRecords(payload);
      }catch{failed+=1;return []}
    }));
    for(const batch of payloads)expanded.push(...batch);
  }
  return{records:expanded,fetched,failed,discovered:discovered.length};
}

export async function fetchImports(options={}) {
  const endpoint = endpointFor(options);
  const isCollection = ['pages','bursaries','articles','dailyupdate','dailyupdate/jobs'].includes(options.kind);
  const maxPages = Math.min(MAX_SOURCE_PAGES, Math.max(1, Number(options.maxPages || MAX_SOURCE_PAGES)));
  let records = [];
  let pagesFetched = 1;

  if (isCollection) {
    const candidates=sourceEndpointCandidates(options.kind);
    let lastError=null,result=null,usedEndpoint=endpoint;
    for(const candidate of candidates){
      try{
        const current=await fetchCollection(candidate,maxPages);
        if(current.records.length||candidate===candidates.at(-1)){result=current;usedEndpoint=candidate;break}
      }catch(error){lastError=error}
    }
    if((!result||!result.records.length)&&directFallbackSupports(options.kind)){
      try{
        const direct=await fetchDirectSourceFallback(options.kind,{limit:Math.min(40,Math.max(10,maxPages))});
        if(direct.records.length){
          result={records:direct.records,pagesFetched:direct.stats.indexPagesOk||1};
          usedEndpoint=`direct:${direct.stats.source}`;
          options._directFallback=direct.stats;
          lastError=null;
        }
      }catch(error){lastError=lastError||error}
    }
    if(!result)throw lastError||new Error('Source collection could not be fetched');
    records=result.records;
    pagesFetched=result.pagesFetched;
    options._usedEndpoint=usedEndpoint;
  } else {
    try{
      const payload = await fetchJson(`${config.sourceApiBase}${endpoint}`);
      records = extractRecords(payload);
    }catch(error){
      if(options.kind==='url'&&options.url){
        const direct=await fetchDirectSourceRecord(options.url);
        records=[direct];
        options._usedEndpoint=`direct:${direct.sourceId}`;
        options._directFallback={directFallback:true,source:direct.sourceId,detailFetched:1,detailFailed:0};
      }else throw error;
    }
  }

  if (options.kind === 'tag' && options.expand !== false) {
    records.push(...await expandTagRecords(records, options.tagSlug || 'psychometric-test'));
  }

  let relatedPagesFetched=0,relatedPagesFailed=0,relatedLinksDiscovered=0;
  if(options.expandRelated){
    const expanded=await expandRelatedRecords(records,options.relatedLimit||100);
    relatedPagesFetched=expanded.fetched;relatedPagesFailed=expanded.failed;relatedLinksDiscovered=expanded.discovered;
    records.push(...expanded.records);
  }

  const rawRecords = records.length;
  const discoveredLinks=discoverSourceLinks(records);
  const fullUrls=new Set(records.map(r=>String(r.url||r.source?.canonicalUrl||r.source?.url||'').replace(/\/$/,'')).filter(Boolean));
  const seen = new Set();
  let duplicates = 0;
  let skippedIndexPages = 0;
  let skippedYear = 0;

  records = records.filter(record => {
    const key = record.url || record.id || `${record.sourceId || ''}:${record.slug || ''}:${record.title || ''}`;
    if (seen.has(key)) { duplicates += 1; return false; }
    seen.add(key);
    if (!includesYear(record, options.year)) { skippedYear += 1; return false; }
    if (isIndexLikeRecord(record)) { skippedIndexPages += 1; return false; }
    return true;
  });

  records.sort((a,b) => String(recordDate(b)||'').localeCompare(String(recordDate(a)||'')));

  const rows = records.map(record => {
    let prepared = ruleDraftFromRecord(record);
    const baseRow={
      source_key: hashKey(record.sourceId || 'source', record.id || record.url || record.slug || record.title),
      source_hash: hashKey(JSON.stringify(record)),
      source_name: record.sourceName || record.sourceId || 'TodayInfo source API',
      source_id: record.sourceId || null,
      source_url: record.url || record.source?.canonicalUrl || record.source?.url || null,
      source_slug: record.slug || null,
      source_payload: record
    };
    prepared.geo=normalizeGeo({
      country_code:options.country_code||record.country_code||record.countryCode||record.country||config.sourceDefaultCountry,
      country_name:record.country_name||record.countryName,
      region_name:options.region_name||record.region_name||record.region||record.province||record.state||(Array.isArray(record.provinces)&&record.provinces.length===1?record.provinces[0]:null),
      city:options.city||record.city,
      location:record.location
    });
    prepared=applyLearningHints({draft:prepared,row:baseRow,profile:options.learningProfile});
    prepared.classification=normalizeClassification({
      organisation:record.organization||record.organisation||record.company||record.provider,
      subcategory:record.subcategory,
      opportunity_type:record.opportunityType||prepared.content_type,
      education_level:record.educationLevel||record.education_level,
      fields_of_study:record.fieldsOfStudy||record.fields_of_study,
      job_type:record.jobType||record.job_type,
      work_mode:record.workMode||record.work_mode,
      eligibility_tags:Array.isArray(record.eligibility)?record.eligibility:[]
    });
    const quality = contentQuality(prepared);
    const bonus=learningQualityBonus(baseRow,options.learningProfile);
    const directFallback=Boolean(record.directFallback);
    return {
      ...baseRow,
      detected_type: prepared.content_type||detectContentType(record),
      prepared_draft: prepared,
      review_status: 'unreviewed',
      source_changed: false,
      quality_score: directFallback?Math.min(55,quality.score+bonus):Math.min(100,quality.score+bonus),
      quality_issues: directFallback?[...new Set([...(quality.issues||[]),'Direct website fallback — review and edit before publishing'])]:quality.issues,
      learning_bonus:bonus,
      source_record_date: recordDate(record)
    };
  });

  const discoveryRows=discoveredLinks
    .filter(item=>!fullUrls.has(String(item.url||'').replace(/\/$/,'')))
    .map(item=>{
      const contentType=item.suggested_type||'other';
      const title=String(item.title||'Discovered opportunity').replace(/\s+/g,' ').trim();
      const prepared_draft={
        title,slug:slugify(title),content_type:contentType,summary:'',body_markdown:'',posted_date:null,
        category:contentType==='bursary'||contentType==='scholarship'?'Bursaries':contentType==='internship'?'Internships':contentType==='learnership'?'Learnerships':'Jobs',
        categories:['South Africa'],tags:['South Africa','Discovered',contentType],
        topics:[],related_links:[],related_ids:[],recommendation_ids:[],recommendation_links:[],documents:[],navigation_links:[],
        type_data:{status_override:'unknown'},geo:normalizeGeo({country_code:config.sourceDefaultCountry}),
        classification:normalizeClassification({opportunity_type:contentType}),
        main_image_url:null,seo_title:title,seo_description:'',is_trending:false,status:'draft',
        discovery:{reason:item.reason,source_family:item.source_family,discovered_from:item.discovered_from,target_url:item.url}
      };
      return {
        source_key:`discovery:${hashKey(item.url)}`,
        source_hash:hashKey(item.url,title,item.discovered_from||''),
        source_name:`${item.source_family} discovery`,
        source_id:null,source_url:item.url,source_slug:slugify(title),
        source_payload:{...item,discovery:true},
        detected_type:contentType,prepared_draft,review_status:'unreviewed',source_changed:false,
        quality_score:10,quality_issues:['Discovered link — fetch the detail page before publishing'],learning_bonus:0,source_record_date:null
      };
    });


  return {
    rows:[...rows,...discoveryRows],
    stats: {
      pagesFetched,
      rawRecords,
      keptRecords: rows.length,
      discoveredDrafts: discoveryRows.length,
      relatedLinksDiscovered,
      relatedPagesFetched,
      relatedPagesFailed,
      duplicates,
      skippedIndexPages,
      skippedYear,
      pageSize: PAGE_SIZE,
      maxPages,
      usedEndpoint:options._usedEndpoint||endpoint,
      directFallbackUsed:Boolean(options._directFallback?.directFallback),
      directFallback:options._directFallback||null
    }
  };
}


async function probeUrl(url,{accept='application/json'}={}){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10000);
  try{
    const res=await fetch(url,{headers:{accept,'user-agent':'TodayInfo-Source-Health/0.8.2'},signal:controller.signal});
    return{url,ok:res.ok,status:res.status,content_type:res.headers.get('content-type')||null};
  }catch(error){return{url,ok:false,status:null,error:error.message}}
  finally{clearTimeout(timer)}
}

export async function probeLegacySources(){
  const checks=await Promise.all([
    probeUrl(`${config.sourceApiBase}/bursaries?page=1&limit=1`),
    probeUrl(`${config.sourceApiBase}/dailyupdate/jobs?page=1&limit=1`),
    probeUrl('https://www.zabursaries.co.za/',{accept:'text/html'}),
    probeUrl('https://dailyupdate.co.za/category/vacancies/',{accept:'text/html'})
  ]);
  return{
    checked_at:new Date().toISOString(),
    source_api_base:config.sourceApiBase,
    checks:[
      {id:'api-bursaries',label:'TodayInfo source API · Bursaries',...checks[0]},
      {id:'api-dailyupdate',label:'TodayInfo source API · DailyUpdate jobs',...checks[1]},
      {id:'web-zabursaries',label:'ZA Bursaries website',...checks[2]},
      {id:'web-dailyupdate',label:'DailyUpdate vacancies website',...checks[3]}
    ]
  };
}
