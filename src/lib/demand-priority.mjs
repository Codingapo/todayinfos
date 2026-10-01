import { hashKey, slugify } from './utils.mjs';
import { normalizeClassification, normalizeGeo } from './global-content.mjs';

export function normalizeTargetUrl(value=''){
  try{
    const u=new URL(String(value||'').trim());
    if(!['http:','https:'].includes(u.protocol))return '';
    u.hash='';
    return u.toString().replace(/\/$/,'');
  }catch{return ''}
}

export function demandPriority({clicks=0,views=0,fetchCount=1,quality=0,sourceChanged=false,lastClickedAt=null}={}){
  const c=Math.max(0,Number(clicks||0));
  const score=(c>0?10000:0)+(c*1000)+(Math.max(0,Number(views||0))*20)+(Math.max(1,Number(fetchCount||1))*3)+Math.max(0,Number(quality||0))+(sourceChanged?250:0);
  return {
    priority_score:score,
    priority:c>0?'highest':sourceChanged||Number(quality||0)>=80?'high':'normal',
    demand_clicks:c,
    last_clicked_at:lastClickedAt||null
  };
}

export function clickedDiscoveryRow({url,title='',suggestedType='other',sourcePostId=null,sourceTitle='',sourceFamily='visitor-demand'}={}){
  const target=normalizeTargetUrl(url);
  if(!target)return null;
  const type=['bursary','scholarship','job','internship','learnership','news','opportunity'].includes(suggestedType)?suggestedType:'other';
  const cleanTitle=String(title||target).replace(/\s+/g,' ').trim().slice(0,220);
  return {
    source_key:`discovery:${hashKey(target)}`,
    source_hash:hashKey(target,cleanTitle),
    source_name:'Visitor demand discovery',
    source_id:null,
    source_url:target,
    source_slug:slugify(cleanTitle),
    source_payload:{discovery:true,reason:'visitor_click',target_url:target,source_post_id:sourcePostId,source_title:sourceTitle,source_family:sourceFamily},
    detected_type:type,
    prepared_draft:{
      title:cleanTitle,slug:slugify(cleanTitle),content_type:type,summary:'',body_markdown:'',posted_date:null,
      category:type==='bursary'||type==='scholarship'?'Bursaries':type==='internship'?'Internships':type==='learnership'?'Learnerships':type==='news'?'News':'Jobs',
      categories:[],tags:['Discovered','Visitor demand'],topics:[],related_links:[],related_ids:[],recommendation_ids:[],recommendation_links:[],documents:[],navigation_links:[],
      type_data:{status_override:'unknown'},geo:normalizeGeo({}),classification:normalizeClassification({opportunity_type:type}),
      main_image_url:null,seo_title:cleanTitle,seo_description:'',is_trending:false,status:'draft',
      discovery:{reason:'visitor_click',target_url:target,source_post_id:sourcePostId,source_title:sourceTitle}
    },
    review_status:'unreviewed',source_changed:false,quality_score:10,
    quality_issues:['Visitor requested this missing item — fetch and review the source detail'],
    source_record_date:null
  };
}
