const DAY=86400000;
const EVENT_WEIGHTS={
  view:1,read:3,application_click:6,download:4,related_click:2,recommendation_click:2,tag_click:1.5,search:1
};

const tokens=value=>String(value||'').toLowerCase().split(/[^a-z0-9]+/).filter(x=>x.length>1);

export function searchScore(post={},query=''){
  const q=String(query||'').trim().toLowerCase();if(!q)return 0;
  const terms=tokens(q);if(!terms.length)return 0;
  const fields=[
    [post.title,12],[post.summary,5],[post.category,4],[(post.tags||[]).join(' '),6],
    [post.classification?.organisation,7],[(post.classification?.fields_of_study||[]).join(' '),6],
    [post.geo?.country_name,4],[post.geo?.region_name,4],[post.geo?.city,4],
    [post.body_markdown,1]
  ];
  let score=0;
  for(const term of terms){
    for(const [value,weight] of fields){
      const hay=String(value||'').toLowerCase();
      if(hay===term)score+=weight*2;
      else if(hay.includes(term))score+=weight;
    }
  }
  if(String(post.title||'').toLowerCase().includes(q))score+=20;
  return score;
}

export function trendScore(post={},eventCounts={},now=new Date()){
  let score=post.is_trending?25:0;
  for(const [event,count] of Object.entries(eventCounts||{}))score+=(EVENT_WEIGHTS[event]||0)*Number(count||0);
  const published=new Date(post.published_at||post.posted_date||post.updated_at||0);
  if(!Number.isNaN(published.getTime())){
    const ageDays=Math.max(0,(now-published)/DAY);
    score+=Math.max(0,20-ageDays*0.75);
  }
  return Math.round(score*100)/100;
}

export function rankSearch(rows=[],query=''){
  return rows.map(post=>({...post,search_score:searchScore(post,query)}))
    .sort((a,b)=>b.search_score-a.search_score||String(b.published_at||b.posted_date||'').localeCompare(String(a.published_at||a.posted_date||'')));
}

export function rankTrending(rows=[],countsByPost={},now=new Date()){
  return rows.map(post=>({...post,trending_score:trendScore(post,countsByPost[post.id]||{},now)}))
    .sort((a,b)=>b.trending_score-a.trending_score||String(b.published_at||b.posted_date||'').localeCompare(String(a.published_at||a.posted_date||'')));
}

const topValue=(events=[],getter)=>{
  const counts=new Map();
  for(const e of events){const value=getter(e);if(!value)continue;counts.set(value,(counts.get(value)||0)+1)}
  return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
};

export function deriveVisitorSignals(events=[]){
  const recent=[...events].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))).slice(0,200);
  return {
    country:topValue(recent,e=>e.meta?.country_code||e.meta?.country||null),
    region:topValue(recent,e=>e.meta?.region_name||e.meta?.region||null),
    content_type:topValue(recent,e=>e.meta?.content_type||null),
    query:topValue(recent.filter(e=>e.event_type==='search'),e=>String(e.meta?.query||'').trim().toLowerCase()||null)
  };
}
