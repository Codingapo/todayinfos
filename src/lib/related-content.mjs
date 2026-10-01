const norm=v=>String(v||'').trim().toLowerCase();
const set=v=>new Set((Array.isArray(v)?v:[]).map(norm).filter(Boolean));
const overlap=(a,b)=>{let n=0;for(const x of a)if(b.has(x))n++;return n};

export function recommendationFamily(post={}){
  const type=norm(post.content_type);
  const subtype=norm(post.type_data?.subtype||post.classification?.subcategory);
  const educationSignals=[
    ...(post.classification?.education_level||[]),
    ...(post.classification?.fields_of_study||[]),
    ...(post.tags||[]),(post.category||'')
  ].map(norm).join(' ');
  if(['bursary','scholarship'].includes(type))return'education';
  if(type==='other'&&/university|college|education|application guide|student|course|prospectus/.test(subtype+' '+educationSignals))return'education';
  if(type==='opportunity'&&/student|study|education|university|college|bursar|scholar/.test(educationSignals))return'education';
  if(['job','internship','learnership'].includes(type))return'career';
  if(['news','announcement','story'].includes(type))return'news';
  return type||'other';
}

export function recommendationCompatible(a={},b={}){
  const fa=recommendationFamily(a),fb=recommendationFamily(b);
  if(fa==='education')return fb==='education';
  if(fa==='career')return fb==='career';
  if(fa==='news')return fb==='news';
  return fa===fb;
}

export function relationScore(a={},b={}){
  if(!a?.id||!b?.id||a.id===b.id)return 0;
  let score=0;
  const countryA=norm(a.geo?.country_code),countryB=norm(b.geo?.country_code);
  if(countryA&&countryA===countryB)score+=18;
  if(a.content_type&&a.content_type===b.content_type)score+=14;
  const orgA=norm(a.classification?.organisation||a.type_data?.company||a.type_data?.provider);
  const orgB=norm(b.classification?.organisation||b.type_data?.company||b.type_data?.provider);
  if(orgA&&orgB&&orgA===orgB)score+=30;
  const catA=set([a.category,...(a.categories||[])]),catB=set([b.category,...(b.categories||[])]);
  score+=Math.min(18,overlap(catA,catB)*6);
  const tagsA=set(a.tags||[]),tagsB=set(b.tags||[]);
  score+=Math.min(30,overlap(tagsA,tagsB)*6);
  const fieldA=set(a.classification?.fields_of_study||[]),fieldB=set(b.classification?.fields_of_study||[]);
  score+=Math.min(16,overlap(fieldA,fieldB)*8);
  const levelA=set(a.classification?.education_level||[]),levelB=set(b.classification?.education_level||[]);
  score+=Math.min(10,overlap(levelA,levelB)*5);
  const typeA=norm(a.classification?.opportunity_type),typeB=norm(b.classification?.opportunity_type);
  if(typeA&&typeA===typeB)score+=8;
  const workA=norm(a.classification?.work_mode),workB=norm(b.classification?.work_mode);
  if(workA&&workA===workB)score+=4;
  return score;
}

export function smartRelated(post={},rows=[],{limit=8,minScore=12}={}){
  const manual=new Set(post.related_ids||[]);
  const ranked=rows
    .filter(x=>x&&x.id!==post.id&&x.status==='published'&&!x.deleted_at)
    .map(x=>({post:x,score:relationScore(post,x)+(manual.has(x.id)?1000:0)}))
    .filter(x=>x.score>=minScore)
    .sort((a,b)=>b.score-a.score||String(b.post.published_at||b.post.posted_date||b.post.updated_at||'').localeCompare(String(a.post.published_at||a.post.posted_date||a.post.updated_at||'')))
    .slice(0,limit);
  return ranked;
}

export function smartRecommendations(post={},rows=[],{limit=6}={}){
  const relatedIds=new Set((post.related_ids||[]));
  const manual=new Set(post.recommendation_ids||[]);
  return rows
    .filter(x=>x&&x.id!==post.id&&x.status==='published'&&!x.deleted_at&&!relatedIds.has(x.id)&&recommendationCompatible(post,x))
    .map(x=>({post:x,score:relationScore(post,x)+(manual.has(x.id)?1000:0)}))
    .filter(x=>x.score>=18)
    .sort((a,b)=>b.score-a.score)
    .slice(0,limit);
}
