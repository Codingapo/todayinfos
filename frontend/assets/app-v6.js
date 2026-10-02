(() => {
  'use strict';

  const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
  const app=$('#app');
  const cfg=window.TODAYINFO_CONFIG||{};
  const apiBases=[...(window.TODAYINFO_API_BASES||[]),window.TODAYINFO_API_BASE].filter(Boolean).map(x=>String(x).replace(/\/$/,''));
  const memory=new Map();
  const CACHE_PREFIX='todayinfo-public-cache:';
  const state={page:1,limit:20,seo:null,apiMode:'primary',apiBase:apiBases[0]||'',readTimer:null,readSent:false};
  const COLLECTIONS=new Set(['news','announcements','stories','articles','bursaries','scholarships','jobs','internships','learnerships','opportunities']);

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const text=v=>String(v??'').trim();
  const titleCase=v=>text(v).replaceAll('_',' ').replace(/\b\w/g,m=>m.toUpperCase());
  const safeHref=url=>/^https?:\/\//i.test(String(url||''))||/^\/(?!\/)/.test(String(url||''));
  const formatDate=value=>{if(!value)return'';const d=new Date(value);return Number.isNaN(d.getTime())?String(value):new Intl.DateTimeFormat('en-ZA',{day:'numeric',month:'long',year:'numeric'}).format(d)};
  const typeLabel=t=>({bursary:'Bursary',scholarship:'Scholarship',job:'Job',internship:'Internship',learnership:'Learnership',opportunity:'Opportunity',news:'News',announcement:'Announcement',story:'Story',other:'Page',application_guide:'Application guide'}[t]||titleCase(t||'Page'));
  const plural=t=>({bursary:'bursaries',scholarship:'scholarships',job:'jobs',internship:'internships',learnership:'learnerships',opportunity:'opportunities',news:'news',announcement:'news',story:'stories'}[t]||'posts');
  const visitorId=(()=>{const k='todayinfo-visitor-id';let v=localStorage.getItem(k);if(!v){v=crypto.randomUUID?crypto.randomUUID():'ti-'+Date.now()+'-'+Math.random().toString(16).slice(2);localStorage.setItem(k,v)}return v})();

  function cacheKey(path,params){return path+'?'+new URLSearchParams(Object.entries(params||{}).filter(([,v])=>v!==undefined&&v!==null&&v!=='')).toString()}
  function readStored(key,maxAge){try{const x=JSON.parse(localStorage.getItem(CACHE_PREFIX+key)||'null');if(x&&Date.now()-x.time<maxAge)return x.value}catch{}return null}
  function writeStored(key,value){try{localStorage.setItem(CACHE_PREFIX+key,JSON.stringify({time:Date.now(),value}))}catch{}}
  function apiUrl(base,path,params={}){const u=new URL(base+'/'+String(path||'').replace(/^\//,''));Object.entries(params).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')u.searchParams.set(k,v)});return u}

  async function request(path,{params={},method='GET',body,ttl=cfg.cacheTtlMs||60000,allowStale=true}={}){
    const key=cacheKey(path,params),cacheable=method==='GET';
    if(cacheable){const hit=memory.get(key);if(hit&&Date.now()-hit.time<ttl)return hit.value}
    let lastError=null;
    for(let i=0;i<apiBases.length;i++){
      const base=apiBases[i];
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),cfg.requestTimeoutMs||20000);
      try{
        const res=await fetch(apiUrl(base,path,params),{method,headers:{accept:'application/json',...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal});
        let value=null;try{value=await res.json()}catch{}
        if(res.ok){
          state.apiMode=i===0?'primary':'fallback';state.apiBase=base;
          if(cacheable){memory.set(key,{time:Date.now(),value});writeStored(key,value)}
          return value;
        }
        const err=new Error(value?.error||path+' returned '+res.status);err.status=res.status;lastError=err;
        if(res.status>=400&&res.status<500&&res.status!==404)throw err;
      }catch(error){lastError=error}finally{clearTimeout(timer)}
    }
    if(cacheable&&allowStale){const stale=readStored(key,cfg.staleTtlMs||86400000);if(stale){state.apiMode='stale';return stale}}
    throw lastError||new Error('TodayInfo API could not be reached.');
  }

  const get=(p,params={},ttl)=>request(p,{params,ttl});
  const safeGet=(p,params={},fallback={data:[]},ttl)=>get(p,params,ttl).catch(()=>fallback);
  const postEvent=(event_type,post_id=null,meta={})=>request('analytics/events',{method:'POST',body:{visitor_id:visitorId,event_type,post_id:post_id||undefined,meta},allowStale:false}).catch(()=>null);

  const link=(href,label,cls='',attrs='')=>safeHref(href)?'<a class="'+cls+'" href="'+esc(href)+'" '+(String(href).startsWith('/')?'data-route':'target="_blank" rel="noopener noreferrer"')+' '+attrs+'>'+esc(label||href)+'</a>':'';
  const header=(eyebrow,title,intro='')=>'<section class="page-heading container"><p class="eyebrow">'+esc(eyebrow)+'</p><h1>'+esc(title)+'</h1>'+(intro?'<p>'+esc(intro)+'</p>':'')+'</section>';
  const loading=()=>'<section class="container route-state"><div class="loader"></div><p>Loading TodayInfo…</p></section>';
  const empty=msg=>'<div class="route-state compact"><h3>No published content yet</h3><p>'+esc(msg)+'</p></div>';
  const errorState=msg=>'<section class="container route-state"><div class="error-icon">!</div><h2>We could not load that right now</h2><p>'+esc(msg)+'</p><div class="state-actions"><button class="button button-secondary" data-retry>Try again</button><a class="button button-primary" href="/" data-route>Back to Today</a></div></section>';
  const localPath=r=>r?.path||'/'+plural(r?.type)+'/'+encodeURIComponent(r?.slug||'');
  const locationLabel=r=>[r?.location?.city,r?.location?.region?.name,r?.location?.country?.name||r?.location?.country?.code].filter(Boolean).join(', ');

  function apiNotice(){
    if(state.apiMode==='primary')return'';
    const msg=state.apiMode==='stale'?'Showing recently cached TodayInfo data while the API reconnects.':'TodayInfo is using the temporary API fallback while the primary API reconnects.';
    return '<div class="api-warning">'+esc(msg)+'</div>';
  }
  function cover(r){return r?.main_image?'<img class="content-card-image" src="'+esc(r.main_image)+'" alt="" loading="lazy">':'<div class="content-card-image local-cover"><span>'+esc(typeLabel(r?.type))+'</span><strong>'+esc(r?.title||'TodayInfo')+'</strong></div>'}
  function card(r){const d=text(r?.description).slice(0,190),date=formatDate(r?.posted_date||r?.updated_date),place=locationLabel(r);return '<article class="content-card">'+cover(r)+'<div class="card-meta"><span class="story-tag">'+esc(typeLabel(r?.type))+'</span><span>'+esc(date||'Published')+'</span></div><h3>'+link(localPath(r),r?.title||'Untitled')+'</h3><p>'+esc(d)+(d.length>=190?'…':'')+'</p><div class="card-foot"><span>'+esc(place||r?.organisation||r?.category||'')+'</span><span>Read ↗</span></div></article>'}
  function guideCard(g){return '<article class="content-card guide-card"><div class="content-card-image local-cover guide-cover"><span>Application guide</span><strong>'+esc(g.title||'How to apply')+'</strong></div><div class="card-meta"><span class="story-tag">Guide</span></div><h3>'+link(g.path||'/guides/'+encodeURIComponent(g.slug||''),g.title||'How to apply')+'</h3><p>'+esc(text(g.description).slice(0,190))+'</p></article>'}
  function pager(meta){const p=meta?.pagination;if(!p||Number(p.totalPages||1)<=1)return'';return '<div class="pager"><button class="button button-secondary" data-page="'+(p.page-1)+'" '+(p.hasPrevious?'':'disabled')+'>← Previous</button><span>Page '+p.page+' of '+p.totalPages+'</span><button class="button button-secondary" data-page="'+(p.page+1)+'" '+(p.hasNext?'':'disabled')+'>Next →</button></div>'}
  function listView(title,eyebrow,rows,meta,intro='',render=card){return header(eyebrow,title,intro)+'<section class="container route-section"><div class="listing-toolbar"><span>'+Number(meta?.pagination?.total??rows.length).toLocaleString()+' results</span><label class="search-box"><span>⌕</span><input id="routeSearch" type="search" placeholder="Search TodayInfo"></label></div><div class="content-grid">'+(rows.length?rows.map(render).join(''):empty('Published content will appear here automatically.'))+'</div>'+pager(meta)+'</section>'}
  function topicCards(items,kind){return '<div class="topic-grid route-topics">'+items.map(x=>'<a class="topic-card topic-blue" href="/'+kind+'/'+encodeURIComponent(x.slug)+'" data-route><span class="topic-icon">◎</span><strong>'+esc(x.title||x.name)+'</strong><small>'+Number(x.count||0)+' published</small><span class="topic-arrow">↗</span></a>').join('')+'</div>'}

  async function home(){
    const [siteR,latestR,trendingR,personalR,facetsR,countriesR,guidesR]=await Promise.all([
      safeGet('site',{}, {data:{}}),safeGet('posts',{page:1,limit:8}),safeGet('trending',{page:1,limit:6}),
      safeGet('personalized',{visitor_id:visitorId},{data:[]},30000),safeGet('facets',{}, {data:{}}),safeGet('countries'),safeGet('guides',{page:1,limit:3})
    ]);
    const site=siteR.data||{},latest=latestR.data||[],trending=trendingR.data||[],personal=personalR.data||[],facets=facetsR.data||{},countries=countriesR.data||[],guides=guidesR.data||[];
    const featured=personal.length>=4?personal.slice(0,4):trending.length?trending.slice(0,4):latest.slice(0,4);
    const counts=Object.fromEntries((facets.content_types||[]).map(x=>[x.value,x.count]));
    const types=[['🎓','Bursaries','bursaries','bursary'],['📘','Scholarships','scholarships','scholarship'],['💼','Jobs','jobs','job'],['🧭','Internships','internships','internship'],['🛠️','Learnerships','learnerships','learnership'],['✨','Opportunities','opportunities','opportunity']];
    return '<section class="hero"><div class="container hero-grid"><div class="hero-copy"><p class="eyebrow"><span class="pulse"></span>'+esc(new Intl.DateTimeFormat('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date()))+'</p><h1>Know what<br><em>matters today.</em></h1><p class="hero-lede">Jobs, funding, internships, news, guides and useful opportunities — structured and published through the managed TodayInfo API.</p><div class="hero-cta"><a class="button button-primary" href="/latest" data-route>Explore latest updates →</a><a class="text-button" href="/search" data-route>Search all opportunities ⌕</a></div></div><div class="hero-art"><div class="sun"></div><div class="orb orb-one"></div><div class="orb orb-two"></div><div class="horizon horizon-back"></div><div class="horizon horizon-front"></div><div class="art-note"><span class="note-dot"></span><span>Live managed API<br><strong>'+esc(site.name||'TodayInfo')+'</strong></span></div></div></div></section>'+apiNotice()+header(personal.length>=4?'Picked for you':trending.length?'Trending now':'Fresh from TodayInfo','Latest updates','Only published content is shown here.')+'<section class="container route-section"><div class="content-grid featured-grid">'+(featured.length?featured.map(card).join(''):empty('No published content yet.'))+'</div></section><section class="container section"><div class="section-heading"><div><p class="eyebrow">Opportunity finder</p><h2>Browse by content type</h2></div></div><div class="home-type-grid six-up">'+types.map(x=>'<a class="home-type-card" href="/'+x[2]+'" data-route><span>'+x[0]+'</span><strong>'+x[1]+'</strong><small>'+(counts[x[3]]?counts[x[3]]+' published':'Explore')+'</small></a>').join('')+'</div></section>'+(countries.length?'<section class="container section"><div class="section-heading"><div><p class="eyebrow">Global TodayInfo</p><h2>Browse countries</h2></div><a class="view-all" href="/countries" data-route>All countries →</a></div><div class="country-strip">'+countries.slice(0,8).map(c=>'<a href="/'+String(c.code||'').toLowerCase()+'" data-route><strong>'+esc(c.name||c.code)+'</strong><small>'+Number(c.count||0)+' pages</small></a>').join('')+'</div></section>':'')+(guides.length?'<section class="container section"><div class="section-heading"><div><p class="eyebrow">Application help</p><h2>Step-by-step guides</h2></div><a class="view-all" href="/guides" data-route>All guides →</a></div><div class="content-grid">'+guides.map(guideCard).join('')+'</div></section>':'');
  }

  const filters=()=>{const q=new URLSearchParams(location.search),keys=['q','country','region','city','category','organisation','field_of_study','work_mode','opportunity_status','closing_before','closing_after'];return Object.fromEntries(keys.map(k=>[k,q.get(k)||'']).filter(([,v])=>v))};
  async function collection(endpoint,title,eyebrow,intro,extra={}){const r=await get(endpoint,{...filters(),...extra,page:state.page,limit:state.limit});return apiNotice()+listView(title,eyebrow,r.data||[],r.meta,intro)}
  const routesSimple={
    '/latest':()=>collection('posts','Latest updates','Published now','All published TodayInfo content, newest first.'),
    '/bursaries':()=>collection('bursaries','Bursaries','Funding opportunities','Published bursaries with status, dates, eligibility and application information.'),
    '/scholarships':()=>collection('scholarships','Scholarships','Study funding','Published scholarship opportunities.'),
    '/jobs':()=>collection('jobs','Jobs','Career opportunities','Published vacancies with organisation, location, requirements and application links.'),
    '/internships':()=>collection('internships','Internships','Career starters','Published internship opportunities.'),
    '/learnerships':()=>collection('learnerships','Learnerships','Skills opportunities','Published learnership and apprenticeship opportunities.'),
    '/opportunities':()=>collection('opportunities','Opportunities','More ways forward','Published opportunities across TodayInfo.'),
    '/news':()=>collection('news','News & announcements','Latest information','Plain-language published news and announcements.'),
    '/trending':()=>collection('trending','Trending on TodayInfo','What people are reading','Published content ranked by recent engagement.'),
    '/for-you':()=>collection('personalized','For you','Your TodayInfo activity','A deterministic feed based on your own recent activity.',{visitor_id:visitorId})
  };

  async function explore(){
    const [metaR,facetsR,countriesR,sourcesR,guidesR]=await Promise.all([safeGet('meta',{}, {data:{}}),safeGet('facets',{}, {data:{}}),safeGet('countries'),safeGet('sources',{}, {data:{sources:[]}}),safeGet('guides',{page:1,limit:1})]);
    const m=metaR.data||{},f=facetsR.data||{},countries=countriesR.data||[],sourceCount=sourcesR.data?.sources?.length||m.sources?.catalogued||0,guideCount=guidesR.meta?.pagination?.total||0;
    const types=f.content_types||[];
    return apiNotice()+header('TodayInfo catalog','Explore the whole API','Browse published content, countries, application guides and public source information.')+'<section class="container route-section"><div class="api-stats"><div class="api-stat"><strong>'+Number(f.total||0)+'</strong><span>Published</span></div><div class="api-stat"><strong>'+countries.length+'</strong><span>Countries</span></div><div class="api-stat"><strong>'+sourceCount+'</strong><span>Sources</span></div><div class="api-stat"><strong>'+guideCount+'</strong><span>Guides</span></div></div><div class="explore-hub-grid"><a class="explore-hub-card" href="/countries" data-route><span>◎</span><strong>Countries</strong><p>Country-specific jobs, bursaries and opportunities.</p></a><a class="explore-hub-card" href="/sources" data-route><span>⌁</span><strong>Sources</strong><p>See TodayInfo source categories and publishing policies.</p></a><a class="explore-hub-card" href="/guides" data-route><span>✓</span><strong>Application guides</strong><p>Step-by-step help based on published application instructions.</p></a><a class="explore-hub-card" href="/trending" data-route><span>↗</span><strong>Trending</strong><p>What is moving across TodayInfo.</p></a></div><div class="facet-grid">'+types.map(x=>'<a href="/'+plural(x.value)+'" data-route><strong>'+esc(typeLabel(x.value))+'</strong><span>'+Number(x.count||0)+' published</span></a>').join('')+'</div></section>';
  }

  async function searchView(){
    const current=filters(),[facetsR,resultR]=await Promise.all([safeGet('facets',current,{data:{}}),Object.keys(current).length?get('search',{...current,visitor_id:visitorId,page:state.page,limit:state.limit}):Promise.resolve({data:[],meta:{}})]);
    const f=facetsR.data||{},rows=resultR.data||[];
    const opts=(items,val)=>'<option value="">All</option>'+(items||[]).slice(0,70).map(x=>'<option value="'+esc(x.value)+'" '+(String(val||'')===String(x.value)?'selected':'')+'>'+esc(x.value)+' ('+x.count+')</option>').join('');
    const toolbar='<form id="searchForm" class="search-filter-panel"><div class="search-filter-main"><input name="q" type="search" placeholder="Search jobs, bursaries, organisations…" value="'+esc(current.q||'')+'"><button class="button button-primary">Search</button></div><div class="search-filter-grid"><label>Country<select name="country">'+opts(f.countries,current.country)+'</select></label><label>Region<select name="region">'+opts(f.regions,current.region)+'</select></label><label>Category<select name="category">'+opts(f.categories,current.category)+'</select></label><label>Organisation<select name="organisation">'+opts(f.organisations,current.organisation)+'</select></label><label>Field of study<select name="field_of_study">'+opts(f.fields_of_study,current.field_of_study)+'</select></label><label>Work mode<select name="work_mode">'+opts(f.work_modes,current.work_mode)+'</select></label></div><div class="filter-actions"><span>'+Number(resultR.meta?.pagination?.total??resultR.meta?.total??rows.length)+' results</span><button type="button" class="button button-secondary" data-clear-search>Clear</button></div></form>';
    return apiNotice()+header('Search','Find exactly what you need','Search only published TodayInfo content.')+'<section class="container route-section">'+toolbar+'<div class="content-grid">'+(rows.length?rows.map(card).join(''):empty(Object.keys(current).length?'No published results matched those filters.':'Enter a search or choose filters.'))+'</div>'+pager(resultR.meta)+'</section>';
  }

  async function countriesView(){const r=await get('countries');const rows=r.data||[];return apiNotice()+header('Global TodayInfo','Countries','Browse published content by country.')+'<section class="container route-section"><div class="country-directory">'+rows.map(c=>'<a class="country-card" href="/'+String(c.code||'').toLowerCase()+'" data-route><div><strong>'+esc(c.name||c.code)+'</strong><small>'+esc(c.code||'')+'</small></div><b>'+Number(c.count||0)+'</b><span>published pages</span></a>').join('')+'</div></section>'}
  async function countryHome(code){const [postsR,facetR]=await Promise.all([get(code+'/posts',{page:1,limit:12}).catch(()=>get('posts',{country:code,page:1,limit:12})),safeGet('facets',{country:code},{data:{}})]);const f=facetR.data||{};return apiNotice()+header(code.toUpperCase(),'TodayInfo '+code.toUpperCase(),'Published information for this country.')+'<section class="container route-section"><div class="country-hub-meta"><div><strong>'+Number(f.total||0)+'</strong><span>Published</span></div><div><strong>'+Number((f.content_types||[]).length)+'</strong><span>Content types</span></div></div><div class="country-quick-links"><a href="/'+code+'/jobs" data-route>Jobs</a><a href="/'+code+'/bursaries" data-route>Bursaries</a><a href="/'+code+'/news" data-route>News</a></div><div class="content-grid">'+(postsR.data||[]).map(card).join('')+'</div></section>'}

  async function taxonomy(kind){const r=await get(kind);return apiNotice()+header('Browse',titleCase(kind),'Explore published TodayInfo '+kind+'.')+'<section class="container route-section">'+topicCards(r.data||[],kind)+'</section>'}
  async function taxonomyDetail(kind,slug){const r=await get(kind+'/'+encodeURIComponent(slug));const d=r.data||{},rows=d.records||[];return apiNotice()+listView(d.title||d.name||titleCase(slug),titleCase(kind),rows,{pagination:{total:rows.length}},'Published content in this '+kind.slice(0,-1)+'.')}

  async function sourcesView(){const r=await get('sources'),d=r.data||{},cats=d.categories||[],sources=d.sources||[];return apiNotice()+header('Source transparency','Sources','See what TodayInfo can use and how each source is handled.')+'<section class="container route-section"><div class="source-public-grid">'+cats.map(c=>{const rows=sources.filter(x=>x.category===c.id);return '<section class="source-public-category"><div class="section-heading"><div><p class="eyebrow">Source category</p><h2>'+esc(c.label)+'</h2><p class="muted">'+esc(c.description||'')+'</p></div></div><div class="source-public-cards">'+rows.map(x=>'<article class="source-public-card"><div class="source-public-head"><span>'+esc(x.integration_status||'catalogued')+'</span><strong>'+esc(x.label)+'</strong></div><p>'+esc(x.description||'')+'</p><div class="source-public-meta"><span>'+esc(x.region||'Global')+'</span><span>'+esc((x.content_types||[]).join(' · '))+'</span></div>'+(x.publishing_policy?'<div class="source-policy"><strong>'+esc(x.publishing_policy.title||'Publishing policy')+'</strong><p>'+esc(x.publishing_policy.summary||'')+'</p></div>':'')+link(x.homepage,'Open official source','view-all')+'</article>').join('')+'</div></section>'}).join('')+'</div></section>'}
  async function guidesView(){const r=await get('guides',{page:state.page,limit:state.limit});return apiNotice()+listView('Application guides','Plain-English help',r.data||[],r.meta,'Step-by-step guides linked to published opportunities.',guideCard)}
  async function guideDetail(slug){const r=await get('guides/'+encodeURIComponent(slug)),g=r.data||{};return apiNotice()+'<section class="container guide-detail"><article class="detail-article guide-main"><p class="eyebrow">Application guide</p><h1>'+esc(g.title||'How to apply')+'</h1><p class="detail-lede">'+esc(g.description||'')+'</p><ol class="application-steps">'+(g.steps||[]).map((x,i)=>'<li><span>'+(i+1)+'</span><p>'+esc(x)+'</p></li>').join('')+'</ol>'+(g.supporting_documents?.length?'<h2>Documents to prepare</h2><ul class="plain-list">'+g.supporting_documents.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ul>':'')+'</article><aside class="detail-aside"><div class="side-card"><p class="eyebrow">Official application</p>'+(g.official_application_url?link(g.official_application_url,'Open application page','button button-primary full-button','data-event="application_click" data-target-url="'+esc(g.official_application_url)+'"'):'<p class="muted">No verified application link is currently available.</p>')+'</div></aside></section>'}

  function tagLinks(tags){return (tags||[]).map(t=>'<a class="detail-tag" href="'+esc(t.url||'/tags/'+encodeURIComponent(t.slug||t.name))+'" data-route data-event="tag_click">'+esc(t.name||t.title||t)+'</a>').join('')}
  function trackedExternal(item,event,postId){const u=item.url||'',attrs='data-event="'+esc(event)+'" data-post-id="'+esc(postId||'')+'" data-target-url="'+esc(u)+'" data-target-title="'+esc(item.title||'')+'" data-target-type="'+esc(item.type||item.tracking?.target_type||'')+'"';return link(u,item.title||'Open link','related-link',attrs)}
  function contentHtml(d){if(d?.body?.html)return d.body.html;const md=d?.body?.markdown||d?.body_markdown||'';return esc(md).split(/\n{2,}/).map(x=>'<p>'+x.replace(/\n/g,'<br>')+'</p>').join('')}
  async function detail(endpoint,slug){const r=await get(endpoint+'/'+encodeURIComponent(slug)),d=r.data||{};state.detailPostId=d.id;state.readSent=false;postEvent('view',d.id,{content_type:d.type});clearTimeout(state.readTimer);state.readTimer=setTimeout(()=>{if(!state.readSent){state.readSent=true;postEvent('read',d.id,{content_type:d.type})}},12000);const m=d.metadata||{},guide=m.application_guide;const related=(d.related_content||[]),recs=(d.recommendations||[]);return apiNotice()+(d.navigation?.breadcrumbs?.length?'<nav class="breadcrumbs">'+d.navigation.breadcrumbs.map(x=>link(x.url,x.title)).join('<span>›</span>')+'</nav>':'')+'<section class="container detail-layout"><article class="detail-article"><p class="eyebrow">'+esc(typeLabel(d.type))+'</p><h1>'+esc(d.title||'Untitled')+'</h1><div class="detail-tags">'+tagLinks(d.tags)+'</div><p class="detail-lede">'+esc(d.description||'')+'</p><div class="detail-meta">'+[m.status?'<span class="opportunity-status status-'+esc(m.status)+'">'+esc(m.status)+'</span>':'',d.posted_date?'<span>Posted '+esc(formatDate(d.posted_date))+'</span>':'',m.closing_date?'<span>Closing '+esc(formatDate(m.closing_date))+'</span>':''].join('')+'</div>'+(m.application_url?'<div class="application-callout '+(m.application_url_verified?'verified-application':'source-application')+'"><div><strong>'+(m.application_url_verified?'Verified application destination':'Application information')+'</strong><p>'+(m.application_url_verified?'TodayInfo checked the destination supplied for this opportunity.':'Check the official destination and source before submitting.')+'</p>'+(guide?.useful?'<a class="application-guide-link" href="/guides/'+encodeURIComponent(d.slug)+'-how-to-apply" data-route>Open step-by-step guide →</a>':'')+'</div>'+link(m.application_url,'Apply / open official page','button button-primary','data-event="application_click" data-post-id="'+esc(d.id)+'" data-target-url="'+esc(m.application_url)+'"')+'</div>':'')+'<div class="detail-content">'+contentHtml(d)+'</div>'+(d.topics||[]).map(t=>'<section id="'+esc(t.key||t.id)+'" class="structured-section topic-section"><h2>'+esc(t.title)+'</h2><div>'+esc(t.body||'').replace(/\n/g,'<br>')+'</div></section>').join('')+'</article><aside class="detail-aside"><div class="side-card"><p class="eyebrow">Details</p>'+(d.organisation?'<div class="fact"><small>Organisation</small><strong>'+esc(d.organisation)+'</strong></div>':'')+(locationLabel(d)?'<div class="fact"><small>Location</small><strong>'+esc(locationLabel(d))+'</strong></div>':'')+(d.source?.source_url?trackedExternal({title:'Original source',url:d.source.source_url},'related_click',d.id):'')+'</div>'+(d.related_links?.length?'<div class="side-card"><p class="eyebrow">Related links</p>'+d.related_links.map(x=>trackedExternal(x,x.tracking?.event_type||'related_click',d.id)).join('')+'</div>':'')+'</aside></section>'+(related.length?'<section class="container relation-section"><div class="section-heading"><h2>Related content</h2></div><div class="content-grid">'+related.map(card).join('')+'</div></section>':'')+(recs.length?'<section class="container relation-section"><div class="section-heading"><h2>Recommended</h2></div><div class="content-grid">'+recs.map(card).join('')+'</div></section>':'')}

  async function route(){
    state.page=Math.max(1,Number(new URLSearchParams(location.search).get('page')||1));app.innerHTML=loading();
    try{
      const path=location.pathname.replace(/\/+$/,'')||'/';let html='';
      if(path==='/')html=await home();
      else if(routesSimple[path])html=await routesSimple[path]();
      else if(path==='/explore')html=await explore();
      else if(path==='/search')html=await searchView();
      else if(path==='/countries')html=await countriesView();
      else if(path==='/sources')html=await sourcesView();
      else if(path==='/guides')html=await guidesView();
      else if(path==='/categories'||path==='/tags')html=await taxonomy(path.slice(1));
      else {
        const seg=path.split('/').filter(Boolean),cc=/^[a-z]{2,3}$/i.test(seg[0]||'');
        if(seg.length===2&&seg[0]==='categories')html=await taxonomyDetail('categories',seg[1]);
        else if(seg.length===2&&seg[0]==='tags')html=await taxonomyDetail('tags',seg[1]);
        else if(seg.length===2&&seg[0]==='guides')html=await guideDetail(seg[1]);
        else if(seg.length===1&&cc)html=await countryHome(seg[0].toLowerCase());
        else if(seg.length===2&&cc&&COLLECTIONS.has(seg[1]))html=await collection(seg[0]+'/'+seg[1],titleCase(seg[1]),seg[0].toUpperCase(),'Published '+seg[1]+' in '+seg[0].toUpperCase()+'.');
        else if(seg.length===3&&cc&&seg[1]==='guides')html=await guideDetail(seg[2]);
        else if(seg.length===3&&cc&&COLLECTIONS.has(seg[1]))html=await detail(seg[0]+'/'+seg[1],seg[2]);
        else if(seg.length===4&&cc&&seg[1]==='news')html=await detail(seg[0]+'/news/'+seg[2],seg[3]);
        else if(seg.length===2&&COLLECTIONS.has(seg[0]))html=await detail(seg[0],seg[1]);
        else if(seg.length===2&&['bursary','article','page','topic'].includes(seg[0]))html=await detail(seg[0]==='bursary'?'bursaries':seg[0]==='article'?'articles':'posts',seg[1]);
        else throw Object.assign(new Error('Page not found'),{status:404});
      }
      app.innerHTML=html;bind();updateSeo();
    }catch(error){app.innerHTML=errorState(error?.message||'The page could not be loaded.');bind()}
  }

  function navigate(href,replace=false){if(replace)history.replaceState({},'',href);else history.pushState({},'',href);route()}
  function bind(){
    $$('[data-route]',app).forEach(a=>a.addEventListener('click',e=>{const href=a.getAttribute('href');if(href?.startsWith('/')){e.preventDefault();navigate(href)}}));
    $$('[data-page]',app).forEach(b=>b.addEventListener('click',()=>{if(b.disabled)return;const q=new URLSearchParams(location.search);q.set('page',b.dataset.page);navigate(location.pathname+'?'+q)}));
    $$('[data-retry]',app).forEach(b=>b.addEventListener('click',route));
    $('#routeSearch',app)?.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.value.trim())navigate('/search?q='+encodeURIComponent(e.target.value.trim()))});
    $('#searchForm',app)?.addEventListener('submit',e=>{e.preventDefault();const q=new URLSearchParams();for(const [k,v] of new FormData(e.currentTarget))if(String(v).trim())q.set(k,String(v).trim());navigate('/search'+(q.toString()?'?'+q:''))});
    $('[data-clear-search]',app)?.addEventListener('click',()=>navigate('/search'));
    $$('[data-event]',app).forEach(a=>a.addEventListener('click',()=>postEvent(a.dataset.event,a.dataset.postId||state.detailPostId||undefined,{target_url:a.dataset.targetUrl||a.href,target_title:a.dataset.targetTitle||a.textContent.trim(),target_type:a.dataset.targetType||undefined,content_type:undefined})));
  }

  function updateSeo(){
    const h=$('h1',app),desc=$('.detail-lede,.page-heading p:last-child,.hero-lede',app)?.textContent||'TodayInfo — jobs, bursaries, news and useful opportunities.';
    const title=h?.textContent?esc(h.textContent)+' — TodayInfo':'TodayInfo — Your daily briefing';
    document.title=title.replaceAll('&amp;','&');
    $('meta[name="description"]')?.setAttribute('content',desc.trim().slice(0,160));
    $('link[rel="canonical"]')?.setAttribute('href','https://todayinfo.co.za'+location.pathname);
    $$('[data-nav]').forEach(x=>{const first=location.pathname.split('/').filter(Boolean)[0]||'home';const key=location.pathname==='/'?'home':first==='latest'?'latest':first==='bursaries'?'bursaries':first==='jobs'?'jobs':first==='news'?'news':['explore','categories','tags','countries','sources','guides','scholarships','opportunities','internships','learnerships','trending','for-you'].includes(first)?'explore':first==='search'?'search':'';x.classList.toggle('active',x.dataset.nav===key)});
  }

  $('#themeToggle')?.addEventListener('click',()=>{const dark=document.documentElement.dataset.theme==='dark';document.documentElement.dataset.theme=dark?'':'dark';localStorage.setItem('todayinfo-theme',dark?'light':'dark')});
  $('#menuToggle')?.addEventListener('click',()=>{$('.main-nav')?.classList.toggle('open')});
  if(localStorage.getItem('todayinfo-theme')==='dark')document.documentElement.dataset.theme='dark';
  addEventListener('popstate',route);
  addEventListener('error',e=>console.error(e.error||e.message));
  addEventListener('unhandledrejection',e=>console.error(e.reason));
  route();
})();