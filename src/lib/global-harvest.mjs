import { contentQuality } from './content-rules.mjs';
import { normalizeClassification, normalizeGeo } from './global-content.mjs';
import { hashKey, slugify } from './utils.mjs';
import { savePublishedJson } from './r2.mjs';

const UA='TodayInfo-Global-Harvester/0.6';
const DAY=86400000;
const htmlText=value=>String(value||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/\s+/g,' ').trim();
const safeUrl=value=>{try{const u=new URL(String(value||''));return ['http:','https:'].includes(u.protocol)?u.toString():''}catch{return''}};
const dateOnly=value=>{if(!value)return null;const d=new Date(value);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10)};
const recentEnough=(date,maxAgeDays)=>!date||Date.now()-new Date(date).getTime()<=Math.max(1,maxAgeDays)*DAY;
const uniq=arr=>[...new Set(arr.filter(Boolean))];

async function fetchJson(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),30000);
  try{
    const res=await fetch(url,{headers:{accept:'application/json','user-agent':UA},signal:controller.signal});
    if(!res.ok)throw new Error(`HTTP ${res.status} from ${new URL(url).hostname}`);
    return await res.json();
  }finally{clearTimeout(timer)}
}

function inferCountry(location=''){
  const text=String(location||'').toLowerCase();
  const known=[
    ['south africa','South Africa'],['kenya','Kenya'],['nigeria','Nigeria'],['ghana','Ghana'],['uganda','Uganda'],['tanzania','Tanzania'],
    ['zambia','Zambia'],['zimbabwe','Zimbabwe'],['botswana','Botswana'],['united kingdom','United Kingdom'],[' uk','United Kingdom'],
    ['united states','United States'],[' usa','United States'],['canada','Canada'],['australia','Australia'],['germany','Germany'],
    ['france','France'],['netherlands','Netherlands'],['ireland','Ireland'],['india','India'],['singapore','Singapore'],['new zealand','New Zealand'],
    ['united arab emirates','United Arab Emirates'],['uae','United Arab Emirates'],['brazil','Brazil'],['mexico','Mexico'],['spain','Spain'],
    ['italy','Italy'],['poland','Poland'],['sweden','Sweden'],['norway','Norway'],['denmark','Denmark'],['switzerland','Switzerland']
  ];
  return known.find(([needle])=>text.includes(needle))?.[1]||null;
}

function typeFor(title='',jobTypes=[]){
  const hay=`${title} ${(jobTypes||[]).join(' ')}`.toLowerCase();
  if(/\bintern(ship|ships|n)?\b|graduate intern/.test(hay))return'internship';
  if(/learnership|apprentice|trainee programme|trainee program/.test(hay))return'learnership';
  return'job';
}

function cleanTitle(title=''){
  return htmlText(title).replace(/^job title[:\s-]*/i,'').trim().slice(0,220);
}
function validRole(title,description){
  const t=String(title||'').trim();
  if(t.length<3)return false;
  if(/^(jobs?|careers?|apply|how apply|job title|your job description here|classic)$/i.test(t))return false;
  const text=`${t} ${description||''}`.toLowerCase();
  if(/lorem ipsum|sorry, no results were found|your job description here/.test(text))return false;
  return true;
}

