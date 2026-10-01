import { slugify } from './utils.mjs';

const COUNTRY_ALIASES = new Map([
  ['south africa','ZA'],['za','ZA'],['zaf','ZA'],
  ['united kingdom','GB'],['uk','GB'],['gb','GB'],['gbr','GB'],
  ['united states','US'],['united states of america','US'],['usa','US'],['us','US'],
  ['nigeria','NG'],['ng','NG'],['canada','CA'],['ca','CA'],['australia','AU'],['au','AU']
]);

const COUNTRY_NAMES = {
  ZA:'South Africa',GB:'United Kingdom',US:'United States',NG:'Nigeria',CA:'Canada',AU:'Australia'
};

export function normalizeCountryCode(value='') {
  const raw=String(value||'').trim();
  if(!raw)return null;
  const lower=raw.toLowerCase();
  if(COUNTRY_ALIASES.has(lower))return COUNTRY_ALIASES.get(lower);
  if(/^[a-z]{2}$/i.test(raw))return raw.toUpperCase();
  return raw.slice(0,3).toUpperCase();
}

export function normalizeGeo(input={}) {
  const country_code=normalizeCountryCode(input.country_code||input.countryCode||input.country||'');
  const country_name=String(input.country_name||input.countryName||COUNTRY_NAMES[country_code]||input.country||'').trim()||null;
  const region_code=String(input.region_code||input.regionCode||'').trim()||null;
  const region_name=String(input.region_name||input.regionName||input.region||input.province||input.state||'').trim()||null;
  const city=String(input.city||'').trim()||null;
  const location=String(input.location||input.location_text||'').trim()||null;
  return {country_code,country_name,region_code,region_name,city,location};
}

export function normalizeClassification(input={}) {
  const arr=v=>[...new Set((Array.isArray(v)?v:String(v||'').split(',')).map(x=>String(x).trim()).filter(Boolean))].slice(0,40);
  const salary=input.salary&&typeof input.salary==='object'?input.salary:{};
  return {
    subcategory:String(input.subcategory||'').trim()||null,
    opportunity_type:String(input.opportunity_type||input.opportunityType||'').trim()||null,
    organisation:String(input.organisation||input.organization||input.company||input.provider||'').trim()||null,
    education_level:arr(input.education_level||input.educationLevel),
    fields_of_study:arr(input.fields_of_study||input.fieldsOfStudy),
    job_type:String(input.job_type||input.jobType||'').trim()||null,
    work_mode:String(input.work_mode||input.workMode||'').trim()||null,
    salary:{
      min:Number.isFinite(Number(salary.min))?Number(salary.min):null,
      max:Number.isFinite(Number(salary.max))?Number(salary.max):null,
      currency:String(salary.currency||'').trim().toUpperCase()||null,
      period:String(salary.period||'').trim()||null,
      stipend:Boolean(salary.stipend)
    },
    eligibility_tags:arr(input.eligibility_tags||input.eligibilityTags),
    keywords:arr(input.keywords)
  };
}

export function rootForType(type='other') {
  return {
    bursary:'bursaries',scholarship:'scholarships',job:'jobs',internship:'internships',
    learnership:'learnerships',news:'news',announcement:'news',story:'stories',
    opportunity:'opportunities',other:'pages'
  }[type]||'pages';
}

export function seoPath(post={}) {
  const root=rootForType(post.content_type);
  const cc=normalizeCountryCode(post.geo?.country_code||post.geo?.country||'');
  const prefix=cc?`/${cc.toLowerCase()}`:'';
  if(['news','announcement'].includes(post.content_type)&&post.category){
    return `${prefix}/${root}/${slugify(post.category)}/${post.slug}`;
  }
  return `${prefix}/${root}/${post.slug}`;
}

export function compactLocation(geo={}) {
  const g=normalizeGeo(geo);
  return {
    country:{code:g.country_code,name:g.country_name},
    region:{code:g.region_code,name:g.region_name},
    city:g.city,
    location:g.location
  };
}

export function queryFilters(query={}) {
  const pick=(...keys)=>keys.map(k=>query[k]).find(v=>v!==undefined&&v!==null&&String(v).trim()!=='');
  return {
    q:pick('q','query','keywords'),
    country:normalizeCountryCode(pick('country','country_code')),
    region:pick('region','region_name','province','state'),
    city:pick('city'),
    category:pick('category'),
    subcategory:pick('subcategory'),
    organisation:pick('organisation','organization','company','provider'),
    opportunity_type:pick('opportunity_type'),
    education_level:pick('education_level'),
    field_of_study:pick('field_of_study','field'),
    job_type:pick('job_type'),
    work_mode:pick('work_mode','remote'),
    opportunity_status:pick('opportunity_status','status_filter'),
    closing_before:pick('closing_before'),
    closing_after:pick('closing_after'),
    posted_before:pick('posted_before'),
    posted_after:pick('posted_after')
  };
}

export function filterPost(post={},filters={}) {
  const g=normalizeGeo(post.geo||{});
  const c=normalizeClassification(post.classification||{});
  const td=post.type_data||{};
  const lc=v=>String(v||'').toLowerCase();
  if(filters.country&&g.country_code!==normalizeCountryCode(filters.country))return false;
  if(filters.region&&!lc(g.region_name).includes(lc(filters.region))&&!lc(g.region_code).includes(lc(filters.region)))return false;
  if(filters.city&&!lc(g.city).includes(lc(filters.city)))return false;
  if(filters.subcategory&&lc(c.subcategory)!==lc(filters.subcategory))return false;
  if(filters.organisation&&!lc(c.organisation||td.company||td.provider).includes(lc(filters.organisation)))return false;
  if(filters.opportunity_type&&lc(c.opportunity_type)!==lc(filters.opportunity_type))return false;
  if(filters.education_level&&!c.education_level.some(x=>lc(x)===lc(filters.education_level)))return false;
  if(filters.field_of_study&&!c.fields_of_study.some(x=>lc(x).includes(lc(filters.field_of_study))))return false;
  if(filters.job_type&&lc(c.job_type)!==lc(filters.job_type))return false;
  if(filters.work_mode&&lc(c.work_mode)!==lc(filters.work_mode))return false;
  const closing=td.closing_date?new Date(td.closing_date):null;
  if(filters.closing_before&&closing&&closing>new Date(filters.closing_before))return false;
  if(filters.closing_after&&closing&&closing<new Date(filters.closing_after))return false;
  const posted=post.posted_date?new Date(post.posted_date):null;
  if(filters.posted_before&&posted&&posted>new Date(filters.posted_before))return false;
  if(filters.posted_after&&posted&&posted<new Date(filters.posted_after))return false;
  return true;
}

export const GLOBAL_FILTERS=[
  'q','country','region','city','category','subcategory','organisation','opportunity_type',
  'education_level','field_of_study','job_type','work_mode','opportunity_status',
  'closing_before','closing_after','posted_before','posted_after'
];
