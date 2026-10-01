import { slugify } from './utils.mjs';

const UA='TodayInfo-Direct-Source-Fallback/0.8.4';
const MAX_INDEX_BYTES=2_000_000;
const MAX_DETAIL_BYTES=1_500_000;

const decode=v=>String(v||'')
  .replace(/&nbsp;/gi,' ')
  .replace(/&amp;/gi,'&')
  .replace(/&quot;/gi,'"')
  .replace(/&#39;|&apos;/gi,"'")
  .replace(/&lt;/gi,'<')
  .replace(/&gt;/gi,'>')
  .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)||32))
  .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)||32));

const text=v=>decode(String(v||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();

const CONFIGS={
  bursaries:{
    id:'zabursaries',name:'ZA Bursaries',pageType:'bursary',
    hosts:['zabursaries.co.za','www.zabursaries.co.za'],
    indexes:[
      'https://www.zabursaries.co.za/',
      'https://www.zabursaries.co.za/?s=2027',
      'https://www.zabursaries.co.za/?s=bursary'
    ],
    useful:(title,url)=>{
      const hay=\`\${title} \${url}\`.toLowerCase();
      if(!/bursar|scholarship|funding/.test(hay))return false;
      if(/search results|list of all bursaries|bursaries closing in|privacy|contact|about us|sassa payment/.test(hay))return false;
      return true;
    }
  },
  'dailyupdate/jobs':{
    id:'dailyupdate',name:'DailyUpdate',pageType:'article',
    hosts:['dailyupdate.co.za','www.dailyupdate.co.za'],
    indexes:[
      'https://dailyupdate.co.za/',
      'https://dailyupdate.co.za/category/vacancies/',
      'https://dailyupdate.co.za/?s=vacancies',
      'https://dailyupdate.co.za/?s=jobs'
    ],
    useful:(title,url)=>{
      const hay=\`\${title} \${url}\`.toLowerCase();
      if(!/job|hiring|vacanc|career|intern|learnership|apprentice|graduate|programme|opportunit/.test(hay))return false;
      if(/privacy|contact|about|\/tag\/|\/author\/|login|register|\/page\/\d+/.test(hay))return false;
      return true;
    }
  }
};
CONFIGS.dailyupdate=CONFIGS['dailyupdate/jobs'];

const httpUrl=(value,base)=>{
  try{
    const u=new URL(String(value||''),base);
    if(!['http:','https:'].includes(u.protocol))return null;
    u.hash='';
    return u.toString();
  }catch{return null}
};

function hostAllowed(url,config){
  try{return config.hosts.includes(new URL(url).hostname.toLowerCase())}catch{return false}
}

async function fetchHtml(url,{maxBytes=MAX_DETAIL_BYTES}={}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),18000);
  try{
    const res=await fetch(url,{
      redirect:'follow',
      signal:controller.signal,
      headers:{accept:'text/html,application/xhtml+xml;q=0.9,*/*;q=0.3','user-agent':UA}
    });
    if(!res.ok)throw new Error(\`Direct source returned HTTP \${res.status}\`);
    const type=res.headers.get('content-type')||'';
    if(type&&!/html|xhtml|text\//i.test(type))throw new Error(\`Direct source returned unsupported content type: \${type}\`);
    const body=await res.text();
    return body.length>maxBytes?body.slice(0,maxBytes):body;
  }finally{clearTimeout(timer)}
}

function attr(html,name){
  const escaped=String(name).replace(/[.*+?^()|[\]\\]/g,'\\$&');
  const a=new RegExp(\`<meta[^>]+(?:name|property)=["']\${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>\`,'i').exec(html);
  if(a)return decode(a[1]);
  const b=new RegExp(\`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']\${escaped}["'][^>]*>\`,'i').exec(html);
  return b?decode(b[1]):'';
}

function linkRel(html,rel){
  const re=new RegExp(\`<link[^>]+rel=["'][^"']*\\b\${rel}\\b[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>\`,'i');
  const a=re.exec(html);
  if(a)return decode(a[1]);
  const b=new RegExp(\`<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*\\b\${rel}\\b[^"']*["'][^>]*>\`,'i').exec(html);
  return b?decode(b[1]):'';
}

export function parseDirectAnchors(html='',baseUrl=''){
  const out=[];const seen=new Set();
  const re=/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(String(html)))&&out.length<500){
    const url=httpUrl(decode(m[1]),baseUrl),title=text(m[2]);
    if(!url||!title||seen.has(url))continue;
    seen.add(url);out.push({title,url});
  }
  return out;
}

function configForUrl(url){
  for(const config of Object.values(CONFIGS))if(hostAllowed(url,config))return config;
  return null;
}

function usefulLinks(links,config,baseUrl){
  return links.filter(x=>hostAllowed(x.url,config)&&config.useful(x.title,x.url)&&x.url!==baseUrl);
}

function applicationLinks(links,sourceUrl){
  return links.filter(x=>{
    const hay=\`\${x.title} \${x.url}\`.toLowerCase();
    if(x.url===sourceUrl)return false;
    if(/privacy|contact|facebook|instagram|youtube|twitter|x\.com|whatsapp|terms|cookie/.test(hay))return false;
    return /apply|application|application form|career portal|vacanc|recruit|submit/.test(hay);
  }).slice(0,20);
}

export async function fetchDirectSourceRecord(url,{config:forcedConfig}={}){
  const config=forcedConfig||configForUrl(url);
  if(!config)throw new Error('Direct fallback only supports approved TodayInfo legacy source domains');
  if(!hostAllowed(url,config))throw new Error('Direct fallback URL is outside the approved source domain');

  const html=await fetchHtml(url);
  const canonical=httpUrl(linkRel(html,'canonical'),url)||url;
  const title=text((/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html)||[])[1])
    ||text((/<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)||[])[1])
    ||url;
  const description=attr(html,'description')||attr(html,'og:description');
  const image=httpUrl(attr(html,'og:image'),url);
  const publishedAt=attr(html,'article:published_time')||null;
  const anchors=parseDirectAnchors(html,canonical);
  const related=usefulLinks(anchors,config,canonical).slice(0,80);
  const apply=applicationLinks(anchors,canonical);

  return{
    id:\`direct:\${config.id}:\${slugify(canonical)}\`,
    sourceId:config.id,
    sourceName:config.name,
    title,
    slug:slugify(title),
    url:canonical,
    pageType:config.pageType,
    description,
    contentText:description,
    publishedAt,
    featuredImage:image,
    applicationLinks:apply,
    links:related,
    directFallback:true,
    directFallbackMode:'metadata-and-links-only'
  };
}

export async function fetchDirectSourceFallback(kind,{limit=30}={}){
  const config=CONFIGS[kind];
  if(!config)throw new Error(\`No direct fallback configured for \${kind}\`);
  const wanted=Math.max(1,Math.min(40,Number(limit)||30));
  const candidates=new Map();
  const indexResults=[];

  for(const indexUrl of config.indexes){
    try{
      const html=await fetchHtml(indexUrl,{maxBytes:MAX_INDEX_BYTES});
      const links=usefulLinks(parseDirectAnchors(html,indexUrl),config,indexUrl);
      for(const item of links)if(!candidates.has(item.url))candidates.set(item.url,item);
      indexResults.push({url:indexUrl,ok:true,links:links.length});
    }catch(error){indexResults.push({url:indexUrl,ok:false,error:error.message})}
  }

  const urls=[...candidates.keys()].slice(0,wanted);
  const records=[];let failed=0;
  for(let i=0;i<urls.length;i+=5){
    const chunk=urls.slice(i,i+5);
    const results=await Promise.all(chunk.map(url=>fetchDirectSourceRecord(url,{config}).catch(()=>null)));
    for(const record of results){if(record)records.push(record);else failed+=1}
  }

  return{
    records,
    stats:{
      directFallback:true,
      source:config.id,
      indexPagesTried:indexResults.length,
      indexPagesOk:indexResults.filter(x=>x.ok).length,
      discovered:candidates.size,
      detailFetched:records.length,
      detailFailed:failed,
      indexResults
    }
  };
}

export function directFallbackSupports(kind){
  return Boolean(CONFIGS[kind]);
}