function toImport({provider,id,title,company,location,description,postedDate,applicationUrl,sourceUrl,tags=[],jobTypes=[],salary={},remote=false,raw,maxAgeDays=60}){
  title=cleanTitle(title);description=htmlText(description);
  if(!validRole(title,description))return null;
  const posted=dateOnly(postedDate);
  if(posted&&!recentEnough(posted,maxAgeDays))return null;
  const contentType=typeFor(title,jobTypes);
  const country=inferCountry(location);
  const application=safeUrl(applicationUrl)||safeUrl(sourceUrl);
  const source=safeUrl(sourceUrl)||application;
  if(!source)return null;
  const body=description.slice(0,180000);
  const tagList=uniq([country,'Global',contentType==='job'?'Jobs':contentType==='internship'?'Internships':'Learnerships',...tags].map(x=>String(x||'').trim()).filter(Boolean)).slice(0,30);
  const typeData={
    company:String(company||'').trim(),
    location:String(location||'').trim(),
    closing_date:null,status_override:'open',
    requirements:'',
    how_to_apply:application?'Use the source/application link to read the employer instructions and submit your application.':'',
    application_url:application
  };
  const draft={
    title,slug:slugify(title),content_type:contentType,
    summary:body.slice(0,700),body_markdown:body,posted_date:posted,
    category:contentType==='internship'?'Internships':contentType==='learnership'?'Learnerships':'Jobs',
    categories:uniq(['Global',country].filter(Boolean)),tags:tagList,topics:[],related_links:[],related_ids:[],recommendation_ids:[],
    recommendation_links:[],documents:[],navigation_links:[],type_data:typeData,
    geo:normalizeGeo({country,location}),
    classification:normalizeClassification({
      organisation:company,opportunity_type:contentType,job_type:(jobTypes||[]).join(', '),
      work_mode:remote||/remote/i.test(location||'')?'remote':null,
      salary
    }),
    main_image_url:null,seo_title:title,seo_description:body.slice(0,1000),is_trending:false,status:'draft'
  };
  const quality=contentQuality(draft);
  const sourceKey=`harvest:${provider}:${id||hashKey(source,title,company)}`;
  const sourceHash=hashKey(JSON.stringify({title,company,location,posted,source,application,body:body.slice(0,5000)}));
  return {
    source_key:sourceKey,source_hash:sourceHash,source_name:provider,source_id:String(id||''),source_url:source,source_slug:slugify(title),
    source_payload:raw||{},detected_type:contentType,prepared_draft:draft,review_status:'unreviewed',source_changed:false,
    quality_score:quality.score,quality_issues:quality.issues,source_record_date:posted
  };
}

async function jobicy({maxAgeDays}){
  const data=await fetchJson('https://jobicy.com/api/v2/remote-jobs?count=200');
  return (data.jobs||[]).map(j=>toImport({
    provider:'Jobicy',id:j.id,title:j.jobTitle,company:j.companyName,location:j.jobGeo,description:j.jobDescription||j.jobExcerpt,
    postedDate:j.pubDate||j.jobPosted||j.date,applicationUrl:j.url,sourceUrl:j.url,tags:[...(j.jobIndustry||[]),...(j.jobType||[])],
    jobTypes:j.jobType||[],remote:true,raw:j,maxAgeDays
  })).filter(Boolean);
}

async function remoteOk({maxAgeDays}){
  const data=await fetchJson('https://remoteok.com/api');
  return (Array.isArray(data)?data.slice(1):[]).map(j=>toImport({
    provider:'Remote OK',id:j.id||j.slug,title:j.position,company:j.company,location:j.location||'Remote',description:j.description,
    postedDate:j.date||j.epoch,applicationUrl:j.apply_url||j.url,sourceUrl:j.url||j.apply_url,tags:j.tags||[],jobTypes:j.tags||[],
    salary:{min:j.salary_min,max:j.salary_max,currency:null},remote:true,raw:j,maxAgeDays
  })).filter(Boolean);
}

async function arbeitnow({target,maxAgeDays}){
  const rows=[];let page=1;
  while(rows.length<target&&page<=100){
    const data=await fetchJson(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
    const batch=(data.data||[]).map(j=>toImport({
      provider:'Arbeitnow',id:j.slug||j.url,title:j.title,company:j.company_name,location:j.location,description:j.description,
      postedDate:j.created_at,applicationUrl:j.url,sourceUrl:j.url,tags:j.tags||[],jobTypes:[...(Array.isArray(j.job_types)?j.job_types:[j.job_types].filter(Boolean)),...(j.tags||[])],
      remote:Boolean(j.remote),raw:j,maxAgeDays
    })).filter(Boolean);
    rows.push(...batch);
    const next=data.links?.next||data.meta?.next_page_url;
    if(!next||(data.data||[]).length===0)break;
    page+=1;
  }
  return rows.slice(0,target);
}

async function leverSite(site,{maxAgeDays,target}){
  const rows=[];let skip=0;const limit=100;
  while(rows.length<target&&skip<10000){
    const batch=await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(site)}?mode=json&skip=${skip}&limit=${limit}`);
    if(!Array.isArray(batch)||!batch.length)break;
    for(const j of batch){
      rows.push(toImport({
        provider:`Lever · ${site}`,id:j.id,title:j.text,company:site,location:j.categories?.location||'',description:j.descriptionPlain||j.description,
        postedDate:j.createdAt,applicationUrl:j.applyUrl,sourceUrl:j.hostedUrl||j.applyUrl,tags:[j.categories?.team,j.categories?.department,j.categories?.commitment],
        jobTypes:[j.categories?.commitment],remote:/remote/i.test(j.workplaceType||j.categories?.location||''),raw:j,maxAgeDays
      }));
    }
    if(batch.length<limit)break;skip+=limit;
  }
  return rows.filter(Boolean).slice(0,target);
}

async function ashbyBoard(board,{maxAgeDays}){
  const data=await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(board)}?includeCompensation=true`);
  return (data.jobs||[]).filter(j=>j.isListed!==false).map(j=>toImport({
    provider:`Ashby · ${board}`,id:j.jobUrl||j.applyUrl,title:j.title,company:board,location:j.location||j.address?.postalAddress?.addressCountry||'',
    description:j.descriptionPlain||j.descriptionHtml,postedDate:j.publishedAt,applicationUrl:j.applyUrl,sourceUrl:j.jobUrl||j.applyUrl,
    tags:[j.department,j.team,j.employmentType,j.workplaceType],jobTypes:[j.employmentType],remote:Boolean(j.isRemote),
    salary:j.compensation?.summaryComponents?.find(x=>x.compensationType==='Salary')?{
      min:j.compensation.summaryComponents.find(x=>x.compensationType==='Salary').minValue,
      max:j.compensation.summaryComponents.find(x=>x.compensationType==='Salary').maxValue,
      currency:j.compensation.summaryComponents.find(x=>x.compensationType==='Salary').currencyCode
    }:{},raw:j,maxAgeDays
  })).filter(Boolean);
}

