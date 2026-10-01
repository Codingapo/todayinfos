import { XMLParser } from 'fast-xml-parser';
import { config } from '../config.mjs';
import { contentQuality } from './content-rules.mjs';
import { hashKey } from './utils.mjs';
import { plainEnglishNewsDraft } from './plain-content.mjs';

const UA='TodayInfo-News-Harvester/0.8';
const parser=new XMLParser({ignoreAttributes:false,attributeNamePrefix:'@_',textNodeName:'#text',trimValues:true});

export const NEWS_FEEDS=[
  {
    id:'sanews',label:'SAnews',country_code:'ZA',country_name:'South Africa',
    feed_url:'https://www.sanews.gov.za/south-africa-news-stories.xml',
    homepage:'https://www.sanews.gov.za/',credit:'SAnews / Government Communication and Information System',
    usage_note:'SAnews states that media may use its stories and material at no cost when SAnews is credited.'
  },
  {
    id:'dsti',label:'Department of Science, Technology and Innovation',country_code:'ZA',country_name:'South Africa',
    feed_url:'https://www.dsti.gov.za/rss.xml',homepage:'https://www.dsti.gov.za/',
    credit:'Department of Science, Technology and Innovation',
    usage_note:'Official RSS feed. TodayInfo stores a short attributed summary and links to the original item.'
  }
];

const sourceById=id=>NEWS_FEEDS.find(x=>x.id===id);

async function fetchText(url){
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const res=await fetch(url,{headers:{accept:'application/rss+xml,application/atom+xml,application/xml,text/xml,*/*;q=0.5','user-agent':UA},signal:controller.signal});
    if(!res.ok)throw new Error(`Feed returned HTTP ${res.status}`);
    return await res.text();
  }finally{clearTimeout(timer)}
}

const list=v=>Array.isArray(v)?v:(v?[v]:[]);
const text=v=>{
  if(v==null)return'';
  if(typeof v==='string'||typeof v==='number')return String(v);
  if(typeof v==='object')return String(v['#text']||v['@_href']||v.href||'');
  return'';
};

function rssItems(doc){
  const rss=list(doc?.rss?.channel?.item);
  if(rss.length)return rss.map(item=>({
    title:text(item.title),
    url:text(item.link)||text(item.guid),
    description:text(item.description)||text(item['content:encoded']),
    publishedAt:text(item.pubDate)||text(item['dc:date']),
    image:item?.enclosure?.['@_url']||item?.['media:content']?.['@_url']||item?.['media:thumbnail']?.['@_url']||null,
    raw:item
  }));
  return list(doc?.feed?.entry).map(item=>{
    const links=list(item.link);const href=links.find(x=>x?.['@_rel']==='alternate')?.['@_href']||links[0]?.['@_href']||text(item.link);
    return{
      title:text(item.title),url:href,description:text(item.summary)||text(item.content),
      publishedAt:text(item.published)||text(item.updated),image:null,raw:item
    };
  });
}

async function sourceExtract(url){
  if(!url)return null;
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),20000);
  try{
    const res=await fetch(`${config.sourceApiBase}/extract?url=${encodeURIComponent(url)}`,{
      headers:{accept:'application/json','user-agent':UA},signal:controller.signal
    });
    if(!res.ok)return null;
    const payload=await res.json();const data=payload?.data;
    if(Array.isArray(data?.records))return data.records[0]||null;
    if(Array.isArray(data))return data[0]||null;
    return data&&typeof data==='object'?data:null;
  }catch{return null}
  finally{clearTimeout(timer)}
}

export async function harvestOfficialNews({source='sanews',limit=10}={}){
  const def=sourceById(source);
  if(!def)throw new Error('Unknown official news source');
  const wanted=Math.max(1,Math.min(10,Number(limit)||10));
  const xml=await fetchText(def.feed_url);
  const parsed=parser.parse(xml);
  const items=rssItems(parsed).filter(x=>x.title&&/^https?:\/\//i.test(x.url||'')).slice(0,wanted);
  const rows=[];const failures=[];

  for(const item of items){
    const extracted=await sourceExtract(item.url);
    const merged={
      ...item,
      ...(extracted||{}),
      title:extracted?.title||item.title,
      url:extracted?.url||item.url,
      contentText:extracted?.contentText||extracted?.content||item.description,
      description:extracted?.description||item.description,
      publishedAt:extracted?.publishedAt||item.publishedAt,
      image:extracted?.featuredImage||extracted?.image||item.image,
      links:extracted?.links||[]
    };
    try{
      const draft=plainEnglishNewsDraft(merged,def);
      const quality=contentQuality(draft);
      rows.push({
        source_key:`news:${def.id}:${hashKey(item.url||item.title)}`,
        source_hash:hashKey(JSON.stringify({title:merged.title,url:merged.url,publishedAt:merged.publishedAt,content:merged.contentText})),
        source_name:def.label,source_id:def.id,source_url:item.url,source_slug:null,
        source_payload:{...merged,source_credit:def.credit,usage_note:def.usage_note},
        detected_type:draft.content_type,prepared_draft:draft,review_status:'unreviewed',source_changed:false,
        quality_score:quality.score,quality_issues:quality.issues,source_record_date:draft.posted_date||null
      });
    }catch(error){failures.push({url:item.url,error:error.message})}
  }

  return{
    rows,
    stats:{source:def.id,requested:wanted,feed_items:items.length,accepted:rows.length,failed:failures.length,failures}
  };
}
