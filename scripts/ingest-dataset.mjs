import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeCountryCode } from '../src/lib/global-content.mjs';

const args=process.argv.slice(2);
const valueOf=name=>{
  const i=args.indexOf(name);return i>=0?args[i+1]:null;
};
const has=name=>args.includes(name);

const inputPath=valueOf('--file')||args.find(x=>!x.startsWith('--'));
if(!inputPath){
  console.error('Usage: node scripts/ingest-dataset.mjs --file /path/to/dataset.json [--publish] [--dry-run] [--type job] [--country ZA]');
  process.exit(1);
}

const api=(process.env.TODAYINFO_API_ORIGIN||process.env.PUBLIC_API_ORIGIN||'http://127.0.0.1:3009').replace(/\/$/,'');
const key=process.env.TODAYINFO_INGEST_KEY||'';
const publish=has('--publish');
const dryRun=has('--dry-run');
const verifyApplications=has('--verify-applications')||publish;
const typeFilter=valueOf('--type');
const countryFilter=valueOf('--country');
const limitRaw=Number(valueOf('--limit')||0);
const delayMs=Math.max(0,Number(valueOf('--delay-ms')||150));

if(!dryRun&&!key){
  console.error('TODAYINFO_INGEST_KEY is missing. Add it to the VPS .env or use --dry-run.');
  process.exit(1);
}

const BATCH_LIMITS={job:50,internship:50,learnership:50,opportunity:50,bursary:100,scholarship:100};
const GLOBAL_NAMES=new Set(['worldwide','global','remote','multiple countries','international']);

function countryNameOf(record={}){
  const td=record.type_data||{},geo=record.geo||{};
  return String(
    geo.country_name||record.country_name||td.country||
    (record.categories||[]).find(x=>!['africa','jobs','bursaries','internships','learnerships','scholarships','worldwide'].includes(String(x).toLowerCase()))||
    ((record.categories||[]).some(x=>String(x).toLowerCase()==='worldwide')?'Worldwide':'')
  ).trim()||null;
}

function countryCodeOf(record,countryName){
  const geo=record.geo||{};
  const explicit=record.country_code||geo.country_code;
  if(explicit)return normalizeCountryCode(explicit);
  if(!countryName||GLOBAL_NAMES.has(countryName.toLowerCase()))return null;
  const code=normalizeCountryCode(countryName);
  return code&&code.length===2?code:null;
}

function sourceNameOf(record={}){
  return record.source?.source_name||record.source?.source_title||'TodayInfo Dataset Ingest';
}

function groupKey({type,countryCode,countryName}){
  return [type,countryCode||'',countryName||''].join('|');
}

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}

const raw=JSON.parse(await fs.readFile(path.resolve(inputPath),'utf8'));
let records=Array.isArray(raw)?raw:(Array.isArray(raw.records)?raw.records:[]);
if(!records.length){
  console.error('No records found. Expected a JSON array or an object with a records array.');
  process.exit(1);
}

const unsupported=[];
records=records.filter(record=>{
  const type=String(record.content_type||'').toLowerCase();
  if(!BATCH_LIMITS[type]){unsupported.push({id:record.id,title:record.title,type});return false}
  if(typeFilter&&type!==typeFilter)return false;
  const countryName=countryNameOf(record);
  const countryCode=countryCodeOf(record,countryName);
  if(countryFilter){
    const wanted=String(countryFilter).toUpperCase();
    if(countryCode!==wanted&&String(countryName||'').toUpperCase()!==wanted)return false;
  }
  return true;
});
if(limitRaw>0)records=records.slice(0,limitRaw);

const groups=new Map();
for(const record of records){
  const type=String(record.content_type).toLowerCase();
  const countryName=countryNameOf(record);
  const countryCode=countryCodeOf(record,countryName);
  const keyName=groupKey({type,countryCode,countryName});
  if(!groups.has(keyName))groups.set(keyName,{type,countryCode,countryName,records:[]});
  groups.get(keyName).records.push(record);
}

const batches=[];
for(const group of groups.values()){
  const max=BATCH_LIMITS[group.type]||50;
  for(let i=0;i<group.records.length;i+=max){
    batches.push({...group,items:group.records.slice(i,i+max),batch:i/max+1});
  }
}

console.log(JSON.stringify({
  dataset:raw.dataset_title||path.basename(inputPath),
  total_file_records:Array.isArray(raw.records)?raw.records.length:raw.length,
  selected_records:records.length,
  unsupported:unsupported.length,
  groups:groups.size,
  batches:batches.length,
  publish,
  verify_applications:verifyApplications,
  endpoint:`${api}/internal/ingest/v1/batch`,
  mode:dryRun?'dry-run':'send'
},null,2));

if(dryRun)process.exit(0);

let totals={received:0,created:0,updated:0,published:0,drafts:0,failed:0};
let batchNo=0;

for(const batch of batches){
  batchNo++;
  const sourceNames=[...new Set(batch.items.map(sourceNameOf).filter(Boolean))];
  const body={
    type:batch.type,
    ...(batch.countryCode?{country_code:batch.countryCode}:{}),
    ...(batch.countryName?{country_name:batch.countryName}:{}),
    source_name:sourceNames.length===1?sourceNames[0]:(raw.dataset_title||'TodayInfo Dataset Ingest'),
    publish,
    verify_applications:verifyApplications,
    items:batch.items
  };

  const res=await fetch(`${api}/internal/ingest/v1/batch`,{
    method:'POST',
    headers:{
      'content-type':'application/json',
      'accept':'application/json',
      'x-todayinfo-ingest-key':key
    },
    body:JSON.stringify(body)
  });

  const payload=await res.json().catch(()=>({}));
  if(!res.ok){
    console.error(`Batch ${batchNo}/${batches.length} failed: HTTP ${res.status}`,payload);
    totals.failed+=batch.items.length;
    await sleep(delayMs);
    continue;
  }

  const d=payload.data||{};
  for(const k of Object.keys(totals))totals[k]+=Number(d[k]||0);
  console.log(`[${batchNo}/${batches.length}] ${batch.type} ${batch.countryCode||batch.countryName||'GLOBAL'}: received=${d.received||0} created=${d.created||0} updated=${d.updated||0} published=${d.published||0} drafts=${d.drafts||0} failed=${d.failed||0}`);
  await sleep(delayMs);
}

console.log('\nIngest complete');
console.log(JSON.stringify(totals,null,2));
if(unsupported.length)console.log(`Skipped unsupported records: ${unsupported.length}`);