async function snapshot(provider,rows){
  const payload={schema:'todayinfo.harvest.v1',provider,generated_at:new Date().toISOString(),count:rows.length,records:rows};
  try{return await savePublishedJson({key:`harvest/snapshots/${slugify(provider)}.json`,payload})}catch(error){return{sync_status:'pending',last_error:error.message}}
}

export const GLOBAL_HARVEST_PROVIDERS=[
  {id:'arbeitnow',label:'Arbeitnow Europe',kind:'public_api',attribution:true},
  {id:'jobicy',label:'Jobicy Remote Jobs',kind:'public_api',attribution:true},
  {id:'remoteok',label:'Remote OK',kind:'public_api',attribution:true},
  {id:'lever',label:'Lever public job boards',kind:'board_api',requires_sites:true},
  {id:'ashby',label:'Ashby public job boards',kind:'board_api',requires_sites:true}
];

export async function harvestGlobalJobs(options={}){
  const target=Math.min(5000,Math.max(1,Number(options.target||1000)));
  const maxAgeDays=Math.min(120,Math.max(1,Number(options.maxAgeDays||60)));
  const providers=Array.isArray(options.providers)&&options.providers.length?options.providers:['arbeitnow','jobicy'];
  const rows=[];const stats={target,maxAgeDays,providers:{},errors:[]};

  for(const provider of providers){
    if(rows.length>=target)break;
    try{
      const remaining=target-rows.length;let found=[];
      if(provider==='arbeitnow')found=await arbeitnow({target:remaining,maxAgeDays});
      else if(provider==='jobicy')found=await jobicy({maxAgeDays});
      else if(provider==='remoteok')found=await remoteOk({maxAgeDays});
      else if(provider==='lever'){
        for(const site of options.leverSites||[]){if(rows.length+found.length>=target)break;found.push(...await leverSite(site,{target:target-rows.length-found.length,maxAgeDays}))}
      }else if(provider==='ashby'){
        for(const board of options.ashbyBoards||[]){if(rows.length+found.length>=target)break;found.push(...await ashbyBoard(board,{maxAgeDays}))}
      }
      const seen=new Set(rows.map(x=>x.source_key));const unique=found.filter(x=>!seen.has(x.source_key));
      rows.push(...unique.slice(0,target-rows.length));
      const snap=await snapshot(provider,unique);
      stats.providers[provider]={fetched:found.length,accepted:unique.length,snapshot:snap.sync_status||snap.provider||'saved'};
    }catch(error){
      stats.providers[provider]={fetched:0,accepted:0,error:error.message};stats.errors.push({provider,error:error.message});
    }
  }

  stats.accepted=rows.length;
  stats.internships=rows.filter(x=>x.detected_type==='internship').length;
  stats.jobs=rows.filter(x=>x.detected_type==='job').length;
  stats.learnerships=rows.filter(x=>x.detected_type==='learnership').length;
  return{rows,stats};
}
