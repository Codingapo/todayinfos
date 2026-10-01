import { isSafeUrl } from './content-rules.mjs';

const clean=v=>String(v||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
const http=v=>{try{const u=new URL(String(v||''));return ['http:','https:'].includes(u.protocol)?u:null}catch{return null}};
const normalized=v=>{const u=http(v);if(!u)return'';u.hash='';return u.toString().replace(/\/$/,'')};
const sourceLike=(candidate,source)=>normalized(candidate)===normalized(source);

function privateHost(host=''){
  const h=String(host).toLowerCase();
  if(!h)return true;
  if(h==='localhost'||h.endsWith('.local')||h==='0.0.0.0'||h==='::1')return true;
  if(/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h))return true;
  const m=h.match(/^172\.(\d+)\./);if(m&&Number(m[1])>=16&&Number(m[1])<=31)return true;
  if(/^169\.254\./.test(h))return true;
  return false;
}

function publicHttpUrl(value){
  const u=http(value);return Boolean(u&&!privateHost(u.hostname));
}

function linkPools(row={}){
  const payload=row.source_payload||{};
  const draft=row.prepared_draft||{};
  const td=draft.type_data||{};
  const pools=[
    td.application_url,
    payload.applicationUrl,payload.application_url,payload.applyUrl,payload.apply_url,
    ...(Array.isArray(payload.applicationLinks)?payload.applicationLinks:[]),
    ...(Array.isArray(payload.links)?payload.links:[])
  ];
  return pools.map(x=>typeof x==='string'?{url:x,title:''}:{url:x?.url||x?.href||x?.link,title:x?.title||x?.text||x?.label||''});
}

function scoreCandidate(item={},sourceUrl=''){
  const url=String(item.url||'').trim(),title=clean(item.title);
  if(!publicHttpUrl(url)||sourceLike(url,sourceUrl))return -999;
  const hay=`${title} ${url}`.toLowerCase();
  let score=0;
  if(/apply|application|submit|career|vacanc|recruit|candidate|opportunit|portal|form/.test(hay))score+=18;
  if(/jobs?|intern|learnership|bursar|scholarship|funding|graduate/.test(hay))score+=8;
  if(/login|sign.?in|register|account/.test(hay))score+=3;
  if(/pdf|\.docx?|download|brochure|prospectus/.test(hay))score-=18;
  if(/facebook|instagram|twitter|x\.com|linkedin|youtube|whatsapp|privacy|terms|cookie|contact/.test(hay))score-=40;
  const src=http(sourceUrl),u=http(url);
  if(src&&u&&src.hostname!==u.hostname)score+=5;
  return score;
}

export function applicationCandidates(row={}){
  const sourceUrl=row.source_url||row.source_payload?.url||'';
  const seen=new Set();
  return linkPools(row)
    .map(x=>({...x,url:String(x.url||'').trim(),score:scoreCandidate(x,sourceUrl)}))
    .filter(x=>x.score>0&&x.url&&!seen.has(normalized(x.url))&&(seen.add(normalized(x.url))||true))
    .sort((a,b)=>b.score-a.score)
    .slice(0,12);
}

async function requestFinalUrl(url,method='HEAD'){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),12000);
  try{
    const res=await fetch(url,{
      method,redirect:'follow',signal:controller.signal,
      headers:{'user-agent':'TodayInfo-Application-Link-Checker/0.8',accept:'text/html,application/xhtml+xml,application/json;q=0.8,*/*;q=0.5'}
    });
    return{ok:res.ok,status:res.status,final_url:res.url||url,content_type:res.headers.get('content-type')||null};
  }finally{clearTimeout(timer)}
}

