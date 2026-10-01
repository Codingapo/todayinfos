import { slugify } from './utils.mjs';

const strip=v=>String(v||'')
  .replace(/<script[\s\S]*?<\/script>/gi,' ')
  .replace(/<style[\s\S]*?<\/style>/gi,' ')
  .replace(/<[^>]+>/g,' ')
  .replace(/&nbsp;/gi,' ').replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'")
  .replace(/\s+/g,' ').trim();

const words=(v,max=24)=>{const a=strip(v).split(/\s+/).filter(Boolean);return a.slice(0,max).join(' ')+(a.length>max?'…':'')};
const unique=arr=>[...new Set(arr.filter(Boolean))];
const splitSentences=text=>strip(text).split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map(x=>x.trim()).filter(x=>x.length>=25);

const replacements=[
  [/\bcommenced\b/gi,'started'],[/\bapproximately\b/gi,'about'],[/\butilise\b/gi,'use'],
  [/\bpersons\b/gi,'people'],[/\bprior to\b/gi,'before'],[/\bsubsequent to\b/gi,'after'],
  [/\bin order to\b/gi,'to'],[/\bwith regard to\b/gi,'about'],[/\bhas announced that\b/gi,'announced'],
  [/\bmembers of the public\b/gi,'the public'],[/\bprospective applicants\b/gi,'applicants']
];

export function simplifyPhrase(value,maxWords=26){
  let out=strip(value);
  for(const [pattern,replacement] of replacements)out=out.replace(pattern,replacement);
  return words(out,maxWords);
}

function audienceFor(text=''){
  const s=String(text).toLowerCase();
  const out=[];
  if(/student|bursar|scholar|university|college|matric|education/.test(s))out.push('students and applicants');
  if(/job|vacanc|employment|intern|learnership|career|youth employment/.test(s))out.push('job seekers');
  if(/business|entrepreneur|company|sme|enterprise/.test(s))out.push('businesses and entrepreneurs');
  if(/weather|storm|rain|flood|road|transport/.test(s))out.push('people travelling or living in affected areas');
  if(/grant|beneficiar|social development/.test(s))out.push('grant beneficiaries and households');
  return unique(out).slice(0,3);
}

function classifyNews(text=''){
  const s=String(text).toLowerCase();
  if(/bursar|scholar|student funding|university|college|education/.test(s))return'Education';
  if(/job|employment|intern|learnership|career|vacanc/.test(s))return'Opportunities';
  if(/weather|rain|storm|flood|temperature/.test(s))return'Weather';
  if(/health|medicine|hospital|clinic/.test(s))return'Health';
  if(/road|transport|rail|traffic/.test(s))return'Transport';
  if(/econom|business|trade|tourism|industry/.test(s))return'Economy';
  return'News';
}

export function plainEnglishNewsDraft(record={},source={}){
  const title=strip(record.title||'TodayInfo news update');
  const raw=record.contentText||record.content||record.description||record.excerpt||'';
  const sentences=splitSentences(raw);
  const keyPoints=unique(sentences.slice(0,10).map(x=>simplifyPhrase(x,22))).slice(0,6);
  const category=classifyNews(`${title} ${raw}`);
  const audience=audienceFor(`${title} ${raw}`);
  const intro=keyPoints[0]||simplifyPhrase(record.description||record.excerpt||title,28);
  const body=[
    '## In simple terms',
    intro||`This is an update about ${title}.`,
    '',
    '## Key points',
    ...(keyPoints.length?keyPoints.map(x=>`- ${x}`):['- Check the official source for the full announcement.']),
    '',
    '## Who should pay attention',
    audience.length?audience.map(x=>`- ${x}`).join('\n'):'- Anyone affected by this update.',
    '',
    '## Source',
    `This TodayInfo page is a short plain-English summary of information published by ${source.label||source.name||'the official source'}. Check the original source for the full context and any later corrections.`
  ].join('\n');

  const summary=simplifyPhrase(intro||title,45);
  return{
    title,slug:slugify(title),content_type:'news',summary,
    body_markdown:body,posted_date:record.publishedAt||record.pubDate||record.date||new Date().toISOString(),
    category,categories:['News',category],tags:unique(['News',category,...audience]).slice(0,20),
    topics:[
      {id:'t1',key:'t1',title:'In simple terms',body:intro||summary,links:[],images:[],documents:[]},
      {id:'t2',key:'t2',title:'Key points',body:keyPoints.map(x=>`- ${x}`).join('\n'),links:[],images:[],documents:[]}
    ],
    related_links:[],related_ids:[],recommendation_ids:[],recommendation_links:[],documents:[],navigation_links:[],
    type_data:{event_date:record.publishedAt||record.pubDate||record.date||null},
    geo:{country_code:source.country_code||record.country_code||null,country_name:source.country_name||null},
    classification:{organisation:source.label||source.name||'',opportunity_type:'news',keywords:unique([category,...audience])},
    main_image_url:record.image||record.featuredImage||null,
    seo_title:title,seo_description:summary,is_trending:false,status:'draft',
    source_transform:{
      mode:'plain_english_summary',source_name:source.label||source.name||null,source_url:record.url||record.link||null,
      source_credit:source.credit||source.label||source.name||null,generated_at:new Date().toISOString(),
      value_added:['plain-English summary','key points','audience guidance','structured metadata','source attribution']
    }
  };
}
