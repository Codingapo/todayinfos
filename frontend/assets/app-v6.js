(() => {
  'use strict';

  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const app = $('#app');
  const API = String(window.TODAYINFO_API_BASE || '').replace(/\/$/, '');
  const cache = new Map();
  const COLLECTIONS = new Set(['news','announcements','stories','articles','bursaries','scholarships','jobs','internships','learnerships','opportunities']);
  const state = {
    page: 1,
    limit: 20,
    query: '',
    detailPostId: null,
    readTimer: null,
    readSent: false,
    seo: null,
    capabilities: null
  };

  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const text = value => String(value ?? '').trim();
  const titleCase = value => text(value).replaceAll('_', ' ').replace(/\b\w/g, m => m.toUpperCase());
  const formatDate = value => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-ZA', { day:'numeric', month:'long', year:'numeric' }).format(d);
  };
  const compactNumber = n => new Intl.NumberFormat('en-ZA', { notation:'compact', maximumFractionDigits:1 }).format(Number(n || 0));
  const typeLabel = type => ({
    bursary:'Bursary', scholarship:'Scholarship', job:'Job', internship:'Internship', learnership:'Learnership',
    opportunity:'Opportunity', news:'News', announcement:'Announcement', story:'Story', other:'Page', application_guide:'Application guide'
  }[type] || titleCase(type || 'Page'));
  const pluralPath = type => ({
    bursary:'bursaries', scholarship:'scholarships', job:'jobs', internship:'internships', learnership:'learnerships',
    opportunity:'opportunities', news:'news', announcement:'news', story:'stories', other:'pages'
  }[type] || 'pages');

  const visitorId = (() => {
    const key = 'todayinfo-visitor-id';
    let value = localStorage.getItem(key);
    if (!value) {
      value = crypto.randomUUID ? crypto.randomUUID() : `ti-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      localStorage.setItem(key, value);
    }
    return value;
  })();

  window.addEventListener('error', event => {
    console.error(event.error || event.message);
    if (!app.innerHTML.trim()) app.innerHTML = errorState(event.error?.message || event.message || 'Unknown client error');
  });
  window.addEventListener('unhandledrejection', event => {
    console.error(event.reason);
    if (!app.innerHTML.trim()) app.innerHTML = errorState(event.reason?.message || event.reason || 'The API request failed');
  });

  const apiUrl = (path, params = {}) => {
    if (!API) throw new Error('TodayInfo API base URL is not configured.');
    const url = new URL(`${API}/${String(path || '').replace(/^\//, '')}`);
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    });
    return url;
  };

  async function request(path, { params = {}, method = 'GET', body, ttl = 60000 } = {}) {
    const cacheable = method === 'GET';
    const key = `${path}?${new URLSearchParams(Object.entries(params).filter(([,v]) => v !== undefined && v !== null && v !== ''))}`;
    if (cacheable) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.time < ttl) return hit.value;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    let response;
    try {
      response = await fetch(apiUrl(path, params), {
        method,
        headers: { accept:'application/json', ...(body ? { 'content-type':'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
    } catch (error) {
      throw new Error(error.name === 'AbortError' ? 'The TodayInfo API took too long to respond.' : 'The TodayInfo API could not be reached.');
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      let message = `${path} returned ${response.status}`;
      try { const data = await response.json(); message = data.error || message; } catch {}
      const error = new Error(message); error.status = response.status; throw error;
    }
    const value = await response.json();
    if (cacheable) cache.set(key, { time:Date.now(), value });
    return value;
  }

  const get = (path, params = {}, ttl = 60000) => request(path, { params, ttl });
  const safeGet = (path, params = {}, fallback = { data:[] }, ttl = 60000) => get(path, params, ttl).catch(error => {
    console.warn(`TodayInfo optional endpoint failed: ${path}`, error);
    return fallback;
  });
  const postEvent = (event_type, post_id = null, meta = {}) => request('analytics/events', {
    method:'POST', body:{ visitor_id:visitorId, event_type, post_id:post_id || undefined, meta }
  }).catch(() => null);

  async function getAll(path, params = {}, maxPages = 25) {
    const rows = [];
    let page = 1;
    do {
      const response = await get(path, { ...params, page, limit:100 });
      rows.push(...(response.data || []));
      const pagination = response.meta?.pagination;
      if (!pagination?.hasNext) break;
      page += 1;
    } while (page <= maxPages);
    return rows;
  }

  const header = (eyebrow, title, intro = '') => `<section class="page-heading container"><p class="eyebrow">${esc(eyebrow)}</p><h1>${title}</h1>${intro ? `<p>${esc(intro)}</p>` : ''}</section>`;
  const loading = () => `<section class="container route-state"><div class="loader"></div><p>Loading TodayInfo…</p></section>`;
  const errorState = message => `<section class="container route-state"><div class="error-icon">!</div><h2>We couldn’t load that right now</h2><p>${esc(message)}</p><div class="state-actions"><button class="button button-secondary" data-retry>Try again</button><a class="button button-primary" href="/" data-route>Back to Today</a></div></section>`;
  const empty = message => `<div class="route-state compact"><h3>No published content yet</h3><p>${esc(message)}</p></div>`;
  const safeHref = url => /^https?:\/\//i.test(String(url || '')) || /^\/(?!\/)/.test(String(url || ''));
  const link = (href, label, cls = '', attrs = '') => safeHref(href) ? `<a class="${cls}" href="${esc(href)}" ${String(href).startsWith('/') ? 'data-route' : 'target="_blank" rel="noopener noreferrer"'} ${attrs}>${esc(label || href)}</a>` : '';
  const localPath = record => record?.path || `/${pluralPath(record?.type)}/${encodeURIComponent(record?.slug || '')}`;
  const locationLabel = record => [record?.location?.city, record?.location?.region?.name, record?.location?.country?.name || record?.location?.country?.code].filter(Boolean).join(', ');

  const cover = record => record?.main_image
    ? `<img class="content-card-image" src="${esc(record.main_image)}" alt="" loading="lazy">`
    : `<div class="content-card-image local-cover"><span>${esc(typeLabel(record?.type))}</span><strong>${esc(record?.title || 'TodayInfo')}</strong></div>`;

  function card(record) {
    const description = text(record.description).slice(0, 190);
    const date = formatDate(record.posted_date || record.updated_date);
    const place = locationLabel(record);
    const footer = place || record.organisation || record.category || '';
    return `<article class="content-card">${cover(record)}<div class="card-meta"><span class="story-tag">${esc(typeLabel(record.type))}</span><span>${esc(date || (record.is_trending ? 'Trending' : 'Published'))}</span></div><h3>${link(localPath(record), record.title || 'Untitled')}</h3><p>${esc(description)}${description.length >= 190 ? '…' : ''}</p><div class="card-foot"><span>${esc(footer)}</span><span>Read ↗</span></div></article>`;
  }

  const guideCard = guide => `<article class="content-card guide-card"><div class="content-card-image local-cover guide-cover"><span>Application guide</span><strong>${esc(guide.title || 'How to apply')}</strong></div><div class="card-meta"><span class="story-tag">Guide</span><span>${esc(guide.parent?.type ? typeLabel(guide.parent.type) : 'Opportunity')}</span></div><h3>${link(guide.path || `/guides/${encodeURIComponent(guide.slug || '')}`, guide.title || 'How to apply')}</h3><p>${esc(text(guide.description).slice(0,190))}</p><div class="card-foot"><span>${esc(guide.parent?.title || '')}</span><span>Open guide ↗</span></div></article>`;

  const pager = meta => {
    const p = meta?.pagination;
    if (!p || Number(p.totalPages || 1) <= 1) return '';
    return `<div class="pager"><button class="button button-secondary" data-page="${p.page - 1}" ${p.hasPrevious ? '' : 'disabled'}>← Previous</button><span>Page ${p.page} of ${p.totalPages}</span><button class="button button-secondary" data-page="${p.page + 1}" ${p.hasNext ? '' : 'disabled'}>Next →</button></div>`;
  };

  const listView = (title, eyebrow, records, meta, intro = '', options = {}) => {
    const render = options.render || card;
    const total = meta?.pagination?.total ?? records.length;
    return `${header(eyebrow, esc(title), intro)}<section class="container route-section">${options.toolbar || `<div class="listing-toolbar"><span>${total} result${total === 1 ? '' : 's'}</span><label class="search-box"><span>⌕</span><input id="routeSearch" type="search" placeholder="Search TodayInfo" value="${esc(state.query)}"></label></div>`}<div class="content-grid">${records.length ? records.map(render).join('') : empty(options.empty || 'Published content from the Control Center will appear here automatically.')}</div>${pager(meta)}</section>`;
  };

  const topicCards = (list, kind = 'categories') => `<div class="topic-grid route-topics">${list.map(item => `<a class="topic-card topic-blue" href="/${kind}/${encodeURIComponent(item.slug)}" data-route><span class="topic-icon">◎</span><strong>${esc(item.title || item.name)}</strong><small>${item.count ?? 0} published item${item.count === 1 ? '' : 's'}</small><span class="topic-arrow">↗</span></a>`).join('')}</div>`;

  const facetCount = (facets, type) => Number((facets?.content_types || []).find(x => x.value === type)?.count || 0);
  const countryHref = code => `/${String(code || '').toLowerCase()}`;

  async function home() {
    const [siteRes, latestRes, trendingRes, personalRes, facetsRes, categoriesRes, tagsRes, countriesRes, guidesRes] = await Promise.all([
      safeGet('site', {}, { data:{} }),
      safeGet('posts', { page:1, limit:8 }),
      safeGet('trending', { page:1, limit:6 }),
      safeGet('personalized', { visitor_id:visitorId }, { data:[] }, 30000),
      safeGet('facets', {}, { data:{} }),
      safeGet('categories'), safeGet('tags'), safeGet('countries'), safeGet('guides', { page:1, limit:3 })
    ]);
    const site = siteRes.data || {};
    const latest = latestRes.data || [];
    const trending = trendingRes.data || [];
    const personalized = personalRes.data || [];
    const facets = facetsRes.data || {};
    const categories = categoriesRes.data || [];
    const tags = tagsRes.data || [];
    const countries = countriesRes.data || [];
    const guides = guidesRes.data || [];
    const featured = personalized.length >= 4 ? personalized.slice(0,4) : trending.length ? trending.slice(0,4) : latest.slice(0,4);
    const featuredLabel = personalized.length >= 4 ? 'Picked from your TodayInfo activity' : trending.length ? 'Trending now' : 'Fresh from TodayInfo';
    const typeCards = [
      ['🎓','Bursaries','bursaries',facetCount(facets,'bursary')],
      ['📘','Scholarships','scholarships',facetCount(facets,'scholarship')],
      ['💼','Jobs','jobs',facetCount(facets,'job')],
      ['🧭','Internships','internships',facetCount(facets,'internship')],
      ['🛠️','Learnerships','learnerships',facetCount(facets,'learnership')],
      ['✨','Opportunities','opportunities',facetCount(facets,'opportunity')]
    ];
    return `<section class="hero"><div class="container hero-grid"><div class="hero-copy"><p class="eyebrow"><span class="pulse"></span>${new Intl.DateTimeFormat('en-ZA',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).format(new Date())}</p><h1>Know what<br><em>matters today.</em></h1><p class="hero-lede">Jobs, funding, internships, news, guides and opportunities from the managed TodayInfo API — structured for people, search and every country we support.</p><div class="hero-cta"><a class="button button-primary" href="/latest" data-route>Explore latest updates <span>→</span></a><a class="text-button" href="/search" data-route>Search all opportunities <span>⌕</span></a></div></div><div class="hero-art"><div class="sun"></div><div class="orb orb-one"></div><div class="orb orb-two"></div><div class="horizon horizon-back"></div><div class="horizon horizon-front"></div><div class="art-note"><span class="note-dot"></span><span>Global managed API<br><strong>${esc(site.name || 'TodayInfo')}</strong></span></div></div></div></section><section class="container ad-slot ad-header"><span>Advertisement</span></section>${header(featuredLabel,'Latest updates','Everything here is already published by the TodayInfo API.')}<section class="container route-section"><div class="content-grid featured-grid">${featured.map(card).join('') || empty('No published content is available yet.')}</div><div class="center-action"><a class="button button-secondary" href="/latest" data-route>See all latest updates →</a></div></section><section class="container section"><div class="section-heading"><div><p class="eyebrow">Opportunity finder</p><h2>Browse by content type</h2></div></div><div class="home-type-grid six-up">${typeCards.map(([icon,label,path,count]) => `<a class="home-type-card" href="/${path}" data-route><span>${icon}</span><strong>${label}</strong><small>${count ? `${count} published` : 'Explore'}</small></a>`).join('')}</div></section>${countries.length ? `<section class="container section"><div class="section-heading"><div><p class="eyebrow">Global TodayInfo</p><h2>Browse countries</h2></div><a class="view-all" href="/countries" data-route>All countries →</a></div><div class="country-strip">${countries.slice(0,8).map(c => `<a href="${countryHref(c.code)}" data-route><strong>${esc(c.name || c.code)}</strong><small>${c.count || 0} pages</small></a>`).join('')}</div></section>` : ''}${guides.length ? `<section class="container section"><div class="section-heading"><div><p class="eyebrow">Application help</p><h2>Step-by-step guides</h2></div><a class="view-all" href="/guides" data-route>All guides →</a></div><div class="content-grid">${guides.map(guideCard).join('')}</div></section>` : ''}${categories.length ? `<section class="container section"><div class="section-heading"><div><p class="eyebrow">Browse by category</p><h2>Categories</h2></div><a class="view-all" href="/categories" data-route>View all →</a></div>${topicCards(categories.slice(0,8),'categories')}</section>` : ''}${tags.length ? `<section class="container section"><div class="section-heading"><div><p class="eyebrow">Follow a topic</p><h2>Popular tags</h2></div><a class="view-all" href="/tags" data-route>View all →</a></div>${topicCards(tags.slice(0,8),'tags')}</section>` : ''}`;
  }

  function currentFilters(params = new URLSearchParams(location.search)) {
    const keys = ['q','country','region','city','category','subcategory','organisation','opportunity_type','education_level','field_of_study','job_type','work_mode','salary_min','salary_max','currency','stipend','eligibility','tag','opportunity_status','closing_before','closing_after','posted_before','posted_after'];
    return Object.fromEntries(keys.map(k => [k, params.get(k) || '']).filter(([,v]) => v !== ''));
  }

  async function collection(endpoint, title, eyebrow, intro, forced = {}) {
    const params = { ...currentFilters(), ...forced, page:state.page, limit:state.limit };
    const response = await get(endpoint, params);
    return listView(title, eyebrow, response.data || [], response.meta, intro);
  }

  const latest = () => collection('posts', 'Latest updates', 'Published now', 'All published TodayInfo content, newest first.');
  const bursaries = () => collection('bursaries', 'Bursaries', 'Funding opportunities', 'Published bursaries with status, dates, eligibility and application information.');
  const scholarships = () => collection('scholarships', 'Scholarships', 'Study funding', 'Published scholarships from the TodayInfo global API.');
  const jobs = () => collection('jobs', 'Jobs', 'Career opportunities', 'Published vacancies with organisation, location, requirements and application links.');
  const news = () => collection('news', 'News & announcements', 'Latest information', 'Plain-language published news and announcements with clear dates and source attribution.');
  const internships = () => collection('internships', 'Internships', 'Career starters', 'Published internship opportunities from TodayInfo.');
  const learnerships = () => collection('learnerships', 'Learnerships', 'Skills opportunities', 'Published learnership and apprenticeship opportunities.');
  const opportunities = () => collection('opportunities', 'Opportunities', 'More ways forward', 'Published opportunities that do not fit only one funding or career category.');
  const trending = () => collection('trending', 'Trending on TodayInfo', 'What people are reading', 'Published content ranked by recent engagement.');
  const forYou = () => collection('personalized', 'For you', 'Based on your TodayInfo activity', 'A deterministic feed based on your own recent TodayInfo activity.', { visitor_id:visitorId });

  async function explore() {
    const [metaRes, facetsRes, categoriesRes, tagsRes, countriesRes, sourcesRes, guidesRes] = await Promise.all([
      safeGet('meta', {}, { data:{} }), safeGet('facets', {}, { data:{} }), safeGet('categories'), safeGet('tags'), safeGet('countries'), safeGet('sources', {}, { data:{ categories:[], sources:[] } }), safeGet('guides', { page:1, limit:1 })
    ]);
    const meta = metaRes.data || {};
    const facets = facetsRes.data || {};
    const categories = categoriesRes.data || [];
    const tags = tagsRes.data || [];
    const countries = countriesRes.data || [];
    const sourceCount = sourcesRes.data?.sources?.length || meta.sources?.catalogued || 0;
    const guideTotal = guidesRes.meta?.pagination?.total || 0;
    const contentTypes = facets.content_types || [];
    return `${header('TodayInfo catalog','Explore the whole API','Browse published content types, countries, topics, application guides and the public source catalog.')}<section class="container route-section"><div class="api-stats"><div class="api-stat"><strong>${facets.total || 0}</strong><span>Published</span></div><div class="api-stat"><strong>${countries.length}</strong><span>Countries</span></div><div class="api-stat"><strong>${categories.length}</strong><span>Categories</span></div><div class="api-stat"><strong>${tags.length}</strong><span>Tags</span></div><div class="api-stat"><strong>${sourceCount}</strong><span>Sources</span></div><div class="api-stat"><strong>${guideTotal}</strong><span>Guides</span></div></div><div class="explore-hub-grid"><a class="explore-hub-card" href="/countries" data-route><span>◎</span><strong>Countries</strong><p>Open country hubs and country-specific jobs, bursaries, news and opportunities.</p></a><a class="explore-hub-card" href="/sources" data-route><span>⌁</span><strong>Sources</strong><p>See the categorized public source catalog and how TodayInfo uses each source.</p></a><a class="explore-hub-card" href="/guides" data-route><span>✓</span><strong>Application guides</strong><p>Step-by-step help generated from published application instructions.</p></a><a class="explore-hub-card" href="/trending" data-route><span>↗</span><strong>Trending</strong><p>See what is moving across the published TodayInfo API.</p></a></div><section class="section compact-section"><div class="section-heading"><div><p class="eyebrow">Content types</p><h2>What TodayInfo publishes</h2></div></div><div class="facet-grid">${contentTypes.map(x => `<a href="/${pluralPath(x.value)}" data-route><strong>${esc(typeLabel(x.value))}</strong><span>${x.count} published</span></a>`).join('')}</div></section>${countries.length ? `<section class="section compact-section"><div class="section-heading"><div><p class="eyebrow">Global</p><h2>Countries</h2></div><a class="view-all" href="/countries" data-route>View all →</a></div><div class="country-strip">${countries.slice(0,10).map(c => `<a href="${countryHref(c.code)}" data-route><strong>${esc(c.name || c.code)}</strong><small>${c.count || 0} pages</small></a>`).join('')}</div></section>` : ''}${categories.length ? `<section class="section compact-section"><div class="section-heading"><div><p class="eyebrow">Categories</p><h2>Browse categories</h2></div></div>${topicCards(categories.slice(0,10),'categories')}</section>` : ''}${tags.length ? `<section class="section compact-section"><div class="section-heading"><div><p class="eyebrow">Tags</p><h2>Popular topics</h2></div></div>${topicCards(tags.slice(0,10),'tags')}</section>` : ''}</section>`;
  }

  const facetOptions = (items = [], current = '') => items.slice(0,60).map(x => `<option value="${esc(x.value)}" ${String(x.value) === String(current) ? 'selected' : ''}>${esc(x.value)} (${x.count})</option>`).join('');

  async function searchView() {
    const params = new URLSearchParams(location.search);
    const filters = currentFilters(params);
    const [facetsRes, resultRes] = await Promise.all([
      safeGet('facets', filters, { data:{} }, 30000),
      Object.keys(filters).length ? get('search', { ...filters, visitor_id:visitorId }, 15000) : Promise.resolve({ data:[], meta:{ total:0 } })
    ]);
    const facets = facetsRes.data || {};
    const records = resultRes.data || [];
    const totalPages = Math.max(1, Math.ceil(records.length / state.limit));
    const visible = records.slice((state.page - 1) * state.limit, state.page * state.limit);
    const toolbar = `<form class="search-filter-panel" id="searchForm"><div class="search-filter-main"><input name="q" placeholder="Search jobs, bursaries, organisations, cities…" value="${esc(filters.q || '')}"><button class="button button-primary">Search →</button></div><div class="search-filter-grid"><label>Country<select name="country"><option value="">All countries</option>${facetOptions(facets.countries, filters.country)}</select></label><label>Region<select name="region"><option value="">All regions</option>${facetOptions(facets.regions, filters.region)}</select></label><label>Category<select name="category"><option value="">All categories</option>${facetOptions(facets.categories, filters.category)}</select></label><label>Organisation<select name="organisation"><option value="">All organisations</option>${facetOptions(facets.organisations, filters.organisation)}</select></label><label>Field of study<select name="field_of_study"><option value="">Any field</option>${facetOptions(facets.fields_of_study, filters.field_of_study)}</select></label><label>Work mode<select name="work_mode"><option value="">Any mode</option>${facetOptions(facets.work_modes, filters.work_mode)}</select></label></div><div class="filter-actions"><button class="button button-secondary" type="button" data-clear-search>Clear filters</button><span>${resultRes.meta?.total ?? records.length} matches</span></div></form>`;
    if (!Object.keys(filters).length) return `${header('Search','Find what you need','Search all published TodayInfo content using the API’s structured filters.')}<section class="container route-section">${toolbar}<div class="search-help">Search supports country, region, category, organisation, field of study and work mode. Only published content is returned.</div></section>`;
    return listView(`Search results${filters.q ? ` for “${filters.q}”` : ''}`, 'Published search', visible, { pagination:{ page:state.page, limit:state.limit, total:records.length, totalPages, hasNext:state.page < totalPages, hasPrevious:state.page > 1 } }, 'Results are ranked and filtered by the TodayInfo API.', { toolbar });
  }

  const statusBadge = status => status ? `<span class="status-badge status-${esc(String(status).toLowerCase().replaceAll(' ','-'))}">${esc(titleCase(status))}</span>` : '';

  const factRows = record => {
    const m = record.metadata || {};
    const loc = locationLabel(record);
    const c = record.classification || {};
    if (['bursary','scholarship'].includes(record.type)) return [
      ['Status', statusBadge(m.status)], ['Provider', m.provider || record.organisation], ['Closing date', formatDate(m.closing_date)], ['Country', record.location?.country?.name || record.location?.country?.code], ['Posted', formatDate(record.posted_date)], ['Apply link', m.application_url_verified ? 'Verified destination' : m.application_url ? 'Provided by source' : 'Not available']
    ];
    if (['job','internship','learnership','opportunity'].includes(record.type)) return [
      ['Status', statusBadge(m.status)], ['Organisation', m.company || record.organisation], ['Location', m.location || loc], ['Closing date', formatDate(m.closing_date)], ['Work mode', c.work_mode], ['Job type', c.job_type], ['Posted', formatDate(record.posted_date)], ['Apply link', m.application_url_verified ? 'Verified destination' : m.application_url ? 'Provided by source' : 'Not available']
    ];
    if (['news','announcement'].includes(record.type)) return [['Published', formatDate(record.posted_date)], ['Event date', formatDate(m.event_date)], ['Country', record.location?.country?.name || record.location?.country?.code], ['Updated', formatDate(record.updated_date)]];
    return [['Posted', formatDate(record.posted_date)], ['Updated', formatDate(record.updated_date)], ['Country', record.location?.country?.name || record.location?.country?.code]];
  };

  const sectionsFromMetadata = record => {
    const m = record.metadata || {};
    const sections = [];
    if (m.requirements) sections.push(['Requirements', m.requirements]);
    if (m.eligibility) sections.push(['Who is eligible?', m.eligibility]);
    if (m.responsibilities) sections.push(['Responsibilities', m.responsibilities]);
    if (m.supporting_documents) sections.push(['Supporting documents', m.supporting_documents]);
    if (m.how_to_apply) sections.push(['How to apply', m.how_to_apply]);
    return sections;
  };

  const structuredSection = ([title, body], i) => `<section class="structured-section" id="meta-${i+1}"><h2>${esc(title)}</h2>${String(body).split(/\n{2,}|\n/).filter(Boolean).map(p => `<p>${esc(p.replace(/^[-*•]\s*/, ''))}</p>`).join('')}</section>`;

  const analyticsAttrs = (tracking = {}, fallback = {}) => {
    const event = tracking.event_type || fallback.event_type || '';
    const post = tracking.post_id || fallback.post_id || '';
    const targetUrl = tracking.target_url || fallback.target_url || '';
    const targetTitle = tracking.target_title || fallback.target_title || '';
    const targetType = tracking.target_type || fallback.target_type || '';
    return `data-analytics="${esc(event)}" data-post-id="${esc(post)}" data-target-url="${esc(targetUrl)}" data-target-title="${esc(targetTitle)}" data-target-type="${esc(targetType)}"`;
  };

  const relatedLinks = record => (record.related_links || []).length
    ? `<div class="related-list">${record.related_links.map(item => `<div class="related-item">${link(item.url, item.title || 'Related link', 'related-link', analyticsAttrs(item.tracking, { event_type:'related_click', post_id:record.id, target_url:item.url, target_title:item.title }))}</div>`).join('')}</div>`
    : '<p class="muted">No related links added.</p>';

  const documents = record => (record.documents || []).length
    ? `<div class="download-list">${record.documents.map(item => `<a class="download-button" href="${esc(item.url)}" target="_blank" rel="noopener noreferrer" ${analyticsAttrs({}, { event_type:'download', post_id:record.id, target_url:item.url, target_title:item.title || 'Download' })}><span>↓</span><span><strong>${esc(item.title || 'Download file')}</strong>${item.mime_type ? `<small>${esc(item.mime_type)}</small>` : ''}</span></a>`).join('')}</div>`
    : '';

  const tagList = record => (record.tags || []).length
    ? `<div class="detail-tags">${record.tags.map(tag => `<a class="detail-tag" href="/tags/${encodeURIComponent(tag.slug)}" data-route data-tag-click data-post-id="${esc(record.id)}">#${esc(tag.name)}</a>`).join('')}</div>`
    : '';

  const relationCards = (title, list = [], analyticsType = 'related_click', postId = '') => list.length ? `<section class="container relation-section"><div class="section-heading"><div><p class="eyebrow">Continue exploring</p><h2>${esc(title)}</h2></div></div><div class="content-grid">${list.map(item => `<div data-relation-event="${analyticsType}" data-post-id="${esc(postId)}" data-target-url="${esc(localPath(item))}" data-target-title="${esc(item.title || '')}" data-target-type="${esc(item.type || '')}">${card(item)}</div>`).join('')}</div></section>` : '';

  function detailRecord(record) {
    state.detailPostId = record.id;
    state.readSent = false;
    clearTimeout(state.readTimer);
    state.seo = {
      title:record.seo?.title || record.title,
      description:record.seo?.description || record.description,
      canonical:record.seo?.canonical_path || record.path,
      image:record.main_image || ''
    };
    postEvent('view', record.id, { path:record.path, type:record.type });
    state.readTimer = setTimeout(() => maybeSendRead(), 18000);

    const facts = factRows(record).filter(([,v]) => text(v));
    const metadataSections = sectionsFromMetadata(record);
    const appUrl = record.metadata?.application_url;
    const appVerified = Boolean(record.metadata?.application_url_verified);
    const guide = record.metadata?.application_guide;
    const guidePath = guide?.useful ? `/guides/${encodeURIComponent(record.slug)}-how-to-apply` : '';
    const source = record.source || {};
    const mainImage = record.main_image ? `<img class="detail-image" src="${esc(record.main_image)}" alt="" loading="eager">` : `<div class="detail-image local-cover"><span>${esc(typeLabel(record.type))}</span><strong>${esc(record.title)}</strong></div>`;
    const toc = (record.topic_navigation || []).length ? `<div class="detail-toc"><strong>On this page</strong>${record.topic_navigation.map((t, i) => `<a href="#${esc(t.key || t.id || `t${i+1}`)}">${i+1}. ${esc(t.title)}</a>`).join('')}</div>` : '';
    const topicHtml = (record.topics || []).map((topic, i) => {
      const topicDocs = (topic.documents || []).length ? `<div class="download-list compact-downloads">${topic.documents.map(d => `<a class="download-button" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer" ${analyticsAttrs({}, { event_type:'download', post_id:record.id, target_url:d.url, target_title:d.title || 'Download' })}><span>↓</span><span><strong>${esc(d.title || 'Download file')}</strong>${d.mime_type ? `<small>${esc(d.mime_type)}</small>` : ''}</span></a>`).join('')}</div>` : '';
      const topicImages = (topic.images || []).filter(img => img?.url).map(img => `<figure class="topic-image"><img src="${esc(img.url)}" alt="${esc(img.title || topic.title || '')}" loading="lazy">${img.title ? `<figcaption>${esc(img.title)}</figcaption>` : ''}</figure>`).join('');
      return `<section class="structured-section topic-section" id="${esc(topic.key || topic.id || `t${i+1}`)}"><h2>${esc(topic.title || `Section ${i+1}`)}</h2><div class="detail-content">${topic.body?.html || ''}</div>${topicImages}${(topic.links || []).length ? `<div class="inline-resource-list">${topic.links.map(l => link(l.url, l.title, 'related-link', analyticsAttrs({}, { event_type:'related_click', post_id:record.id, target_url:l.url, target_title:l.title })) ).join('')}</div>` : ''}${topicDocs}</section>`;
    }).join('');
    const crumbs = record.navigation?.breadcrumbs || [];
    const breadcrumb = crumbs.length ? `<nav class="breadcrumbs" aria-label="Breadcrumb">${crumbs.map((item,i) => `${i ? '<span>›</span>' : ''}${link(item.url, item.title)}`).join('')}</nav>` : '';
    const application = appUrl ? `<div class="application-callout ${appVerified ? 'verified-application' : 'source-application'}">${statusBadge(record.metadata?.status)}<div><strong>${appVerified ? 'Verified application destination' : 'Application link from published data'}</strong><p>${appVerified ? 'TodayInfo checked that this link resolves away from the source article to the application destination.' : 'Check the destination and requirements before submitting.'}</p>${guidePath ? `<a class="application-guide-link" href="${guidePath}" data-route>Read the step-by-step guide →</a>` : ''}</div><a class="button button-primary" href="${esc(appUrl)}" target="_blank" rel="noopener noreferrer" ${analyticsAttrs(record.application_tracking || {}, { event_type:'application_click', post_id:record.id, target_url:appUrl, target_title:record.title })}>Apply / Open application →</a></div>` : guidePath ? `<div class="application-callout"><div><strong>Application guide available</strong><p>The published page contains enough instructions for a step-by-step guide.</p></div><a class="button button-primary" href="${guidePath}" data-route>Open guide →</a></div>` : '';
    const sourceCard = source.source_name || source.source_url ? `<div class="side-card source-credit"><p class="eyebrow">Source</p><strong>${esc(source.source_name || 'Original source')}</strong>${source.source_url ? `<p>${link(source.source_url, 'Open original source ↗', 'related-link')}</p>` : ''}<small>TodayInfo structures published information for easier reading. Use the original source for final verification where relevant.</small></div>` : '';

    return `${breadcrumb}<section class="container detail-layout"><article class="detail-article"><p class="eyebrow">${esc(typeLabel(record.type))} · Published on TodayInfo</p><h1>${esc(record.title || 'TodayInfo page')}</h1>${tagList(record)}${mainImage}<p class="detail-lede">${esc(record.description || '')}</p><div class="detail-meta"><span>Posted ${esc(formatDate(record.posted_date) || '—')}</span>${record.updated_date ? `<span>Updated ${esc(formatDate(record.updated_date))}</span>` : ''}${record.location?.country?.name || record.location?.country?.code ? `<span>${esc(record.location.country.name || record.location.country.code)}</span>` : ''}${Number(record.views || 0) ? `<span>${Number(record.views).toLocaleString()} views</span>` : ''}</div>${toc}${application}<div class="detail-content">${record.body?.html || ''}</div>${metadataSections.map(structuredSection).join('')}${topicHtml}${documents(record)}</article><aside class="detail-aside">${facts.length ? `<div class="side-card"><p class="eyebrow">At a glance</p>${facts.map(([k,v]) => `<div class="fact"><small>${esc(k)}</small>${String(v).startsWith('<span') ? v : `<strong>${esc(v)}</strong>`}</div>`).join('')}</div>` : ''}<div class="side-card"><p class="eyebrow">Related links</p>${relatedLinks(record)}</div>${sourceCard}${record.navigation?.links?.length ? `<div class="side-card"><p class="eyebrow">Navigation</p>${record.navigation.links.map(item => link(item.url, item.title, 'related-link')).join('')}</div>` : ''}</aside></section>${relationCards('Related content', record.related_content || [], 'related_click', record.id)}${relationCards('Recommended next', record.recommendations || [], 'recommendation_click', record.id)}`;
  }

  async function detail(apiPath) {
    const response = await get(apiPath, {}, 30000);
    return detailRecord(response.data);
  }

  async function guideList() {
    const response = await get('guides', { page:state.page, limit:state.limit });
    return listView('Application guides','Step-by-step help',response.data || [],response.meta,'Guides created from substantive published application instructions.',{ render:guideCard, empty:'No separate application guides are published yet.' });
  }

  async function guideDetail(slug) {
    const response = await get(`guides/${encodeURIComponent(slug)}`, {}, 30000);
    const guide = response.data || {};
    state.seo = { title:guide.title, description:guide.description, canonical:guide.path };
    const steps = (guide.steps || []).map((step,i) => `<li><span>${i+1}</span><p>${esc(step)}</p></li>`).join('');
    const docs = (guide.supporting_documents || []).map(x => `<li>${esc(x)}</li>`).join('');
    return `${header('Application guide',esc(guide.title || 'How to apply'),guide.description || '')}<section class="container guide-detail"><div class="guide-main"><div class="guide-parent">${guide.parent?.path ? link(guide.parent.path, `← Back to ${guide.parent.title || 'opportunity'}`, 'text-button') : ''}</div><ol class="application-steps">${steps || '<li><span>1</span><p>Follow the instructions on the official application page.</p></li>'}</ol>${docs ? `<section class="structured-section"><h2>Supporting documents</h2><ul class="plain-list">${docs}</ul></section>` : ''}${guide.requirements ? `<section class="structured-section"><h2>Requirements</h2><p>${esc(guide.requirements)}</p></section>` : ''}</div><aside class="detail-aside"><div class="side-card"><p class="eyebrow">Official application</p>${guide.official_application_url ? `<a class="button button-primary full-button" href="${esc(guide.official_application_url)}" target="_blank" rel="noopener noreferrer">Open application ↗</a>` : '<p class="muted">No verified direct application link is stored for this guide.</p>'}${guide.verification?.checked_at ? `<small>Checked ${esc(formatDate(guide.verification.checked_at))}</small>` : ''}</div>${guide.source?.source_name || guide.source?.source_url ? `<div class="side-card"><p class="eyebrow">Source</p><strong>${esc(guide.source?.source_name || 'Original source')}</strong>${guide.source?.source_url ? `<p>${link(guide.source.source_url,'Open source ↗','related-link')}</p>` : ''}</div>` : ''}</aside></section>`;
  }

  async function categoryView(slug) {
    const response = await get(`categories/${encodeURIComponent(slug)}`, currentFilters());
    const category = response.data || {};
    const records = category.records || [];
    const totalPages = Math.max(1, Math.ceil(records.length / state.limit));
    return listView(category.title || slug, 'Category', records.slice((state.page-1)*state.limit,state.page*state.limit), { pagination:{ page:state.page, limit:state.limit, total:records.length, totalPages, hasNext:state.page<totalPages, hasPrevious:state.page>1 } }, `${records.length} published item${records.length === 1 ? '' : 's'} in this category.`);
  }

  async function tagView(slug) {
    const response = await get(`tags/${encodeURIComponent(slug)}`, currentFilters());
    const tag = response.data || {};
    const records = tag.records || [];
    const totalPages = Math.max(1, Math.ceil(records.length / state.limit));
    return listView(`#${tag.name || slug}`, 'Tag', records.slice((state.page-1)*state.limit,state.page*state.limit), { pagination:{ page:state.page, limit:state.limit, total:records.length, totalPages, hasNext:state.page<totalPages, hasPrevious:state.page>1 } }, `${records.length} published item${records.length === 1 ? '' : 's'} using this tag.`);
  }

  async function directory(kind) {
    const response = await get(kind);
    const list = response.data || [];
    return `${header(kind === 'tags' ? 'Content tags' : 'Content categories', kind === 'tags' ? 'Browse tags' : 'Browse categories', `Open a ${kind === 'tags' ? 'tag' : 'category'} to see all published content connected to it.`)}<section class="container route-section">${topicCards(list,kind) || empty(`No ${kind} are published yet.`)}</section>`;
  }

  async function countriesView() {
    const response = await get('countries');
    const countries = response.data || [];
    return `${header('Global TodayInfo','Countries','Browse the countries represented by published TodayInfo content.')}<section class="container route-section"><div class="country-directory">${countries.map(c => `<a class="country-card" href="${countryHref(c.code)}" data-route><div><strong>${esc(c.name || c.code)}</strong><small>${esc(c.code)}</small></div><b>${c.count || 0}</b><span>${Object.entries(c.types || {}).sort((a,b)=>b[1]-a[1]).slice(0,3).map(([t,n]) => `${typeLabel(t)} ${n}`).join(' · ')}</span></a>`).join('') || empty('No country metadata is published yet.')}</div></section>`;
  }

  async function countryHome(code) {
    const country = String(code || '').toUpperCase();
    const [postsRes,trendingRes,locationsRes] = await Promise.all([
      get('posts',{ country, page:1, limit:12 }), safeGet(`trending/${country}`,{ page:1, limit:4 }), safeGet('locations',{ country },{ data:[] })
    ]);
    const records = postsRes.data || [];
    const trendingRows = trendingRes.data || [];
    const loc = (locationsRes.data || [])[0];
    const name = loc?.name || records[0]?.location?.country?.name || country;
    const counts = {};
    records.forEach(x => counts[x.type] = (counts[x.type] || 0) + 1);
    const quick = ['bursaries','scholarships','jobs','internships','learnerships','opportunities','news'];
    return `${header('Country hub',esc(name),`Published TodayInfo content for ${name}.`)}<section class="container route-section"><div class="country-hub-meta"><div><strong>${postsRes.meta?.pagination?.total || records.length}</strong><span>published pages</span></div><div><strong>${loc?.regions?.length || 0}</strong><span>regions</span></div><div><strong>${loc?.cities?.length || 0}</strong><span>cities</span></div></div><div class="country-quick-links">${quick.map(collection => `<a href="/${country.toLowerCase()}/${collection}" data-route>${titleCase(collection)} →</a>`).join('')}</div>${trendingRows.length ? `<section class="section compact-section"><div class="section-heading"><div><p class="eyebrow">Trending in ${esc(name)}</p><h2>Popular now</h2></div></div><div class="content-grid">${trendingRows.map(card).join('')}</div></section>` : ''}<section class="section compact-section"><div class="section-heading"><div><p class="eyebrow">Latest</p><h2>Recently published</h2></div></div><div class="content-grid">${records.map(card).join('') || empty(`No published content for ${name} yet.`)}</div></section></section>`;
  }

  async function sourcesView() {
    const response = await get('sources');
    const categories = response.data?.categories || [];
    const sources = response.data?.sources || [];
    return `${header('Transparency','TodayInfo sources','See the public source catalog, source categories and how each source may be used by TodayInfo.')}<section class="container route-section"><div class="source-public-grid">${categories.map(category => `<section class="source-public-category"><div class="section-heading"><div><p class="eyebrow">Source category</p><h2>${esc(category.label)}</h2><p>${esc(category.description || '')}</p></div></div><div class="source-public-cards">${sources.filter(s => s.category === category.id).map(source => `<article class="source-public-card"><div class="source-public-head"><span>${esc(String(source.integration_status || 'catalogued').replaceAll('_',' '))}</span><strong>${esc(source.label)}</strong></div><p>${esc(source.description || '')}</p><div class="source-public-meta"><span>${esc(source.region || 'Global')}</span><span>${esc((source.content_types || []).map(typeLabel).join(' · '))}</span></div>${source.publishing_policy ? `<div class="source-policy"><strong>${esc(source.publishing_policy.label || 'Publishing policy')}</strong><p>${esc(source.publishing_policy.summary || source.publishing_policy.description || '')}</p></div>` : ''}${source.homepage ? `<a class="text-button" href="${esc(source.homepage)}" target="_blank" rel="noopener noreferrer">Open source ↗</a>` : ''}</article>`).join('')}</div></section>`).join('')}</div></section>`;
  }

  function maybeSendRead() {
    if (!state.detailPostId || state.readSent) return;
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - innerHeight);
    const progress = Math.min(1, scrollY / max);
    if (progress >= 0.45 || max < 900) {
      state.readSent = true;
      postEvent('read', state.detailPostId, { progress:Math.round(progress*100), seconds:18 });
    }
  }

  const countryCodeLike = value => /^[a-z]{2,3}$/i.test(value || '');

  async function route() {
    const path = location.pathname.replace(/\/+$/, '') || '/';
    const params = new URLSearchParams(location.search);
    state.query = params.get('q') || '';
    state.page = Math.max(1, Number(params.get('page') || 1));
    state.detailPostId = null;
    state.readSent = false;
    state.seo = null;
    clearTimeout(state.readTimer);
    app.innerHTML = loading();
    window.scrollTo({ top:0, behavior:'instant' });

    try {
      let html;
      const seg = path.split('/').filter(Boolean).map(decodeURIComponent);
      if (path === '/') html = await home();
      else if (path === '/latest') html = await latest();
      else if (path === '/bursaries') html = await bursaries();
      else if (path === '/scholarships') html = await scholarships();
      else if (path === '/jobs') html = await jobs();
      else if (path === '/news') html = await news();
      else if (path === '/internships') html = await internships();
      else if (path === '/learnerships') html = await learnerships();
      else if (path === '/opportunities') html = await opportunities();
      else if (path === '/trending') html = await trending();
      else if (path === '/for-you') html = await forYou();
      else if (path === '/explore') html = await explore();
      else if (path === '/search') html = await searchView();
      else if (path === '/categories') html = await directory('categories');
      else if (path === '/tags') html = await directory('tags');
      else if (path === '/countries') html = await countriesView();
      else if (path === '/sources') html = await sourcesView();
      else if (path === '/guides') html = await guideList();
      else if (seg[0] === 'guides' && seg[1]) html = await guideDetail(seg.slice(1).join('/'));
      else if (seg.length === 3 && countryCodeLike(seg[0]) && seg[1] === 'guides') html = await guideDetail(seg[2]);
      else if (seg[0] === 'categories' && seg[1]) html = await categoryView(seg.slice(1).join('/'));
      else if (seg[0] === 'tags' && seg[1]) html = await tagView(seg.slice(1).join('/'));
      else if (seg[0] === 'category' && seg[1]) html = await categoryView(seg.slice(1).join('/'));
      else if (seg[0] === 'topic' && seg[1]) html = await tagView(seg.slice(1).join('/'));
      else if (seg.length === 1 && countryCodeLike(seg[0])) html = await countryHome(seg[0]);
      else if (seg.length === 2 && countryCodeLike(seg[0]) && COLLECTIONS.has(seg[1])) html = await collection(`${seg[0].toLowerCase()}/${seg[1]}`, `${titleCase(seg[1])} in ${seg[0].toUpperCase()}`, 'Country collection', `Published ${titleCase(seg[1]).toLowerCase()} for this country.`);
      else if (seg.length === 4 && countryCodeLike(seg[0]) && seg[1] === 'news') html = await detail(seg.map(encodeURIComponent).join('/'));
      else if (seg.length === 3 && countryCodeLike(seg[0]) && COLLECTIONS.has(seg[1])) html = await detail(seg.map(encodeURIComponent).join('/'));
      else if (seg.length >= 2 && ['posts','pages','news','announcements','articles','bursaries','scholarships','jobs','internships','learnerships','opportunities','stories'].includes(seg[0])) html = await detail(seg.map(encodeURIComponent).join('/'));
      else if (seg[0] === 'article' && seg[1]) html = await detail(`articles/${encodeURIComponent(seg.slice(1).join('/'))}`);
      else if (seg[0] === 'bursary' && seg[1]) html = await detail(`bursaries/${encodeURIComponent(seg.slice(1).join('/'))}`);
      else if (seg[0] === 'page' && seg[1]) html = await detail(`pages/${encodeURIComponent(seg.slice(1).join('/'))}`);
      else html = errorState('That TodayInfo route does not exist.');

      app.innerHTML = html;
      bind();
      updateSeo(path);
    } catch (error) {
      console.error(error);
      const slug = decodeURIComponent(path.split('/').filter(Boolean).at(-1) || '');
      if (slug) {
        try {
          const redirect = await get(`redirect/${encodeURIComponent(slug)}`, {}, 5000);
          if (redirect.data?.to) return navigate(`/posts/${encodeURIComponent(redirect.data.to)}`, true);
        } catch {}
      }
      app.innerHTML = errorState(error.message);
      bind();
      updateSeo(path, 'API error');
    }
  }

  function updateSeo(path, override) {
    const heading = app.querySelector('h1');
    const description = state.seo?.description || app.querySelector('.detail-lede, .page-heading>p:last-child')?.textContent || override || 'Published TodayInfo content.';
    const rawTitle = state.seo?.title || heading?.textContent || (path === '/' ? 'TodayInfo — Your daily briefing' : `TodayInfo — ${path.replace(/^\//,'').replaceAll('/',' · ').replaceAll('-',' ')}`);
    const title = rawTitle.includes('TodayInfo') ? rawTitle : `${rawTitle} — TodayInfo`;
    const canonicalPath = state.seo?.canonical || path;
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', description.slice(0,160));
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `${location.origin}${canonicalPath}`);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', description.slice(0,160));
    document.querySelector('meta[property="og:url"]')?.setAttribute('content', `${location.origin}${canonicalPath}`);
    const image = state.seo?.image || app.querySelector('.detail-image[src], .content-card-image[src]')?.getAttribute('src');
    if (image) document.querySelector('meta[property="og:image"]')?.setAttribute('content', image);
    const first = path.split('/').filter(Boolean)[0] || '';
    const navKey = path === '/' ? 'home' : first === 'latest' ? 'latest' : first === 'bursaries' ? 'bursaries' : first === 'jobs' ? 'jobs' : first === 'news' ? 'news' : ['explore','categories','tags','countries','sources','guides','scholarships','opportunities','trending','for-you'].includes(first) ? 'explore' : first === 'search' ? 'search' : '';
    $$('[data-nav]').forEach(item => item.classList.toggle('active', item.dataset.nav === navKey));
  }

  function navigate(url, replace = false) {
    if (replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
    route();
  }

  function bind() {
    $$('[data-route]', app).forEach(a => a.addEventListener('click', e => {
      const href = a.getAttribute('href');
      if (href?.startsWith('/')) { e.preventDefault(); navigate(href); }
    }));
    $$('[data-page]', app).forEach(b => b.addEventListener('click', () => {
      if (b.disabled) return;
      const params = new URLSearchParams(location.search);
      params.set('page', b.dataset.page);
      navigate(`${location.pathname}?${params}`);
    }));
    const searchForm = $('#searchForm', app);
    if (searchForm) searchForm.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(searchForm); const params = new URLSearchParams();
      for (const [k,v] of fd.entries()) if (String(v).trim()) params.set(k,String(v).trim());
      navigate(`/search${params.toString() ? `?${params}` : ''}`);
    });
    $('[data-clear-search]', app)?.addEventListener('click', () => navigate('/search'));
    $('#routeSearch', app)?.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.value.trim()) navigate(`/search?q=${encodeURIComponent(e.target.value.trim())}`); });
    $$('[data-retry]', app).forEach(b => b.addEventListener('click', route));
    $$('.detail-content a[href^="/"], .structured-section a[href^="/"]', app).forEach(a => a.setAttribute('data-route',''));
    $$('[data-analytics]', app).forEach(a => a.addEventListener('click', () => postEvent(
      a.dataset.analytics,
      a.dataset.postId || state.detailPostId,
      {
        target_url:a.dataset.targetUrl || a.getAttribute('href') || '',
        target_title:a.dataset.targetTitle || a.textContent.trim(),
        target_type:a.dataset.targetType || '',
        source_title:app.querySelector('h1')?.textContent || ''
      }
    )));
    $$('[data-tag-click]', app).forEach(a => a.addEventListener('click', () => postEvent('tag_click', a.dataset.postId || state.detailPostId, { tag:a.textContent.replace(/^#/,'') })));
    $$('[data-relation-event]', app).forEach(wrapper => wrapper.addEventListener('click', e => {
      if (!e.target.closest('a')) return;
      postEvent(wrapper.dataset.relationEvent, wrapper.dataset.postId || state.detailPostId, {
        target_url:wrapper.dataset.targetUrl || e.target.closest('a')?.getAttribute('href') || '',
        target_title:wrapper.dataset.targetTitle || e.target.closest('a')?.textContent.trim() || '',
        target_type:wrapper.dataset.targetType || ''
      });
    }));
  }

  window.addEventListener('scroll', () => { if (state.detailPostId && !state.readSent) maybeSendRead(); }, { passive:true });
  window.addEventListener('popstate', route);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-route]');
    if (a && a.getAttribute('href')?.startsWith('/') && !e.defaultPrevented) { e.preventDefault(); navigate(a.getAttribute('href')); }
  });

  const root = document.documentElement;
  const saved = localStorage.getItem('todayinfo-theme'); if (saved) root.dataset.theme = saved;
  $('#themeToggle')?.addEventListener('click', () => { const next = root.dataset.theme === 'dark' ? 'light' : 'dark'; root.dataset.theme = next; localStorage.setItem('todayinfo-theme', next); });
  $('#menuToggle')?.addEventListener('click', e => { const nav = $('.main-nav'); nav.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', String(nav.classList.contains('open'))); });
  $$('.main-nav a').forEach(a => a.addEventListener('click', () => $('.main-nav')?.classList.remove('open')));

  Promise.resolve(safeGet('meta', {}, { data:{} }, 300000)).then(r => state.capabilities = r.data || {}).finally(route);
})();