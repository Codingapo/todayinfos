const $=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const state={user:null,csrf:'',permissions:[],view:'overview',contentTypes:null,constraints:null,posts:[],editor:null};
const savedTheme=localStorage.getItem('todayinfo-theme');
function applyTheme(theme){document.documentElement.dataset.theme=theme;localStorage.setItem('todayinfo-theme',theme);const button=$('#themeToggle');if(button){const dark=theme==='dark';button.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode');button.title=dark?'Switch to light mode':'Switch to dark mode';button.querySelector('span').textContent=dark?'☀':'☾';button.querySelector('.theme-label').textContent=dark?'Light mode':'Dark mode'}}
applyTheme(savedTheme||'light');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate=v=>{if(!v)return'—';const d=new Date(v);return Number.isNaN(d.getTime())?String(v):d.toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'})};
const dateInput=v=>{if(!v)return'';const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toISOString().slice(0,10)};
const can=permission=>(state.permissions||[]).some(p=>p==='*'||p===permission||(p.endsWith('.*')&&permission.startsWith(p.slice(0,-1))));
const VIEW_PERMISSION={overview:'dashboard.view',sources:'imports.fetch',imports:'imports.view',demand:'imports.fetch',posts:'posts.view',media:'media.view',analytics:'analytics.view',team:'team.view',settings:'settings.view',audit:'audit.view'};
const firstAllowedView=()=>['overview','imports','posts','media','sources','analytics','team','settings','audit'].find(v=>can(VIEW_PERMISSION[v]))||'posts';
const applyAccess=()=>{
  $('#nav button[data-view]').forEach(btn=>{const permission=VIEW_PERMISSION[btn.dataset.view];btn.hidden=Boolean(permission&&!can(permission))});
  $('#nav p').forEach(label=>{let next=label.nextElementSibling,visible=false;while(next&&next.tagName!=='P'){if(next.matches?.('button[data-view]')&&!next.hidden)visible=true;next=next.nextElementSibling}label.hidden=!visible});
  if($('#quickFetch'))$('#quickFetch').hidden=!can('imports.fetch');
  if($('#quickCreate'))$('#quickCreate').hidden=!can('posts.create');
  const role=$('#roleBadge');if(role)role.textContent=state.user?.role_label||state.user?.role||'';
};
const adminOpportunityStatus=p=>{const td=p?.type_data||{},override=String(td.status_override||'auto').toLowerCase();if(override&&override!=='auto')return override;const close=td.closing_date?new Date(td.closing_date):null;if(close&&!Number.isNaN(close.getTime())){const days=Math.ceil((close-Date.now())/86400000);if(days<0)return'closed';if(days<=7)return'closing_soon';return'open'}return'unknown'};
const splitList=v=>[...new Set(String(v||'').split(',').map(x=>x.trim().replace(/^#/,'')).filter(Boolean))];
const bytes=n=>{const x=Number(n||0);if(!x)return'';if(x<1024)return`${x} B`;if(x<1048576)return`${(x/1024).toFixed(1)} KB`;return`${(x/1048576).toFixed(1)} MB`};
const icon=(name)=>{const paths={trash:'<path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',restore:'<path d="M4 12a8 8 0 1 0 2.34-5.66L4 8.68M4 4v4.68h4.68"/>',edit:'<path d="M4 20h4l10.5-10.5a2.12 2.12 0 0 0-3-3L5 17v3ZM13.5 6.5l3 3"/>',eye:'<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>'};return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths[name]||''}</g></svg>`};
const iconButton=(name,label,cls='')=>`<button class="icon-action ${cls}" type="button" aria-label="${esc(label)}" title="${esc(label)}">${icon(name)}</button>`;

async function request(url,{method='GET',body,auth=true}={}){
  const opts={method,credentials:'same-origin',headers:{accept:'application/json'}};
  if(auth&&state.csrf&&!['GET','HEAD'].includes(method))opts.headers['x-csrf-token']=state.csrf;
  if(body instanceof FormData)opts.body=body;else if(body!==undefined){opts.headers['content-type']='application/json';opts.body=JSON.stringify(body)}
  const res=await fetch(url,opts);let out={};try{out=await res.json()}catch{}
  if(!res.ok){
    const issues=out?.details?.issues||[];
    const legacy=out?.details?.formErrors?.join(' ')||Object.values(out?.details?.fieldErrors||{}).flat().join(' ');
    const issueText=issues.slice(0,4).map(x=>`${x.path?x.path+': ':''}${x.message}`).join(' · ');
    const err=new Error([out.error||`HTTP ${res.status}`,issueText||legacy].filter(Boolean).join(' — '));
    err.status=res.status;err.details=out?.details||null;err.payload=out;throw err;
  }
  return out.data;
}
const api=(path,opts)=>request(`/admin/api${path}`,opts);
function toast(msg,error=false){const el=$('#toast');el.textContent=msg;el.className=`toast show${error?' error':''}`;clearTimeout(toast.t);toast.t=setTimeout(()=>el.className='toast',3300)}
function modal(title,eyebrow,html){$('#modalTitle').textContent=title;$('#modalEyebrow').textContent=eyebrow;$('#modalBody').innerHTML=html;$('#modal').showModal()}
function closeModal(){if($('#modal').open)$('#modal').close();state.editor=null}
$('#modalClose').addEventListener('click',closeModal);
$('#modal').addEventListener('click',e=>{if(e.target===$('#modal'))closeModal()});

async function boot(){
  try{const me=await request('/admin/api/auth/me',{auth:false});state.user=me.user;state.csrf=me.csrf;state.permissions=me.permissions||[];showApp();applyAccess();await loadContentTypes();await navigate(firstAllowedView())}catch{showLogin()}
}
function showLogin(){$('#loginView').classList.remove('hidden');$('#appView').classList.add('hidden')}
function showApp(){$('#loginView').classList.add('hidden');$('#appView').classList.remove('hidden');$('#avatar').textContent=(state.user?.display_name||state.user?.username||'A').slice(0,1).toUpperCase()}
$('#loginForm').addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const r=await request('/admin/api/auth/login',{method:'POST',body:{username:f.get('username'),password:f.get('password')},auth:false});state.user=r.user;state.csrf=r.csrf;state.permissions=r.permissions||[];showApp();applyAccess();await loadContentTypes();await navigate(firstAllowedView())}catch(err){toast(err.message,true)}});
$('#logoutBtn').addEventListener('click',async()=>{try{await request('/admin/api/auth/logout',{method:'POST',body:{}})}catch{}state.user=null;state.csrf='';state.permissions=[];showLogin()});
$('#menuBtn').addEventListener('click',()=>$('#sidebar').classList.toggle('open'));
$('#themeToggle').addEventListener('click',()=>applyTheme(document.documentElement.dataset.theme==='dark'?'light':'dark'));
$('#nav').addEventListener('click',e=>{const b=e.target.closest('button[data-view]');if(b)navigate(b.dataset.view)});
$('#quickFetch').addEventListener('click',openFetch);
$('#quickCreate').addEventListener('click',()=>openTypePicker());

async function loadContentTypes(){
  if(state.contentTypes&&state.constraints)return;
  const [types,constraints]=await Promise.all([
    state.contentTypes?Promise.resolve(state.contentTypes):api('/content-types'),
    state.constraints?Promise.resolve(state.constraints):api('/content-constraints')
  ]);
  state.contentTypes=types;state.constraints=constraints;
}
const VIEW_META={overview:['COMMAND CENTER','Overview'],sources:['SOURCE INTELLIGENCE','Source Hub'],imports:['CONTENT PIPELINE','Import Inbox'],demand:['AUDIENCE DEMAND','Demand Queue'],posts:['CONTENT','Content Library'],media:['FILES','Media & Documents'],analytics:['INSIGHTS','Analytics'],team:['ACCESS','Team & Roles'],settings:['SYSTEM','Settings'],audit:['SECURITY','Audit Log']};
async function navigate(view){if(VIEW_PERMISSION[view]&&!can(VIEW_PERMISSION[view]))view=firstAllowedView();state.view=view;$('#sidebar').classList.remove('open');$$('#nav button[data-view]').forEach(x=>x.classList.toggle('active',x.dataset.view===view));const [eye,title]=VIEW_META[view]||['TODAYINFO',view];$('#viewEyebrow').textContent=eye;$('#viewTitle').textContent=title;$('#content').innerHTML='<div class="empty">Loading…</div>';try{await renderers[view]()}catch(err){$('#content').innerHTML=`<div class="error-box">${esc(err.message)}</div>`}}

function metric(label,value,note=''){return`<div class="metric"><small>${esc(label)}</small><strong>${Number(value||0).toLocaleString()}</strong>${note?`<em>${esc(note)}</em>`:''}</div>`}
function bars(obj={}){const entries=Object.entries(obj);const max=Math.max(1,...entries.map(([,v])=>Number(v)||0));return`<div class="bar-chart">${entries.length?entries.map(([k,v])=>`<div class="bar-row"><span>${esc(k.replaceAll('_',' '))}</span><div class="bar-track"><div class="bar-fill" style="width:${Math.max(2,(Number(v)/max)*100)}%"></div></div><b>${Number(v).toLocaleString()}</b></div>`).join(''):'<div class="empty">No data yet.</div>'}</div>`}
const badge=(text,cls='')=>`<span class="badge ${esc(cls||text)}">${esc(text)}</span>`;

function editorLimits(){return state.constraints?.limits||{title:220,slug:180,summary:2000,category:160,tag:120,tags:30,seo_title:220,seo_description:1000,link_title:240,document_title:240,topic_title:240,topic_body:150000,type_text:240,type_long_text:100000,url:2048}}
function seoGuide(){return state.constraints?.seo||{title_recommended:60,description_recommended:160}}
const fieldLabel=path=>({
  title:'Title',slug:'SEO-friendly slug',summary:'Short description / excerpt',category:'Category',tags:'Tags',
  seo_title:'SEO title',seo_description:'SEO description',main_image_url:'Main image URL',body_markdown:'Page content',
  related_links:'Related links',recommendation_links:'Recommendations',navigation_links:'Navigation links',topics:'Topics / sections'
}[String(path||'').split('.')[0]]||String(path||'').replaceAll('_',' '));

function fieldForPath(form,path=''){
  const parts=String(path).split('.'),root=parts[0],index=Number(parts[1]);
  if(root==='tags')return form.querySelector('[name="tags"]');
  if(root==='related_links'&&Number.isInteger(index))return form.querySelectorAll('.related-link-row')[index]?.querySelector(parts[2]==='url'?'.rl-url':'.rl-title');
  if(root==='recommendation_links'&&Number.isInteger(index))return form.querySelectorAll('.recommendation-link-row')[index]?.querySelector(parts[2]==='url'?'.rl-url':'.rl-title');
  if(root==='navigation_links'&&Number.isInteger(index))return form.querySelectorAll('.nav-link-row')[index]?.querySelector(parts[2]==='url'?'.rl-url':'.rl-title');
  if(root==='topics'&&Number.isInteger(index))return form.querySelectorAll('.topic-card')[index]?.querySelector(parts[2]==='body'?'.topic-body':'.topic-title');
  return form.querySelector(`[name="${CSS.escape(root)}"]`);
}
function clearEditorValidation(form){
  form.querySelectorAll('.field.invalid').forEach(x=>x.classList.remove('invalid'));
  form.querySelectorAll('[aria-invalid="true"]').forEach(x=>x.removeAttribute('aria-invalid'));
  form.querySelectorAll('.inline-field-error').forEach(x=>x.remove());
  const box=form.querySelector('#formError');if(box){box.classList.add('hidden');box.innerHTML=''}
}
function markEditorField(form,path,message){
  const el=fieldForPath(form,path);if(!el)return;
  el.setAttribute('aria-invalid','true');const label=el.closest('.field');label?.classList.add('invalid');
  if(label&&!label.querySelector('.inline-field-error')){
    const error=document.createElement('small');error.className='inline-field-error';error.textContent=message;label.appendChild(error);
  }
}
function showEditorValidation(form,issues=[]){
  clearEditorValidation(form);
  if(!issues.length)return true;
  for(const issue of issues)markEditorField(form,issue.path,issue.message);
  const box=form.querySelector('#formError');
  box.innerHTML=`<strong>Please fix ${issues.length} field${issues.length===1?'':'s'} before saving.</strong><ul>${issues.map(x=>`<li><b>${esc(fieldLabel(x.path))}:</b> ${esc(x.message)}</li>`).join('')}</ul>`;
  box.classList.remove('hidden');
  const first=fieldForPath(form,issues[0].path);(first||box).scrollIntoView({behavior:'smooth',block:'center'});first?.focus();
  return false;
}
function wireLengthCounters(root){
  root.querySelectorAll('input[maxlength],textarea[maxlength]').forEach(el=>{
    const label=el.closest('.field');if(!label||label.querySelector(`.field-counter[data-for="${el.name||el.className}"]`))return;
    const counter=document.createElement('span');counter.className='field-counter';counter.dataset.for=el.name||el.className;
    const recommended=Number(el.dataset.recommended||0);
    const update=()=>{
      const n=el.value.length,max=Number(el.maxLength||0);counter.textContent=`${n.toLocaleString()} / ${max.toLocaleString()}${recommended?` · ${recommended} recommended`:''}`;
      counter.classList.toggle('near-limit',max>0&&n>=max*.85);counter.classList.toggle('over-recommended',recommended>0&&n>recommended);
    };
    el.addEventListener('input',update);update();label.appendChild(counter);
  });
}
function updateTagPreview(form){
  const input=form.querySelector('[name="tags"]'),preview=form.querySelector('#tagPreview');if(!input||!preview)return [];
  const L=editorLimits(),tags=splitList(input.value),tooLong=tags.filter(t=>t.length>L.tag);
  preview.innerHTML=tags.length?tags.map(t=>`<span class="chip ${t.length>L.tag?'chip-error':''}">#${esc(t)} <small>${t.length}</small></span>`).join(''):'<span class="muted">No tags yet.</span>';
  return[
    ...(tags.length>L.tags?[{path:'tags',message:`Use at most ${L.tags} tags; you currently have ${tags.length}.`}]:[]),
    ...tooLong.map(t=>({path:'tags',message:`Tag “${t.slice(0,50)}${t.length>50?'…':''}” is ${t.length} characters; maximum is ${L.tag}.`}))
  ];
}
function updateSeoPreview(form){
  const title=form.querySelector('[name="seo_title"]')?.value.trim()||form.querySelector('[name="title"]')?.value.trim()||'Page title';
  const description=form.querySelector('[name="seo_description"]')?.value.trim()||form.querySelector('[name="summary"]')?.value.trim()||'Add a useful description for search results.';
  const slug=form.querySelector('[name="slug"]')?.value.trim()||'your-page-slug';
  const box=form.querySelector('#seoPreview');if(!box)return;
  box.innerHTML=`<small>todayinfo.com/…/${esc(slug)}</small><strong>${esc(title)}</strong><p>${esc(description.slice(0,220))}${description.length>220?'…':''}</p>`;
}
function clientEditorIssues(form){
  const L=editorLimits(),issues=[...updateTagPreview(form)];
  const check=(name,max,label)=>{const el=form.querySelector(`[name="${name}"]`);if(el&&el.value.length>max)issues.push({path:name,message:`${label} is ${el.value.length} characters; maximum is ${max}.`})};
  check('title',L.title,'Title');check('slug',L.slug,'Slug');check('summary',L.summary,'Summary');check('category',L.category,'Category');check('seo_title',L.seo_title,'SEO title');check('seo_description',L.seo_description,'SEO description');
  return issues;
}


const renderers={
  async overview(){const d=await api('/dashboard');$('#navImportCount').textContent=d.cards.raw_imports_waiting||0;$('#navDemandCount').textContent=d.cards.highest_priority||0;const totalB=(d.cards.open_bursaries||0)+(d.cards.closed_bursaries||0);const pct=totalB?Math.round(d.cards.open_bursaries/totalB*100):0;const priority=d.priority_imports||[];$('#content').innerHTML=`
    <div class="hero-strip"><section class="hero-card"><div class="hero-glow"></div><p class="eyebrow">TODAYINFO PUBLISHING ENGINE</p><h1>See demand. Fetch smarter. Publish cleaner.</h1><p>Published content stays public. New source discoveries stay private until TodayInfo cleans them, while visitor clicks tell you what should be handled first.</p><div class="workflow"><span>Discover</span><span>Prioritize</span><span>Fetch</span><span>Publish</span><span>Measure</span></div></section><section class="signal-card"><p class="eyebrow">SYSTEM STATUS</p><div class="signal"><div class="status-orb"></div><div><strong>Managed + demand aware</strong><small>80%+ clean imports can publish automatically. Clicked missing content becomes highest priority.</small></div></div><button class="soft" id="overviewDemand">⚡ Open demand queue</button></section></div>
    <div class="cards">${metric('Published pages',d.cards.published_posts,'live API content')}${metric('Open bursaries',d.cards.open_bursaries,'date-driven')}${metric('Visitors today',d.cards.visitors_today)}${metric('Searches today',d.cards.searches_today)}${metric('Application clicks',d.cards.application_clicks_today)}${metric('Related clicks',d.cards.related_clicks_today)}${metric('Waiting imports',d.cards.raw_imports_waiting,'private')}${metric('Highest priority',d.cards.highest_priority,'visitor-requested')}</div>
    <div class="grid2"><section class="panel chart-panel"><div class="panel-head"><div><p class="eyebrow">OPPORTUNITIES</p><h3>Bursary status</h3></div><span class="chart-kicker">${totalB} total</span></div><div class="donut-wrap"><div class="donut" style="--pct:${pct}%"><strong>${pct}%</strong></div><div class="donut-legend"><div class="legend-row"><span class="dot"></span><span>Open</span><b>${d.cards.open_bursaries||0}</b></div><div class="legend-row"><span class="dot dim"></span><span>Closed</span><b>${d.cards.closed_bursaries||0}</b></div></div></div></section><section class="panel chart-panel"><div class="panel-head"><div><p class="eyebrow">PUBLISHING</p><h3>Content mix</h3></div><span class="chart-kicker">${d.cards.published_posts||0} live</span></div>${bars(d.content_mix)}</section></div>
    <div class="grid2" style="margin-top:16px"><section class="panel"><div class="panel-head"><div><p class="eyebrow">USER DEMAND</p><h3>What should we fetch next?</h3></div><button class="ghost" id="overviewDemand2">View all</button></div>${priority.length?`<div class="priority-list">${priority.slice(0,6).map(x=>`<div class="priority-row ${x.priority}"><div><span class="priority-flag">${esc(x.priority)}</span><strong>${esc(x.prepared_draft?.title||x.source_payload?.title||x.source_slug||'Discovered content')}</strong><small>${Number(x.demand_clicks||0)} user click(s) · ${esc(x.source_name||'source')}</small></div><b>${Number(x.priority_score||0).toLocaleString()}</b></div>`).join('')}</div>`:'<div class="empty">No missing-content demand yet.</div>'}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">PERFORMANCE</p><h3>Top content</h3></div></div>${d.top_posts?.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Title</th><th>Type</th><th>Views</th><th>Reads</th></tr></thead><tbody>${d.top_posts.map(p=>`<tr><td><strong>${esc(p.title)}</strong></td><td>${badge(p.content_type,p.content_type)}</td><td>${p.views}</td><td>${p.reads}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No published analytics yet.</div>'}</section></div>`;$('#overviewDemand').onclick=$('#overviewDemand2').onclick=()=>navigate('demand')},

  async sources(){
    const hub=await api('/sources/hub');
    const categories=hub.categories||[];
    const activeHarvest=(hub.sources||[]).filter(x=>x.action?.type==='harvest'&&x.integration_status==='active');
    const statusLabel=s=>({active:'Active',discovery:'Discovery',credentials_required:'Needs credentials',licence_required:'Licence required'}[s]||String(s||'Catalogued').replaceAll('_',' '));
    const sourceCard=x=>`<article class="source-catalog-card" data-source-card data-source-id="${esc(x.id)}" data-hay="${esc([x.label,x.category,x.region,...(x.content_types||[])].join(' ').toLowerCase())}">
      <div class="source-card-top"><div class="source-logo">${esc((x.label||'TI').split(/\s+/).slice(0,2).map(v=>v[0]).join('').toUpperCase())}</div><div class="grow"><div class="source-card-labels"><span class="source-status ${esc(x.integration_status)}">${esc(statusLabel(x.integration_status))}</span><span class="source-mode">${esc(String(x.mode||'source').replaceAll('_',' '))}</span></div><h3>${esc(x.label)}</h3><p>${esc(x.description||'')}</p></div></div>
      <div class="source-meta"><span>${esc(x.region||'Global')}</span><span>${esc((x.content_types||[]).join(' · ')||'mixed content')}</span></div>
      <div class="source-stats"><span><b>${Number(x.stats?.imports||0)}</b> imports</span><span><b>${Number(x.stats?.published||0)}</b> published</span><span><b>${Number(x.stats?.average_quality||0)}%</b> avg clean</span></div>
      <div class="source-actions">${x.action?.type==='fetch'&&can('imports.fetch')?`<button class="primary run-source" data-id="${esc(x.id)}">Fetch now</button>`:''}${x.action?.type==='harvest'&&can('imports.fetch')?`<button class="ghost choose-harvest" data-id="${esc(x.id)}">Use in harvest</button>`:''}<a class="ghost source-home" href="${esc(x.homepage||'#')}" target="_blank" rel="noopener noreferrer">Source ↗</a></div>
    </article>`;
    $('#content').innerHTML=`
      <div class="source-hub-hero"><div><p class="eyebrow">SOURCE INTELLIGENCE</p><h1>One hub, many source families.</h1><p>TodayInfo now categorizes sources by origin and capability. Active integrations can fetch immediately; research, credential and licence-dependent sources remain clearly separated so the system never pretends they are live.</p></div><div class="source-summary-grid"><div><small>Catalogued</small><strong>${hub.totals?.sources||0}</strong></div><div><small>Active</small><strong>${hub.totals?.active||0}</strong></div><div><small>Discovery</small><strong>${hub.totals?.discovery||0}</strong></div><div><small>Permanent records</small><strong>${hub.totals?.permanent_records||80}</strong></div></div></div>
      <div class="source-toolbar"><input id="sourceSearch" class="search" placeholder="Search source, region or content type"><select id="sourceCategory" class="search"><option value="">All categories</option>${categories.map(c=>`<option value="${esc(c.id)}">${esc(c.label)}</option>`).join('')}</select><select id="sourceStatus" class="search"><option value="">All statuses</option><option value="active">Active</option><option value="discovery">Discovery</option><option value="credentials_required">Needs credentials</option><option value="licence_required">Licence required</option></select></div>
      <div id="sourceCategories">${categories.map(c=>`<section class="panel source-category" data-category="${esc(c.id)}"><div class="panel-head"><div><p class="eyebrow">SOURCE CATEGORY</p><h3>${esc(c.label)}</h3><p class="panel-sub">${esc(c.description)}</p></div><span class="chart-kicker">${c.sources?.length||0} sources</span></div><div class="source-catalog-grid">${(c.sources||[]).map(sourceCard).join('')}</div></section>`).join('')}</div>
      ${can('imports.fetch')?`<section class="panel global-harvest-panel"><div class="panel-head"><div><p class="eyebrow">ACTIVE HARVEST</p><h3>Fetch public job APIs & employer boards</h3><p class="panel-sub">Every result is normalized, deduplicated and sent through TodayInfo's 80%+ publishing gate. Employer-board fields are optional until that provider is selected.</p></div></div><form id="harvestForm" class="harvest-form"><div class="harvest-target"><label class="field">Target records<input name="target" type="number" min="1" max="5000" value="1000"></label><label class="field">Recent within<input name="maxAgeDays" type="number" min="1" max="120" value="60"><small>days</small></label></div><div class="provider-grid">${activeHarvest.map(x=>`<label class="provider-option"><input type="checkbox" name="provider" value="${esc(x.id)}" ${['arbeitnow','jobicy'].includes(x.id)?'checked':''}><span><strong>${esc(x.label)}</strong><small>${esc(String(x.mode||'public source').replaceAll('_',' '))} · attribution/source retained</small></span></label>`).join('')}</div><div class="form-grid optional-boards"><label class="field wide">Lever board slugs<input name="leverSites" placeholder="company-one, company-two"></label><label class="field wide">Ashby board names<input name="ashbyBoards" placeholder="CompanyOne, CompanyTwo"></label><label class="field wide">Greenhouse board tokens<input name="greenhouseBoards" placeholder="stripe, example-board"></label><label class="field wide">Workable account subdomains<input name="workableAccounts" placeholder="company-one, company-two"></label><label class="field wide">SmartRecruiters company identifiers<input name="smartRecruitersCompanies" placeholder="company-one, company-two"></label></div><label class="preview-check"><input name="autoPublish" type="checkbox" checked><span>Auto-publish records that pass the 80%+ cleanliness and hard publishing checks<small>Everything else remains private in Import Inbox.</small></span></label><div class="harvest-actions"><button type="submit" class="primary" id="harvestRun">Start harvest</button><button type="button" class="ghost" id="openImportsFromSources">Open Import Inbox</button></div><div id="harvestResult" class="harvest-result hidden"></div></form></section>`:''}`;

    const filterSources=()=>{const q=$('#sourceSearch').value.trim().toLowerCase(),category=$('#sourceCategory').value,status=$('#sourceStatus').value;$$('[data-source-card]').forEach(card=>{const source=(hub.sources||[]).find(x=>card.querySelector('.run-source,.choose-harvest')?.dataset.id===x.id)||null;const matchQ=!q||card.dataset.hay.includes(q);const parent=card.closest('[data-category]');const matchCategory=!category||parent?.dataset.category===category;const sourceId=card.dataset.sourceId;const item=(hub.sources||[]).find(x=>x.id===sourceId)||null;const matchStatus=!status||item?.integration_status===status;card.hidden=!(matchQ&&matchCategory&&matchStatus)});$$('.source-category').forEach(section=>section.hidden=![...section.querySelectorAll('[data-source-card]')].some(x=>!x.hidden))};
    $('#sourceSearch').oninput=filterSources;$('#sourceCategory').onchange=filterSources;$('#sourceStatus').onchange=filterSources;
    $$('.run-source').forEach(btn=>btn.onclick=async()=>{const source=(hub.sources||[]).find(x=>x.id===btn.dataset.id);if(!source?.action?.fetch)return;const old=btn.textContent;btn.disabled=true;btn.textContent='Fetching…';try{const r=await api('/imports/fetch',{method:'POST',body:source.action.fetch});toast(`${source.label}: ${r.inserted||0} new · ${r.relatedPagesFetched||0} related · ${r.auto_publish?.published?.length||0} published`);await navigate('imports')}catch(err){toast(err.message,true);btn.disabled=false;btn.textContent=old}});
    $$('.choose-harvest').forEach(btn=>btn.onclick=()=>{const input=$(`#harvestForm input[name="provider"][value="${CSS.escape(btn.dataset.id)}"]`);if(input){input.checked=true;$('#harvestForm').scrollIntoView({behavior:'smooth',block:'start'});toast(`${btn.dataset.id} selected for harvest`)}});
    $('#openImportsFromSources')?.addEventListener('click',()=>navigate('imports'));
    if($('#harvestForm'))$('#harvestForm').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,fd=new FormData(form);const providers=fd.getAll('provider');if(!providers.length)return toast('Choose at least one active source',true);const body={target:Number(fd.get('target')||1000),maxAgeDays:Number(fd.get('maxAgeDays')||60),providers,leverSites:splitList(fd.get('leverSites')),ashbyBoards:splitList(fd.get('ashbyBoards')),greenhouseBoards:splitList(fd.get('greenhouseBoards')),workableAccounts:splitList(fd.get('workableAccounts')),smartRecruitersCompanies:splitList(fd.get('smartRecruitersCompanies')),autoPublish:fd.get('autoPublish')==='on'};const button=$('#harvestRun'),box=$('#harvestResult');button.disabled=true;button.textContent='Harvesting…';box.classList.remove('hidden');box.innerHTML='<span class="sync-spinner"></span><div><strong>Harvest running</strong><small>Fetching, normalizing and deduplicating public listings.</small></div>';try{const r=await api('/harvest/global',{method:'POST',body});box.innerHTML=`<div><strong>${Number(r.accepted||0).toLocaleString()} accepted</strong><small>${Number(r.published?.length||0).toLocaleString()} published · ${Number(r.review?.length||0).toLocaleString()} kept for review</small></div>`;toast(`Harvest complete: ${r.accepted||0} accepted · ${r.published?.length||0} published`)}catch(err){box.innerHTML=`<div><strong>Harvest stopped</strong><small>${esc(err.message)}</small></div>`;toast(err.message,true)}finally{button.disabled=false;button.textContent='Start harvest'}};
  },

  async demand(){const rows=await api('/imports/priority?limit=200');const highest=rows.filter(x=>x.priority==='highest').length;$('#navDemandCount').textContent=highest;$('#content').innerHTML=`
    <div class="import-hero demand-hero"><div><p class="eyebrow">AUDIENCE DEMAND</p><h2>Missing content users actually want</h2><p>TodayInfo remembers opportunity links found in DailyUpdate, ZA Bursaries and related content. If a visitor clicks a missing link, it becomes HIGHEST PRIORITY here.</p></div><button class="primary" id="demandSync">↻ Deep sync sources</button></div>
    <div class="cards import-stats">${metric('Highest priority',highest,'clicked by users')}${metric('High priority',rows.filter(x=>x.priority==='high').length,'clean or changed')}${metric('Draft leads',rows.length,'private')}${metric('Demand clicks',rows.reduce((n,x)=>n+Number(x.demand_clicks||0),0),'missing-content clicks')}</div>
    <section class="panel"><div class="panel-head"><div><h3>Priority queue</h3><p class="panel-sub">Clicked missing content always sorts first. Fetching a lead runs it through the source-specific cleaner and the 80% auto-publish gate.</p></div></div><div class="table-wrap"><table class="table"><thead><tr><th>Priority</th><th>Missing content</th><th>Type</th><th>Clicks</th><th>Clean</th><th>Last click</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr class="priority-table-row ${x.priority}"><td><span class="priority-flag">${esc(x.priority)}</span></td><td><strong>${esc(x.prepared_draft?.title||x.source_payload?.title||x.source_slug||'Discovered content')}</strong><small>${esc(x.source_url||'')}</small></td><td>${badge(x.detected_type||'other',x.detected_type||'other')}</td><td><strong>${Number(x.demand_clicks||0)}</strong></td><td>${Number(x.quality_score||0)}%</td><td>${fmtDate(x.last_clicked_at)}</td><td><div class="table-actions"><button class="primary fetch-demand" data-id="${x.id}">Fetch & process</button><button class="ghost review-demand" data-id="${x.id}">Review</button></div></td></tr>`).join('')}</tbody></table></div></section>`;
    $('#demandSync').onclick=openFetch;
    $('#content').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const row=rows.find(x=>x.id===b.dataset.id);if(!row)return;try{if(b.classList.contains('review-demand')){openImportReview(await api(`/imports/${row.id}`));return}if(b.classList.contains('fetch-demand')){b.disabled=true;b.textContent='Fetching…';const r=await api('/imports/fetch',{method:'POST',body:{kind:'url',url:row.source_url,maxPages:1,expand:true,autoPublish:true}});const n=r.auto_publish?.published?.length||0;toast(n?`Fetched and published ${n} item(s)`:'Fetched into Import Inbox for review');await renderers.demand()}}catch(err){toast(err.message,true);await renderers.demand()}}
  },

  async imports(){
    const rows=await api('/imports');
    const waiting=rows.filter(x=>x.review_status==='unreviewed').length;
    const changed=rows.filter(x=>x.source_changed).length;
    const promoted=rows.filter(x=>x.review_status==='promoted').length;
    const remembered=rows.filter(x=>Number(x.fetch_count||1)>1).length;
    $('#navImportCount').textContent=waiting;
    $('#content').innerHTML=`
      <div class="import-hero">
        <div><p class="eyebrow">SOURCE MEMORY</p><h2>Deep Sync Import Inbox</h2><p>Fetch up to 100 source pages. TodayInfo remembers previously seen records, preserves your review state, and highlights source changes instead of duplicating work.</p></div>
        <button class="primary" id="fetchBtn">↻ Deep sync source</button>
      </div>
      <div class="cards import-stats">
        ${metric('Remembered imports',rows.length,'stored across syncs')}
        ${metric('Waiting review',waiting,'private')}
        ${metric('Changed at source',changed,'needs attention')}
        ${metric('Seen more than once',remembered,'deduplicated')}
        ${metric('Promoted',promoted,'draft or published')}
      </div>
      <div class="toolbar"><input id="importSearch" class="search" placeholder="Search imported title, source or URL"><select id="importStatus" class="search" style="flex:0 0 170px"><option value="">All statuses</option><option>unreviewed</option><option>reviewing</option><option>promoted</option></select></div>
      <section class="panel"><div class="panel-head"><div><h3>Private Import Inbox</h3><p class="panel-sub">Latest source records appear first. Archive, tag, category and pagination pages are filtered before review.</p></div></div><div id="importList" class="source-grid"></div></section>`;

    const render=(list)=>{
      $('#importList').innerHTML=list.length?list.map(x=>{
        const p=x.prepared_draft||{};
        const score=Number(x.quality_score||0);
        const memory=Number(x.fetch_count||1);
        return `<article class="source-card import-card ${x.source_changed?'changed-source':''}">
          <div class="grow">
            <div class="import-badges">${badge(x.detected_type||'other',x.detected_type||'other')}${badge(x.review_status)}${x.source_changed?badge('source changed','closing_soon'):''}<span class="quality-pill q${Math.floor(score/20)}">${score}% clean</span></div>
            <h4>${esc(p.title||x.source_payload?.title||'Untitled')}</h4>
            <p>${esc(x.source_name||'Source')} · ${esc(x.source_slug||'no source slug')}</p>
            <div class="import-meta"><span>Seen ${memory}×</span><span>Last seen ${fmtDate(x.last_seen_at||x.updated_at)}</span>${x.source_record_date?`<span>Source date ${fmtDate(x.source_record_date)}</span>`:''}</div>
            ${x.quality_issues?.length?`<small class="quality-note">${esc(x.quality_issues.slice(0,2).join(' · '))}</small>`:''}
          </div>
          <div class="actions"><button class="ghost review-import" data-id="${x.id}">Review</button>${x.review_status!=='promoted'?`<button class="primary promote-import" data-id="${x.id}">Promote</button>`:''}</div>
        </article>`;
      }).join(''):'<div class="empty wide">Nothing matches this filter.</div>'
    };

    render(rows);
    const filter=()=>{const q=$('#importSearch').value.toLowerCase(),s=$('#importStatus').value;render(rows.filter(x=>(!s||x.review_status===s)&&(!q||JSON.stringify(x).toLowerCase().includes(q))))};
    $('#importSearch').oninput=filter;$('#importStatus').onchange=filter;$('#fetchBtn').onclick=openFetch;
    $('#importList').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.id;try{if(b.classList.contains('promote-import')){const post=await api(`/imports/${id}/promote`,{method:'POST',body:{}});toast('Promoted to a private draft');await renderers.imports();openPostEditor(post)}else if(b.classList.contains('review-import'))openImportReview(rows.find(x=>x.id===id))}catch(err){toast(err.message,true)}}
  },

  async posts(){
    state.posts=await api('/posts?include_deleted=true');
    const countries=[...new Map(state.posts.map(p=>[p.geo?.country_code||'',p.geo?.country_name||p.geo?.country_code||'']).filter(x=>x[0])).entries()].sort((a,b)=>String(a[1]).localeCompare(String(b[1])));
    const sources=[...new Set(state.posts.map(p=>p.source?.source_name).filter(Boolean))].sort();
    $('#content').innerHTML=`
      <div class="library-hero"><div><p class="eyebrow">CONTENT LIBRARY</p><h2>Find anything without digging.</h2><p>Filter by country, content type, publishing state, opportunity state or source. The filters work together.</p></div><button class="primary" id="createPost">＋ Create content</button></div>
      <div class="filter-deck">
        <label><span>Search</span><input id="postSearch" class="search" placeholder="Title, tag, organisation…"></label>
        <label><span>Country</span><select id="postCountry" class="search"><option value="">All countries</option>${countries.map(([code,name])=>`<option value="${esc(code)}">${esc(name)} (${esc(code)})</option>`).join('')}</select></label>
        <label><span>Type</span><select id="postType" class="search"><option value="">All types</option>${Object.entries(state.contentTypes).map(([k,v])=>`<option value="${k}">${esc(v.label)}</option>`).join('')}</select></label>
        <label><span>Publishing</span><select id="postStatus" class="search"><option value="">All statuses</option><option>draft</option><option>published</option><option>archived</option><option>trash</option></select></label>
        <label><span>Opportunity</span><select id="opStatus" class="search"><option value="">Any opportunity state</option><option value="open">Open</option><option value="closing_soon">Closing soon</option><option value="closed">Closed</option><option value="upcoming">Upcoming</option><option value="unknown">Unknown</option></select></label>
        <label><span>Source</span><select id="postSource" class="search"><option value="">All sources</option>${sources.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select></label>
        <label><span>Sort</span><select id="postSort" class="search"><option value="updated">Recently updated</option><option value="closing">Closing soonest</option><option value="views">Most viewed</option><option value="country">Country A–Z</option></select></label>
        <button id="clearPostFilters" class="ghost filter-clear" type="button">Clear filters</button>
      </div>
      <section class="panel"><div class="panel-head"><div><h3>Content Library</h3><p class="panel-sub" id="postCount"></p></div></div><div id="postTable"></div></section>`;

    const render=list=>{
      $('#postCount').textContent=`${list.length.toLocaleString()} of ${state.posts.length.toLocaleString()} records`;
      $('#postTable').innerHTML=list.length?`<div class="table-wrap"><table class="table content-table"><thead><tr><th>Content</th><th>Country</th><th>Type</th><th>Opportunity</th><th>Status</th><th>Source</th><th>Views</th><th>Updated</th><th></th></tr></thead><tbody>${list.map(p=>`<tr><td><strong>${esc(p.title)}</strong><small>/${esc(p.slug)}</small><div class="mini-tags">${(p.tags||[]).slice(0,3).map(t=>`<span class="chip">#${esc(t)}</span>`).join('')}</div></td><td><span class="country-pill">${esc(p.geo?.country_code||'—')}</span><small>${esc(p.geo?.country_name||'')}</small></td><td>${badge(p.content_type,p.content_type)}</td><td>${badge(adminOpportunityStatus(p),adminOpportunityStatus(p))}</td><td>${badge(p.status,p.status)}</td><td><span class="source-name">${esc(p.source?.source_name||'Manual')}</span></td><td>${Number(p.views||0).toLocaleString()}</td><td>${fmtDate(p.updated_at)}</td><td><div class="table-actions"><button class="ghost edit-post" data-id="${p.id}">Edit</button>${p.status==='trash'?`<button class="icon-action restore-post soft" type="button" data-id="${p.id}" aria-label="Restore ${esc(p.title)}" title="Restore">${icon('restore')}</button>`:`<button class="icon-action trash-post danger" type="button" data-id="${p.id}" aria-label="Move ${esc(p.title)} to trash" title="Move to trash">${icon('trash')}</button>`}</div></td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No content matches these filters.</div>';
    };

    const filter=()=>{
      const q=$('#postSearch').value.toLowerCase(),country=$('#postCountry').value,type=$('#postType').value,status=$('#postStatus').value,opp=$('#opStatus').value,source=$('#postSource').value,sort=$('#postSort').value;
      let list=state.posts.filter(p=>
        (!country||p.geo?.country_code===country)&&(!type||p.content_type===type)&&(!status||p.status===status)&&
        (!opp||adminOpportunityStatus(p)===opp)&&(!source||(p.source?.source_name||'')===source)&&
        (!q||`${p.title} ${p.summary} ${p.classification?.organisation||''} ${(p.tags||[]).join(' ')} ${p.geo?.country_name||''}`.toLowerCase().includes(q))
      );
      if(sort==='views')list.sort((a,b)=>Number(b.views||0)-Number(a.views||0));
      else if(sort==='country')list.sort((a,b)=>String(a.geo?.country_name||'').localeCompare(String(b.geo?.country_name||'')));
      else if(sort==='closing')list.sort((a,b)=>String(a.type_data?.closing_date||'9999').localeCompare(String(b.type_data?.closing_date||'9999')));
      else list.sort((a,b)=>String(b.updated_at||'').localeCompare(String(a.updated_at||'')));
      render(list);
    };
    ['postSearch','postCountry','postType','postStatus','opStatus','postSource','postSort'].forEach(id=>{const el=$('#'+id);el[el.tagName==='INPUT'?'oninput':'onchange']=filter});
    $('#clearPostFilters').onclick=()=>{['postSearch','postCountry','postType','postStatus','opStatus','postSource'].forEach(id=>$('#'+id).value='');$('#postSort').value='updated';filter()};
    $('#createPost').onclick=()=>openTypePicker();
    filter();
    $('#postTable').onclick=async e=>{const b=e.target.closest('button');if(!b)return;const p=state.posts.find(x=>x.id===b.dataset.id);if(!p)return;try{if(b.classList.contains('edit-post'))openPostEditor(await api(`/posts/${p.id}`));else if(b.classList.contains('trash-post')){if(confirm(`Move “${p.title}” to trash?`)){await api(`/posts/${p.id}`,{method:'DELETE',body:{}});toast('Moved to trash');await renderers.posts()}}else if(b.classList.contains('restore-post')){await api(`/posts/${p.id}/restore`,{method:'POST',body:{}});toast('Restored as draft');await renderers.posts()}}catch(err){toast(err.message,true)}}
  },

  async media(){const rows=await api('/media');$('#content').innerHTML=`<section class="panel"><div class="panel-head"><div><h3>Media & Documents</h3><p class="panel-sub">Uploads work in demo mode. If SUPABASE_URL1 and SUPABASE_KEY are configured, Supabase Storage is used during testing too.</p></div><div class="actions"><button class="primary" id="mediaUploadBtn">＋ Upload</button></div></div><div class="media-grid">${rows.length?rows.map(m=>`<article class="media-card"><div class="media-thumb">${m.media_kind==='image'?`<img src="${esc(m.url)}" alt="">`:'<span style="font-size:2rem">📄</span>'}</div><div class="media-info"><strong>${esc(m.title||m.key)}</strong><small>${esc(m.mime_type||'file')} ${bytes(m.size_bytes)}</small><div style="margin-top:10px"><button class="ghost copy-url" data-url="${esc(m.url)}">Copy URL</button></div></div></article>`).join(''):'<div class="empty wide">No uploads yet.</div>'}</div></section>`;$('#mediaUploadBtn').onclick=()=>openMediaUpload();$$('.copy-url').forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(b.dataset.url);toast('URL copied')})},

  async analytics(){const a=await api('/analytics');const countries=Object.fromEntries((a.visitors_by_country||[]).slice(0,10).map(x=>[x.name||'Unknown',x.visitors??x.count??x.events??0]));const regions=Object.fromEntries((a.visitors_by_region||[]).slice(0,10).map(x=>[x.name||'Unknown',x.visitors??x.count??x.events??0]));const searches=Object.fromEntries((a.top_searches||[]).slice(0,10).map(x=>[x.query||x.name||'Unknown',x.count||0]));$('#content').innerHTML=`<div class="cards">${metric('Unique visitors',a.unique_visitors)}${metric('Views',a.totals?.view||0)}${metric('Reads',a.totals?.read||0)}${metric('Searches',a.totals?.search||0)}${metric('Application clicks',a.totals?.application_click||0)}${metric('Downloads',a.totals?.download||0)}${metric('Related clicks',(a.totals?.related_click||0)+(a.totals?.recommendation_click||0))}</div><div class="grid2"><section class="panel"><div class="panel-head"><div><p class="eyebrow">ENGAGEMENT</p><h3>Views by content type</h3></div></div>${bars(a.views_by_content_type)}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">TRAFFIC</p><h3>Events over last 30 days</h3></div></div>${bars(Object.fromEntries((a.daily||[]).slice(-12).map(x=>[String(x.date).slice(5,10),x.total])))}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">SEARCH INTENT</p><h3>Top searches</h3></div></div>${bars(searches)}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">GEOGRAPHY</p><h3>Visitors by country</h3></div></div>${bars(countries)}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">REGIONS</p><h3>Visitors by province / state / region</h3></div></div>${bars(regions)}</section><section class="panel"><div class="panel-head"><div><p class="eyebrow">POPULAR CONTENT</p><h3>Most viewed opportunities</h3></div></div>${a.popular_content?.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Title</th><th>Type</th><th>Views</th><th>Reads</th><th>Apply clicks</th></tr></thead><tbody>${a.popular_content.slice(0,10).map(p=>`<tr><td><strong>${esc(p.title)}</strong></td><td>${badge(p.content_type||'other',p.content_type||'other')}</td><td>${p.views||0}</td><td>${p.reads||0}</td><td>${p.application_clicks||0}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">Popular-content analytics will appear after traffic arrives.</div>'}</section></div>`},

  async team(){const [rows,roles]=await Promise.all([api('/team'),api('/roles')]);const employees=rows.filter(x=>!['owner'].includes(x.role));const totalCleaned=employees.reduce((n,x)=>n+Number(x.performance?.cleaned||0),0),totalPublished=employees.reduce((n,x)=>n+Number(x.performance?.published||0),0);$('#content').innerHTML=`
    <div class="team-hero"><div><p class="eyebrow">TODAYINFO TEAM</p><h2>Apo is CEO. Employees clean and publish.</h2><p>Productivity is calculated from audited actions, so cleaned and published counts cannot be manually edited by workers.</p></div><button class="primary" id="addWorker">＋ Add employee</button></div>
    <div class="cards">${metric('Employees',employees.length,'active + disabled')}${metric('Cleaned records',totalCleaned,'audited')}${metric('Published by employees',totalPublished,'audited')}${metric('Active employees',employees.filter(x=>x.active).length)}</div>
    <section class="panel"><div class="panel-head"><div><h3>People & output</h3><p class="panel-sub">Editors and Content Workers only see Import Inbox, Content Library and Media. Owner/CEO keeps full system access.</p></div></div><div class="table-wrap"><table class="table team-table"><thead><tr><th>Person</th><th>Role</th><th>Cleaned</th><th>Promoted</th><th>Published</th><th>Edited</th><th>Last activity</th><th>Status</th></tr></thead><tbody>${rows.map(u=>`<tr><td><strong>${esc(u.display_name)}</strong><small>@${esc(u.username)} · ${esc(u.email)}</small></td><td>${badge(u.role_label||u.role,u.role)}</td><td><strong>${Number(u.performance?.cleaned||0)}</strong></td><td>${Number(u.performance?.promoted||0)}</td><td><strong>${Number(u.performance?.published||0)}</strong></td><td>${Number(u.performance?.edited||0)}</td><td>${fmtDate(u.performance?.last_activity_at)}</td><td>${u.active?badge('active','published'):badge('disabled','closed')}</td></tr>`).join('')}</tbody></table></div></section>`;$('#addWorker').onclick=()=>openTeamEditor(roles)}

  async settings(){const s=await api('/settings');$('#content').innerHTML=`<section class="panel" style="max-width:900px"><div class="panel-head"><div><h3>Site Settings</h3><p class="panel-sub">Global identity and contact information used by the public API.</p></div></div><form id="settingsForm" class="form-grid"><label class="field">Site name<input name="site_name" value="${esc(s.site_name||'TodayInfo')}" required></label><label class="field">WhatsApp number<input name="whatsapp_number" value="${esc(s.whatsapp_number||'')}" placeholder="+27..."></label><label class="field">Contact email<input name="contact_email" type="email" value="${esc(s.contact_email||'')}"></label><label class="field">Main logo URL<input name="main_logo_url" value="${esc(s.main_logo_url||'')}"></label><label class="field">Dark-mode logo URL<input name="dark_logo_url" value="${esc(s.dark_logo_url||'')}"></label><label class="field">Favicon URL<input name="favicon_url" value="${esc(s.favicon_url||'')}"></label><label class="field wide">Default social image URL<input name="default_social_image_url" value="${esc(s.default_social_image_url||'')}"></label><div class="form-actions"><button class="primary">Save settings</button></div></form></section>`;$('#settingsForm').onsubmit=async e=>{e.preventDefault();try{await api('/settings',{method:'PATCH',body:Object.fromEntries(new FormData(e.currentTarget))});toast('Settings saved')}catch(err){toast(err.message,true)}}},

  async audit(){const rows=await api('/audit');$('#content').innerHTML=`<section class="panel"><div class="panel-head"><h3>Audit Log</h3></div><div class="audit-list">${rows.length?rows.map(a=>`<div class="audit-item"><div class="audit-time">${esc(new Date(a.created_at).toLocaleString())}</div><div><strong>${esc(a.action)}</strong><small>${esc(a.entity_type)} · ${esc(a.entity_id||'')}</small></div></div>`).join(''):'<div class="empty">No audit activity yet.</div>'}</div></section>`}
};

async function openFetch(){
  let presets=[];try{presets=await api('/source-presets')}catch(err){return toast(err.message,true)}
  const currentYear=new Date().getFullYear();
  modal('Deep sync TodayInfo source','IMPORT SOURCE',`<form id="fetchForm" class="form-grid">
    <label class="field wide">What do you want to fetch?<select name="preset">${presets.map(p=>`<option value="${esc(p.id)}">${esc(p.label)}</option>`).join('')}</select><small>Psychometric Test remains a dedicated tag source.</small></label>
    <label class="field">Year filter<input name="year" inputmode="numeric" value="${currentYear}" placeholder="${currentYear}"><small>Clear this field to fetch every year.</small></label>
    <label class="field">How deep should we sync?<select name="maxPages"><option value="10">10 source pages</option><option value="25">25 source pages</option><option value="50">50 source pages</option><option value="100" selected>100 source pages / everything available</option></select></label>
    <label class="field wide preview-check"><input name="expandRelated" type="checkbox" checked><span>Follow useful related opportunity pages<small>TodayInfo will fetch related DailyUpdate/ZA Bursaries detail pages instead of storing only the directory/index page.</small></span></label><label class="field wide preview-check"><input name="autoPublish" type="checkbox" checked><span>Auto-publish clean imports scoring 80% or higher<small>Expired items, missing source links, missing required fields, or missing application routes are still blocked and left in the Import Inbox.</small></span></label>
    <div class="wide notice">Each source page requests up to 100 records. Existing imports are remembered by source key; reviewed and promoted states are preserved. Source patterns also improve the rule-based import memory over time.</div>
    <div id="syncProgress" class="wide sync-progress hidden"><span class="sync-spinner"></span><div><strong>Syncing source…</strong><small>Large syncs can take longer. Keep this dialog open until the result appears.</small></div></div>
    <div class="form-actions"><button type="button" class="ghost" id="cancelFetch">Cancel</button><button class="primary" id="syncSubmit">Start deep sync</button></div>
  </form>`);
  $('#cancelFetch').onclick=closeModal;
  $('#fetchForm').onsubmit=async e=>{
    e.preventDefault();
    const f=new FormData(e.currentTarget),p=presets.find(x=>x.id===f.get('preset'));
    const body={kind:p?.kind||(p?.id||'pages'),year:f.get('year')||undefined,maxPages:Number(f.get('maxPages')||100),expand:true,expandRelated:f.get('expandRelated')==='on',relatedLimit:150,autoPublish:f.get('autoPublish')==='on'};
    if(p?.tagSlug)body.tagSlug=p.tagSlug;
    const submit=$('#syncSubmit');submit.disabled=true;submit.textContent='Syncing…';$('#syncProgress').classList.remove('hidden');
    try{
      const r=await api('/imports/fetch',{method:'POST',body});
      const published=r.auto_publish?.published?.length||0,skipped=r.auto_publish?.skipped?.length||0;
      toast(`Sync complete: ${r.inserted||0} new · ${r.changed||0} changed · ${r.unchanged||0} remembered${published?` · ${published} auto-published`:''}${skipped?` · ${skipped} kept for review`:''}`);
      closeModal();await navigate('imports');
    }catch(err){
      submit.disabled=false;submit.textContent='Start deep sync';$('#syncProgress').classList.add('hidden');toast(err.message,true);
    }
  }
}

function openImportReview(row){const d=row.prepared_draft||{};modal('Review imported content','PRIVATE IMPORT',`<div class="editor-shell"><div class="notice">This is source data only. Promote it to create a private draft, then clean and publish from the structured editor. Source recommendations found during fetching are kept with the draft.</div><section class="editor-section"><div class="editor-section-head"><span class="section-number">1</span><div><h4>Source</h4><p>${esc(row.source_name||'')}</p></div></div><div class="editor-section-body form-grid"><label class="field">Detected type<select id="importType">${Object.entries(state.contentTypes).map(([k,v])=>`<option value="${k}" ${k===row.detected_type?'selected':''}>${esc(v.label)}</option>`).join('')}</select></label><label class="field">Source slug<input value="${esc(row.source_slug||'')}" readonly></label><label class="field wide">Prepared title<input value="${esc(d.title||'')}" readonly></label><label class="field wide">Prepared summary<textarea readonly>${esc(d.summary||'')}</textarea></label><label class="field wide">Source URL<input value="${esc(row.source_url||'')}" readonly></label><div class="field wide"><span>Fetched recommendations</span><div class="fetched-recommendations">${(d.recommendation_links||[]).length?(d.recommendation_links||[]).map(x=>`<div class="relation-card"><div class="grow"><strong>${esc(x.title)}</strong><small>${esc(x.url)}</small></div></div>`).join(''):'<div class="notice">No source recommendations were detected for this item.</div>'}</div></div></div></section><div class="form-actions"><button class="primary" id="promoteImport">Promote to private draft</button></div></div>`);$('#importType').onchange=async e=>{try{await api(`/imports/${row.id}`,{method:'PATCH',body:{detected_type:e.target.value,prepared_draft:{...d,content_type:e.target.value}}});toast('Type updated')}catch(err){toast(err.message,true)}};$('#promoteImport').onclick=async()=>{try{const post=await api(`/imports/${row.id}/promote`,{method:'POST',body:{}});toast('Promoted to private draft');closeModal();openPostEditor(post)}catch(err){toast(err.message,true)}}}

async function openTypePicker(){await loadContentTypes();modal('What would you like to update?','NEW CONTENT',`<form id="typeStartForm" class="form-grid"><label class="field wide">What would you like to update?<select id="startType" required><option value="">Choose one…</option><option value="bursary">Bursary</option><option value="news">News</option><option value="job">Job</option><option value="other-group">Other supported content</option></select><small>Only the fields relevant to your choice will appear in the editor.</small></label><label class="field wide hidden" id="otherTypeWrap">Choose the other content type<select id="otherType"><option value="internship">Internship</option><option value="learnership">Learnership</option><option value="announcement">Announcement</option><option value="story">Story</option><option value="other">Other / flexible page</option></select></label><div class="wide" id="typePreview"><div class="notice">Choose a content type to continue.</div></div><div class="form-actions"><button type="button" class="ghost" id="typeCancel">Cancel</button><button class="primary">Continue to editor →</button></div></form>`);const sel=$('#startType'),wrap=$('#otherTypeWrap'),other=$('#otherType'),preview=$('#typePreview');const update=()=>{wrap.classList.toggle('hidden',sel.value!=='other-group');const type=sel.value==='other-group'?other.value:sel.value;const d=state.contentTypes[type];preview.innerHTML=d?`<div class="source-card"><span class="type-icon" style="font-size:1.6rem">${d.icon||'◫'}</span><div class="grow"><h4>${esc(d.label)}</h4><p>${esc(d.description||'')}</p></div></div>`:'<div class="notice">Choose a content type to continue.</div>'};sel.onchange=update;other.onchange=update;$('#typeCancel').onclick=closeModal;$('#typeStartForm').onsubmit=e=>{e.preventDefault();if(!sel.value)return toast('Choose what you would like to update',true);const type=sel.value==='other-group'?other.value:sel.value;openPostEditor({content_type:type,status:'draft',tags:[],topics:[],related_links:[],related_ids:[],recommendation_ids:[],recommendation_links:[],documents:[],navigation_links:[],type_data:{}},type)}}

function typeFieldsHtml(type,data={}){
  const def=state.contentTypes[type]||state.contentTypes.other,L=editorLimits();
  return(def.fields||[]).map(f=>{
    const value=data[f.key]??(f.key==='status_override'?'auto':'');
    const common=`name="type_${f.key}" data-key="${f.key}" ${f.required?'required':''}`;
    if(f.type==='textarea')return`<label class="field wide">${esc(f.label)}<textarea ${common} maxlength="${L.type_long_text}">${esc(value)}</textarea>${f.help?`<small>${esc(f.help)}</small>`:''}</label>`;
    if(f.type==='select')return`<label class="field">${esc(f.label)}<select ${common}>${(f.options||[]).map(o=>`<option value="${esc(o)}" ${String(value)===o?'selected':''}>${esc(o.replaceAll('_',' '))}</option>`).join('')}</select>${f.help?`<small>${esc(f.help)}</small>`:''}</label>`;
    const max=f.type==='url'?L.url:L.type_text;
    return`<label class="field">${esc(f.label)}<input type="${f.type||'text'}" ${common} maxlength="${max}" value="${esc(f.type==='date'?dateInput(value):value)}">${f.help?`<small>${esc(f.help)}</small>`:''}</label>`;
  }).join('')||'<div class="notice wide">This type has no additional fields. Use the shared content, topics, links and metadata below.</div>'
}
function pairLines(items=[],kind='link'){return(items||[]).map(x=>`${x.title||''} | ${x.url||''}`).join('\n')}
function topicsHtml(items=[]){return(items||[]).map((t,i)=>topicCardHtml(t,i)).join('')}
function topicCardHtml(t={},i=0){const L=editorLimits();return`<div class="topic-card" data-index="${i}"><div class="topic-head"><span class="topic-key">#t${i+1}</span><strong>Page section ${i+1}</strong>${iconButton('trash','Remove section','danger remove-topic')}</div><div class="form-grid"><label class="field wide">Section title<input class="topic-title" maxlength="${L.topic_title}" value="${esc(t.title||'')}" placeholder="Who qualifies?" required></label><label class="field wide">Section body<textarea class="topic-body" maxlength="${L.topic_body}" placeholder="Write this section clearly…">${esc(t.body||'')}</textarea></label><label class="field">Optional links <textarea class="topic-links" placeholder="Apply Here | https://example.com">${esc(pairLines(t.links))}</textarea></label><label class="field">Optional images <textarea class="topic-images" placeholder="Campus image | https://...">${esc(pairLines(t.images))}</textarea></label><label class="field wide">Optional documents <textarea class="topic-documents" placeholder="Application Form | https://...pdf">${esc(pairLines(t.documents))}</textarea></label></div></div>`}
function relatedLinkHtml(l={},i=0,cls='related-link-row'){const L=editorLimits();return`<div class="repeat-row ${cls}"><div class="mini-grid"><label class="field">Readable name<input class="rl-title" maxlength="${L.link_title}" value="${esc(l.title||'')}" placeholder="Official application portal"></label><label class="field">URL<input class="rl-url" maxlength="${L.url}" value="${esc(l.url||'')}" placeholder="https://..."></label>${iconButton('trash','Remove link','danger remove-repeat')}</div></div>`}
function navLinkHtml(l={}){const L=editorLimits();return`<div class="repeat-row nav-link-row"><div class="mini-grid"><label class="field">Link name<input class="rl-title" maxlength="${L.link_title}" value="${esc(l.title||'')}"></label><label class="field">URL<input class="rl-url" maxlength="${L.url}" value="${esc(l.url||'')}"></label>${iconButton('trash','Remove link','danger remove-repeat')}</div></div>`}
function recommendationLinkHtml(l={}){const L=editorLimits();return`<div class="repeat-row recommendation-link-row"><div class="mini-grid"><label class="field">Recommendation name<input class="rl-title" maxlength="${L.link_title}" value="${esc(l.title||'')}" placeholder="Official application guide"></label><label class="field">URL<input class="rl-url" maxlength="${L.url}" value="${esc(l.url||'')}" placeholder="https://..."></label>${iconButton('trash','Remove recommendation','remove-repeat danger')}</div></div>`}
function relationPicker(posts,selected=[],name){return`<div class="picker-list">${posts.length?posts.map(p=>`<div class="pick-row"><input id="${name}-${p.id}" type="checkbox" name="${name}" value="${p.id}" ${selected.includes(p.id)?'checked':''}><label for="${name}-${p.id}"><strong>${esc(p.title)}</strong><small>${esc(p.content_type)} · /${esc(p.slug)}</small></label></div>`).join(''):'<div class="empty">Create other pages first, then link them here.</div>'}</div>`}

async function openPostEditor(post={},forceType){await loadContentTypes();if(!state.posts.length){try{state.posts=await api('/posts')}catch{state.posts=[]}}const type=forceType||post.content_type||'other',L=editorLimits(),SEO=seoGuide();const isEdit=Boolean(post.id);state.editor={post,documents:[...(post.documents||[])]};modal(isEdit?'Edit content':'Create content','STRUCTURED EDITOR',`<form id="postForm" class="editor-shell" novalidate>
  <div class="editor-top"><label class="field">What would you like to update?<select id="contentType" name="content_type">${Object.entries(state.contentTypes).map(([k,v])=>`<option value="${k}" ${k===type?'selected':''}>${esc(v.label)}</option>`).join('')}</select><small>The editor changes immediately to match this content type.</small></label><div>${badge(isEdit?post.status||'draft':'new')}</div></div>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">1</span><div><h4>Essentials</h4><p>Title, URL, publishing state and classification.</p></div></div><div class="editor-section-body form-grid"><label class="field wide">Title<input name="title" value="${esc(post.title||'')}" placeholder="Give the page a clear, useful title" minlength="2" maxlength="${L.title}" required></label><label class="field">SEO-friendly slug<input name="slug" maxlength="${L.slug}" value="${esc(post.slug||'')}" placeholder="auto-generated-from-title"><small>No .html or .php extension.</small></label><label class="field">Publishing status<select name="status">${['draft','scheduled','published','archived'].map(x=>`<option value="${x}" ${x===(post.status||'draft')?'selected':''}>${x}</option>`).join('')}</select></label><label class="field">Posted / published date<input type="date" name="posted_date" value="${dateInput(post.posted_date||post.published_at)}"></label><label class="field">Category<input name="category" maxlength="${L.category}" value="${esc(post.category||'')}" placeholder="University News"></label><label class="field wide">Short description / excerpt<textarea name="summary" maxlength="${L.summary}" placeholder="A short description used in cards, search and SEO.">${esc(post.summary||'')}</textarea></label><label class="field"><input type="checkbox" name="is_trending" ${post.is_trending?'checked':''}> Mark as trending</label></div></section>
  <section class="editor-section type-fields"><div class="editor-section-head"><span class="section-number">2</span><div><h4 id="typeSectionTitle">${esc(state.contentTypes[type].label)} details</h4><p>Only metadata relevant to this content type appears here.</p></div></div><div id="typeFields" class="editor-section-body form-grid">${typeFieldsHtml(type,post.type_data||{})}</div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">3</span><div><h4>Main image</h4><p>Upload a hooking image or use a trusted image URL.</p></div></div><div class="editor-section-body"><div class="upload-zone"><div class="upload-preview" id="imagePreview">${post.main_image_url?`<img src="${esc(post.main_image_url)}" alt="">`:'IMAGE'}</div><div class="upload-copy"><strong>Featured / hooking image</strong><small>JPG, PNG, WebP or GIF. Supabase uploads stay enabled in demo/testing mode when credentials are configured.</small><input id="imageFile" type="file" accept="image/jpeg,image/png,image/webp,image/gif"></div></div><label class="field" style="margin-top:12px">Image URL<input name="main_image_url" id="mainImageUrl" maxlength="${L.url}" value="${esc(post.main_image_url||'')}" placeholder="https://... or upload above"></label></div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">4</span><div><h4>Main content</h4><p>Readable link syntax is supported safely.</p></div></div><div class="editor-section-body"><label class="field">Page content<textarea name="body_markdown" maxlength="250000" style="min-height:300px" placeholder="Write the page here. Use **bold**, lists, [Apply Here](https://example.com), and #tags.">${esc(post.body_markdown||'')}</textarea><small>Readable links: [Apply Here At UL](https://ul.ac.za/apply). Inline #tags are detected by the public API.</small></label></div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">5</span><div><h4>Topics / sections</h4><p>These become “On this page” navigation with #t1 through #t10 anchors.</p></div><button type="button" class="soft" id="addTopic" style="margin-left:auto">＋ Add topic</button></div><div class="editor-section-body"><div id="topicList" class="repeat-list">${topicsHtml(post.topics||[])}</div><div id="noTopics" class="notice ${post.topics?.length?'hidden':''}">No topics yet. Add a topic for sections like “Who qualifies?” or “How to apply?”.</div></div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">6</span><div><h4>Tags</h4><p>Tags categorize content and power clickable tag pages.</p></div></div><div class="editor-section-body"><label class="field">Tags, separated by commas<input name="tags" value="${esc((post.tags||[]).join(', '))}" placeholder="Bursaries, NSFAS, UniversityOfLimpopo, 2026"><small>Up to ${L.tags} tags. Each tag can be up to ${L.tag} characters.</small></label><div id="tagPreview" class="tag-preview"></div></div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">7</span><div><h4>Related links</h4><p>Useful external/internal resources. These are separate from related TodayInfo pages.</p></div><button type="button" class="soft" id="addRelatedLink" style="margin-left:auto">＋ Add link</button></div><div class="editor-section-body"><div id="relatedLinkList" class="repeat-list">${(post.related_links||[]).map((x,i)=>relatedLinkHtml(x,i)).join('')}</div></div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">8</span><div><h4>Documents & downloads</h4><p>Attach readable download names instead of exposing ugly raw URLs.</p></div></div><div class="editor-section-body"><div class="upload-zone" style="margin-bottom:13px"><div class="upload-preview">📄</div><div class="upload-copy"><strong>Attach a document</strong><small>Give it a readable name, then choose PDF, DOC/DOCX, XLS/XLSX or ZIP.</small><div class="mini-grid"><label class="field">Download name<input id="docTitle" maxlength="${L.document_title}" placeholder="Bursary Application Form 2026"></label><label class="field">File<input id="docFile" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.zip"></label><button type="button" class="soft" id="addDocument">Upload & attach</button></div></div></div><div id="documentList" class="repeat-list"></div></div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">9</span><div><h4>Related content</h4><p>Manually choose other TodayInfo pages related to this page.</p></div></div><div class="editor-section-body">${relationPicker(state.posts.filter(x=>x.id!==post.id&&x.status!=='trash'),post.related_ids||[],'related_ids')}</div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">10</span><div><h4>Recommendations</h4><p>Pick TodayInfo pages and add your own readable recommendation links. Fetched source recommendations appear here too.</p></div><button type="button" class="soft" id="addRecommendationLink" style="margin-left:auto">＋ Add your own</button></div><div class="editor-section-body"><h5 class="subsection-title">TodayInfo recommendations</h5>${relationPicker(state.posts.filter(x=>x.id!==post.id&&x.status!=='trash'),post.recommendation_ids||[],'recommendation_ids')}<h5 class="subsection-title recommendation-title">Your own / fetched recommendations</h5><div id="recommendationLinkList" class="repeat-list">${(post.recommendation_links||[]).map(recommendationLinkHtml).join('')}</div><div class="notice recommendation-help">Fetched related posts are preserved here as editable links. If the same content later exists as a TodayInfo page, you can also select it above.</div></div></section>
  <section class="editor-section"><div class="editor-section-head"><span class="section-number">11</span><div><h4>Navigation & SEO</h4><p>Breadcrumbs are created automatically; add extra navigation links only when useful.</p></div><button type="button" class="soft" id="addNavLink" style="margin-left:auto">＋ Navigation link</button></div><div class="editor-section-body form-grid"><label class="field">SEO title<input name="seo_title" maxlength="${L.seo_title}" data-recommended="${SEO.title_recommended}" value="${esc(post.seo_title||'')}"><small>Search engines often display about ${SEO.title_recommended} characters, but TodayInfo stores up to ${L.seo_title}.</small></label><label class="field">SEO description<textarea name="seo_description" rows="4" maxlength="${L.seo_description}" data-recommended="${SEO.description_recommended}" placeholder="Describe the page naturally for search results.">${esc(post.seo_description||'')}</textarea><small>Around ${SEO.description_recommended} characters is recommended for a concise snippet; TodayInfo allows up to ${L.seo_description}.</small></label><div class="wide seo-preview-card"><p class="eyebrow">SEARCH PREVIEW</p><div id="seoPreview" class="seo-preview"></div></div><div class="wide"><div id="navLinkList" class="repeat-list">${(post.navigation_links||[]).map(navLinkHtml).join('')}</div></div></div></section>
  <div id="formError" class="error-box hidden"></div>
  <div class="sticky-save">${isEdit?'<button type="button" class="ghost" id="revisionBtn">Revision history</button>':''}<button type="button" class="ghost" id="cancelPost">Cancel</button><button type="submit" class="primary">${isEdit?'Save changes':'Create content'}</button></div>
</form>`);
  renderDocumentList();wireEditor(post);const form=$('#postForm');wireLengthCounters(form);updateTagPreview(form);updateSeoPreview(form);
}

function parsePairs(text,type='link'){return String(text||'').split('\n').map(x=>x.trim()).filter(Boolean).map(line=>{const idx=line.indexOf('|');if(idx<0)return null;const title=line.slice(0,idx).trim(),url=line.slice(idx+1).trim();return title&&url?{title,url,type}:null}).filter(Boolean)}
function collectRepeatRows(selector){return $$(selector).map(row=>({title:$('.rl-title',row)?.value.trim(),url:$('.rl-url',row)?.value.trim(),type:'link'})).filter(x=>x.title&&x.url)}
function collectTopics(){return $$('.topic-card').map((card,i)=>({id:`t${i+1}`,key:`t${i+1}`,title:$('.topic-title',card).value.trim(),body:$('.topic-body',card).value,links:parsePairs($('.topic-links',card).value,'link'),images:parsePairs($('.topic-images',card).value,'image'),documents:parsePairs($('.topic-documents',card).value,'document')})).filter(x=>x.title)}
function renderDocumentList(){const el=$('#documentList');if(!el)return;const docs=state.editor?.documents||[];el.innerHTML=docs.length?docs.map((d,i)=>`<div class="doc-card"><div class="doc-icon">📄</div><div class="grow"><strong>${esc(d.title||'Document')}</strong><small>${esc(d.mime_type||d.type||'document')} ${bytes(d.size_bytes)}</small></div>${iconButton('trash','Remove document','danger remove-doc').replace('>',` data-index="${i}">`)}</div>`).join(''):'<div class="notice">No documents attached. Upload PDF, DOC/DOCX, XLS/XLSX or ZIP files when needed.</div>';$$('.remove-doc',el).forEach(b=>b.onclick=()=>{state.editor.documents.splice(Number(b.dataset.index),1);renderDocumentList()})}
function renumberTopics(){$$('.topic-card').forEach((c,i)=>{$('.topic-key',c).textContent=`#t${i+1}`;c.dataset.index=i});$('#noTopics')?.classList.toggle('hidden',$$('.topic-card').length>0)}
function wireEditor(post){
  const form=$('#postForm');
  const refreshTags=()=>{
    const input=form.querySelector('[name="tags"]'),issues=updateTagPreview(form);
    input?.setCustomValidity(issues[0]?.message||'');
  };
  const refreshSeo=()=>updateSeoPreview(form);

  $('#contentType').onchange=e=>{
    const type=e.target.value;
    $('#typeSectionTitle').textContent=`${state.contentTypes[type].label} details`;
    $('#typeFields').innerHTML=typeFieldsHtml(type,{});
    wireLengthCounters($('#typeFields'));
  };

  $('#imageFile').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{toast('Uploading image…');const m=await uploadFile(file,post.title||'Featured image');$('#mainImageUrl').value=m.url;$('#imagePreview').innerHTML=`<img src="${esc(m.url)}" alt="">`;toast('Image uploaded')}catch(err){toast(err.message,true);e.target.value=''}};

  $('#addTopic').onclick=()=>{
    const list=$('#topicList');if($$('.topic-card',list).length>=10)return toast('Maximum 10 topics per page',true);
    list.insertAdjacentHTML('beforeend',topicCardHtml({},$$('.topic-card',list).length));renumberTopics();
    wireLengthCounters(list.lastElementChild);
  };
  $('#topicList').onclick=e=>{if(e.target.closest('.remove-topic')){e.target.closest('.topic-card').remove();renumberTopics()}};

  $('#addRelatedLink').onclick=()=>{const list=$('#relatedLinkList');list.insertAdjacentHTML('beforeend',relatedLinkHtml());wireLengthCounters(list.lastElementChild)};
  $('#relatedLinkList').onclick=e=>{if(e.target.closest('.remove-repeat'))e.target.closest('.repeat-row').remove()};
  $('#addRecommendationLink').onclick=()=>{const list=$('#recommendationLinkList');list.insertAdjacentHTML('beforeend',recommendationLinkHtml());wireLengthCounters(list.lastElementChild)};
  $('#recommendationLinkList').onclick=e=>{if(e.target.closest('.remove-repeat'))e.target.closest('.repeat-row').remove()};
  $('#addNavLink').onclick=()=>{const list=$('#navLinkList');list.insertAdjacentHTML('beforeend',navLinkHtml());wireLengthCounters(list.lastElementChild)};
  $('#navLinkList').onclick=e=>{if(e.target.closest('.remove-repeat'))e.target.closest('.repeat-row').remove()};

  $('#addDocument').onclick=async()=>{const file=$('#docFile').files?.[0],title=$('#docTitle').value.trim();if(!title)return toast('Give the document a readable name first',true);if(title.length>editorLimits().document_title)return toast(`Document name is too long. Maximum ${editorLimits().document_title} characters.`,true);if(!file)return toast('Choose a document to upload',true);try{toast('Uploading document…');const m=await uploadFile(file,title);state.editor.documents.push({title,url:m.url,type:'document',mime_type:m.mime_type,size_bytes:m.size_bytes});$('#docTitle').value='';$('#docFile').value='';renderDocumentList();toast('Document attached')}catch(err){toast(err.message,true)}};
  $('#cancelPost').onclick=closeModal;
  if(post.id)$('#revisionBtn').onclick=async()=>{try{const rows=await api(`/posts/${post.id}/revisions`);alert(rows.slice(0,12).map(r=>`${new Date(r.created_at).toLocaleString()} — revision saved`).join('\n')||'No previous revisions')}catch(err){toast(err.message,true)}};

  form.querySelector('[name="tags"]')?.addEventListener('input',refreshTags);
  ['title','slug','summary','seo_title','seo_description'].forEach(name=>form.querySelector(`[name="${name}"]`)?.addEventListener('input',refreshSeo));
  refreshTags();refreshSeo();

  form.onsubmit=async e=>{
    e.preventDefault();
    clearEditorValidation(form);
    refreshTags();refreshSeo();
    const localIssues=clientEditorIssues(form);
    if(localIssues.length){showEditorValidation(form,localIssues);return}
    if(!form.reportValidity())return;

    const f=new FormData(form),type=f.get('content_type'),typeData={};
    $$('[data-key]',$('#typeFields')).forEach(el=>typeData[el.dataset.key]=el.value||null);
    const body={
      title:f.get('title').trim(),slug:f.get('slug').trim()||undefined,content_type:type,status:f.get('status'),
      posted_date:f.get('posted_date')||null,category:f.get('category').trim(),categories:f.get('category')?[f.get('category').trim()]:[],
      summary:f.get('summary')||'',body_markdown:f.get('body_markdown')||'',main_image_url:f.get('main_image_url')||null,
      tags:splitList(f.get('tags')),topics:collectTopics(),related_links:collectRepeatRows('.related-link-row'),
      documents:state.editor.documents,navigation_links:collectRepeatRows('.nav-link-row'),
      related_ids:$$('input[name="related_ids"]:checked').map(x=>x.value),
      recommendation_ids:$$('input[name="recommendation_ids"]:checked').map(x=>x.value),
      recommendation_links:collectRepeatRows('.recommendation-link-row'),
      seo_title:f.get('seo_title')||'',seo_description:f.get('seo_description')||'',type_data:typeData,
      is_trending:f.get('is_trending')==='on'
    };
    try{
      const save=form.querySelector('button[type="submit"]');save.disabled=true;save.textContent=post.id?'Saving…':'Creating…';
      const saved=await api(post.id?`/posts/${post.id}`:'/posts',{method:post.id?'PATCH':'POST',body});
      toast(saved.status==='published'?'Published successfully':'Saved successfully');closeModal();state.posts=[];await navigate('posts');
    }catch(err){
      const issues=err.details?.issues||[];
      if(issues.length)showEditorValidation(form,issues);
      else{
        const box=$('#formError');box.innerHTML=`<strong>Could not save this content.</strong><p>${esc(err.message)}</p>`;box.classList.remove('hidden');box.scrollIntoView({behavior:'smooth',block:'center'});
      }
      const save=form.querySelector('button[type="submit"]');if(save){save.disabled=false;save.textContent=post.id?'Save changes':'Create content'}
    }
  };
}
async function uploadFile(file,title=''){const fd=new FormData();fd.append('file',file);fd.append('title',title||file.name);fd.append('alt_text',title||'');return api('/media/upload',{method:'POST',body:fd})}
function openMediaUpload(){modal('Upload media or document','MEDIA LIBRARY',`<form id="mediaUpload" class="form-grid"><label class="field wide">Readable name<input name="title" placeholder="NSFAS bursary image" required></label><label class="field wide">File<input name="file" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip" required></label><label class="field wide">Alt text<input name="alt_text" placeholder="Describe the image for accessibility"></label><div class="form-actions"><button type="button" class="ghost" id="mediaCancel">Cancel</button><button class="primary">Upload</button></div></form>`);$('#mediaCancel').onclick=closeModal;$('#mediaUpload').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.currentTarget);try{const fd=new FormData();fd.append('file',f.get('file'));fd.append('title',f.get('title'));fd.append('alt_text',f.get('alt_text'));await api('/media/upload',{method:'POST',body:fd});toast('Uploaded successfully');closeModal();await renderers.media()}catch(err){toast(err.message,true)}}}
function openTeamEditor(roles){const entries=Object.entries(roles||{}).filter(([id])=>state.user?.role==='owner'||id!=='owner');modal('Add employee','TEAM ACCESS',`<form id="teamForm" class="form-grid"><label class="field">Display name<input name="display_name" required></label><label class="field">Username<input name="username" minlength="3" required></label><label class="field">Email<input name="email" type="email" required></label><label class="field">Role<select name="role">${entries.map(([id,def])=>`<option value="${esc(id)}" ${id==='editor'?'selected':''}>${esc(def.label||id.replaceAll('_',' '))}</option>`).join('')}</select><small>Editor and Content Worker are restricted to cleaning, editing, publishing and media.</small></label><label class="field wide">Initial password<input name="password" type="password" minlength="8" required><small>Use at least 8 characters. Resend can send the account notice when configured.</small></label><div class="notice wide">Apo / CEO keeps full system access. Employee actions are audited and counted automatically.</div><div class="form-actions"><button type="button" class="ghost" id="teamCancel">Cancel</button><button class="primary">Create employee</button></div></form>`);$('#teamCancel').onclick=closeModal;$('#teamForm').onsubmit=async e=>{e.preventDefault();try{const r=await api('/team',{method:'POST',body:Object.fromEntries(new FormData(e.currentTarget))});toast(r.email?.sent?'Employee created and email sent':'Employee created');closeModal();await renderers.team()}catch(err){toast(err.message,true)}}}

boot();
