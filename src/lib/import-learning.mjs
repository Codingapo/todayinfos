import { readPublishedJson, savePublishedJson } from './r2.mjs';

export const IMPORT_LEARNING_KEY='system/import-learning.json';
export const IMPORT_LEARNING_SCHEMA='todayinfo.import-learning.v1';

const emptyProfile=()=>({
  schema:IMPORT_LEARNING_SCHEMA,updated_at:null,records_seen:0,
  sources:{},types:{},countries:{}
});

const hostname=value=>{
  try{return new URL(String(value||'')).hostname.toLowerCase().replace(/^www\./,'')}catch{return null}
};

const addCount=(obj,key,n=1)=>{if(!key)return;obj[key]=(obj[key]||0)+n};

export async function loadImportLearning(){
  try{
    const found=await readPublishedJson(IMPORT_LEARNING_KEY);
    const p=found?.payload;
    if(p?.schema===IMPORT_LEARNING_SCHEMA)return {...emptyProfile(),...p};
  }catch{}
  return emptyProfile();
}

export function learnIntoProfile(profile,rows=[]){
  const p={...emptyProfile(),...(profile||{})};
  p.sources={...(p.sources||{})};p.types={...(p.types||{})};p.countries={...(p.countries||{})};
  for(const row of rows){
    const draft=row.prepared_draft||row;
    const type=row.detected_type||draft.content_type||'other';
    const domain=hostname(row.source_url||draft.source?.source_url||draft.source_url);
    const country=draft.geo?.country_code||null;
    const score=Number(row.quality_score??draft.quality_score??0);
    p.records_seen=Number(p.records_seen||0)+1;
    p.types[type]||={count:0,score_total:0,score_80_plus:0};
    p.types[type].count+=1;p.types[type].score_total+=score;if(score>=80)p.types[type].score_80_plus+=1;
    if(country)addCount(p.countries,country);
    if(domain){
      p.sources[domain]||={count:0,score_total:0,score_80_plus:0,types:{},countries:{}};
      const s=p.sources[domain];s.count+=1;s.score_total+=score;if(score>=80)s.score_80_plus+=1;
      addCount(s.types,type);if(country)addCount(s.countries,country);
    }
  }
  for(const s of Object.values(p.sources)){
    s.average_quality=s.count?Math.round((s.score_total/s.count)*100)/100:0;
    const typeEntries=Object.entries(s.types||{}).sort((a,b)=>b[1]-a[1]);
    s.dominant_type=typeEntries[0]?.[0]||null;
    s.dominant_type_ratio=s.count?Math.round(((typeEntries[0]?.[1]||0)/s.count)*1000)/1000:0;
    const countryEntries=Object.entries(s.countries||{}).sort((a,b)=>b[1]-a[1]);
    s.dominant_country=countryEntries[0]?.[0]||null;
    s.dominant_country_ratio=s.count?Math.round(((countryEntries[0]?.[1]||0)/s.count)*1000)/1000:0;
  }
  for(const t of Object.values(p.types)){
    t.average_quality=t.count?Math.round((t.score_total/t.count)*100)/100:0;
    t.auto_publish_rate=t.count?Math.round((t.score_80_plus/t.count)*1000)/1000:0;
  }
  p.updated_at=new Date().toISOString();
  return p;
}

export async function learnFromImports(rows=[]){
  const current=await loadImportLearning();
  const next=learnIntoProfile(current,rows);
  try{await savePublishedJson({key:IMPORT_LEARNING_KEY,payload:next})}catch{}
  return next;
}

export function applyLearningHints({draft,row,profile}){
  if(!draft||!profile)return draft;
  const domain=hostname(row?.source_url||row?.source?.source_url||draft.source_url);
  const learned=domain?profile.sources?.[domain]:null;
  if(!learned||learned.count<3)return draft;
  const next={...draft,geo:{...(draft.geo||{})}};
  if(
    next.content_type==='other' &&
    learned.dominant_type &&
    learned.dominant_type!=='other' &&
    Number(learned.dominant_type_ratio||0)>=0.8
  ) next.content_type=learned.dominant_type;
  if(!next.geo.country_code&&learned.dominant_country&&Number(learned.dominant_country_ratio||0)>=0.8){
    next.geo.country_code=learned.dominant_country;
  }
  return next;
}

export function learningQualityBonus(row,profile){
  const domain=hostname(row?.source_url||row?.source?.source_url);
  const learned=domain?profile?.sources?.[domain]:null;
  if(!learned||learned.count<3)return 0;
  let bonus=0;
  if(Number(learned.average_quality||0)>=80)bonus+=2;
  if(Number(learned.average_quality||0)>=90)bonus+=1;
  if(Number(learned.score_80_plus||0)/Math.max(1,Number(learned.count||0))>=0.8)bonus+=2;
  return Math.min(5,bonus);
}

export function publicLearningSummary(profile){
  const sources=Object.entries(profile?.sources||{}).map(([domain,s])=>({
    domain,count:s.count||0,average_quality:s.average_quality||0,
    dominant_type:s.dominant_type||null,dominant_country:s.dominant_country||null
  })).sort((a,b)=>b.count-a.count).slice(0,100);
  return {
    schema:profile?.schema||IMPORT_LEARNING_SCHEMA,
    updated_at:profile?.updated_at||null,
    records_seen:Number(profile?.records_seen||0),
    source_count:Object.keys(profile?.sources||{}).length,
    sources,
    types:profile?.types||{},
    countries:profile?.countries||{}
  };
}