export async function verifyApplicationUrl(url,{sourceUrl=''}={}){
  if(!publicHttpUrl(url)||sourceLike(url,sourceUrl))return{verified:false,reason:'not-a-direct-public-url',original_url:url||null,final_url:null};
  let result;
  try{result=await requestFinalUrl(url,'HEAD')}
  catch{
    try{result=await requestFinalUrl(url,'GET')}
    catch(error){return{verified:false,reason:'unreachable',original_url:url,final_url:null,error:error.message}}
  }
  if(!result.ok&&[403,405].includes(result.status)){
    try{result=await requestFinalUrl(url,'GET')}catch{}
  }
  const final=result?.final_url||url;
  if(!publicHttpUrl(final)||sourceLike(final,sourceUrl))return{verified:false,reason:'redirected-to-source',original_url:url,final_url:final,status_code:result?.status||null};
  return{
    verified:Boolean(result?.ok||[401,403].includes(result?.status)),
    reason:result?.ok?'reachable':'reachable-but-restricted',
    original_url:url,final_url:final,status_code:result?.status||null,
    checked_at:new Date().toISOString(),content_type:result?.content_type||null
  };
}

const lines=v=>String(v||'').split(/\n+/).map(clean).filter(x=>x.length>=4);
const sentence=v=>clean(v).replace(/^[-•*\d.)\s]+/,'').replace(/[.;:]+$/,'').trim();

export function buildApplicationGuide(draft={},route={}){
  const td=draft.type_data||{};
  const rawSteps=[...lines(td.how_to_apply),...lines(td.application_process)];
  const unique=[];const seen=new Set();
  for(const raw of rawSteps){
    const x=sentence(raw);const k=x.toLowerCase();if(!x||seen.has(k))continue;seen.add(k);unique.push(x);
  }
  const docs=lines(td.supporting_documents||td.documents_required||'').map(sentence).slice(0,15);
  const steps=[];
  const add=x=>{const v=sentence(x);if(v&&!steps.some(s=>s.toLowerCase()===v.toLowerCase()))steps.push(v)};
  if(td.requirements||td.eligibility)add('Read the eligibility and requirements carefully before you start.');
  if(docs.length)add('Prepare the required supporting documents before opening the application.');
  unique.slice(0,7).forEach(add);
  if(route?.verified&&route.final_url)add('Open the verified official application page using the Apply button on TodayInfo.');
  add('Check every answer and attachment before submitting.');
  add('Save your confirmation, reference number or proof of submission if the application system provides one.');

  return{
    title:`How to apply for ${draft.title||'this opportunity'}`,
    summary:'A plain-English application guide built from the published application instructions. Always check the official application page for final requirements.',
    steps:steps.slice(0,10),
    supporting_documents:docs,
    requirements:clean(td.requirements||td.eligibility||''),
    official_application_url:route?.verified?route.final_url:null,
    verification:route||{verified:false,reason:'not-checked'},
    useful:steps.length>=4&&Boolean(route?.verified||unique.length>=2||docs.length)
  };
}

export async function enrichApplicationImport(row={}){
  const draft=structuredClone(row.prepared_draft||{});
  draft.type_data={...(draft.type_data||{})};
  const sourceUrl=row.source_url||row.source_payload?.url||'';
  let route={verified:false,reason:'no-direct-application-link',original_url:null,final_url:null};
  for(const candidate of applicationCandidates(row).slice(0,6)){
    const checked=await verifyApplicationUrl(candidate.url,{sourceUrl});
    if(checked.verified){route=checked;break}
    if(route.reason==='no-direct-application-link')route=checked;
  }
  if(route.verified){
    draft.type_data.application_url=route.final_url;
    draft.type_data.application_url_verified=true;
  }else{
    if(sourceLike(draft.type_data.application_url,sourceUrl))draft.type_data.application_url='';
    draft.type_data.application_url_verified=false;
  }
  draft.type_data.application_route=route;
  draft.type_data.application_guide=buildApplicationGuide(draft,route);
  return{draft,route,candidates:applicationCandidates(row)};
}

export function hasVerifiedDirectApplication(draft={}){
  const route=draft.type_data?.application_route;
  return Boolean(route?.verified&&isSafeUrl(route.final_url||draft.type_data?.application_url,{allowRelative:false}));
}
