export const SOURCE_CATEGORIES=[
  {id:'todayinfo_network',label:'TodayInfo Network',description:'Sources already understood by the TodayInfo extraction rules.'},
  {id:'south_africa_official',label:'South Africa Official',description:'Government and public-interest sources used for first-party discovery and verification.'},
  {id:'public_job_apis',label:'Public Job APIs',description:'Public job feeds and APIs that can be normalized into TodayInfo records.'},
  {id:'employer_ats',label:'Employer ATS Boards',description:'Public employer applicant-tracking-system job boards.'},
  {id:'scholarships_funding',label:'Scholarships & Funding',description:'Official scholarship and funding programme sources.'},
  {id:'international_organisations',label:'International Organisations',description:'First-party careers and opportunity sites from international organisations.'}
];

export const SOURCE_CATALOG=[
  {
    id:'dailyupdate',label:'DailyUpdate',category:'todayinfo_network',region:'South Africa',country_code:'ZA',
    content_types:['job','internship','learnership'],mode:'todayinfo_api',integration_status:'active',
    description:'Long-form employment articles. TodayInfo rejects archive pages and extracts requirements, how-to-apply text and useful related opportunities.',
    homepage:'https://dailyupdate.co.za/',aliases:['dailyupdate','daily update'],
    action:{type:'fetch',fetch:{kind:'dailyupdate/jobs',maxPages:100,expand:true,expandRelated:true,relatedLimit:150,autoPublish:true}}
  },
  {
    id:'zabursaries',label:'ZA Bursaries',category:'todayinfo_network',region:'South Africa',country_code:'ZA',
    content_types:['bursary','scholarship'],mode:'todayinfo_api',integration_status:'active',
    description:'Structured funding articles. TodayInfo extracts eligibility, supporting documents, closing dates and application routes while using monthly listing pages as discovery indexes.',
    homepage:'https://www.zabursaries.co.za/',aliases:['zabursaries','za bursaries'],
    action:{type:'fetch',fetch:{kind:'bursaries',maxPages:100,expand:true,expandRelated:true,relatedLimit:200,autoPublish:true}}
  },
  {
    id:'psychometric-test',label:'Psychometric Test Topic',category:'todayinfo_network',region:'South Africa',country_code:'ZA',
    content_types:['job','other'],mode:'todayinfo_api',integration_status:'active',
    description:'Dedicated TodayInfo source topic retained for psychometric-test related pages and links.',
    homepage:'https://todayinfo-zpshgscq.manus.space/api/v1/tags/psychometric-test',aliases:['psychometric-test'],
    action:{type:'fetch',fetch:{kind:'tag',tagSlug:'psychometric-test',maxPages:20,expand:true,expandRelated:true,relatedLimit:80,autoPublish:true}}
  },

  {
    id:'sanews',label:'SAnews',category:'south_africa_official',region:'South Africa',country_code:'ZA',
    content_types:['news','bursary','opportunity'],mode:'official_rss',integration_status:'active',
    description:'Official South African Government News Agency feed. TodayInfo creates short attributed plain-English summaries in batches of up to 10.',
    homepage:'https://www.sanews.gov.za/',aliases:['sanews','south african government news agency'],
    action:{type:'news_batch',source:'sanews',limit:10}
  },
  {
    id:'dsti-news',label:'DSTI News Feed',category:'south_africa_official',region:'South Africa',country_code:'ZA',
    content_types:['news','opportunity'],mode:'official_rss',integration_status:'active',
    description:'Official Department of Science, Technology and Innovation RSS feed for news, announcements and opportunity discovery.',
    homepage:'https://www.dsti.gov.za/',aliases:['dsti','department of science technology and innovation'],
    action:{type:'news_batch',source:'dsti',limit:10}
  },
  {
    id:'dpsa',label:'DPSA Public Service Vacancy Circular',category:'south_africa_official',region:'South Africa',country_code:'ZA',
    content_types:['job'],mode:'first_party',integration_status:'discovery',
    description:'Official South African public-service vacancy circulars organised by national department and province.',
    homepage:'https://www.dpsa.gov.za/newsroom/psvc/',aliases:['dpsa','public service vacancy circular']
  },
  {
    id:'western-cape-government',label:'Western Cape Government Opportunities',category:'south_africa_official',region:'South Africa',country_code:'ZA',
    content_types:['bursary','internship','learnership','job'],mode:'first_party',integration_status:'discovery',
    description:'Official Western Cape Government information for bursaries, internships, learnerships and related opportunities.',
    homepage:'https://www.westerncape.gov.za/bursaries-internships-and-learnerships',aliases:['western cape government']
  },
  {
    id:'nsfas',label:'NSFAS',category:'south_africa_official',region:'South Africa',country_code:'ZA',
    content_types:['bursary','news'],mode:'first_party',integration_status:'discovery',
    description:'Official South African student financial-aid information and application updates.',
    homepage:'https://www.nsfas.org.za/',aliases:['nsfas']
  },
  {
    id:'govza',label:'South African Government',category:'south_africa_official',region:'South Africa',country_code:'ZA',
    content_types:['job','internship','bursary','news'],mode:'first_party',integration_status:'discovery',
    description:'Official government notices and opportunity pages used as verification and discovery sources.',
    homepage:'https://www.gov.za/',aliases:['gov.za','south african government']
  },

  {
    id:'arbeitnow',label:'Arbeitnow',category:'public_job_apis',region:'Global / Europe',country_code:null,
    content_types:['job','internship'],mode:'public_api',integration_status:'active',
    description:'Public job-board API already normalized by TodayInfo.',
    homepage:'https://www.arbeitnow.com/',aliases:['arbeitnow'],
    action:{type:'harvest',provider:'arbeitnow'}
  },
  {
    id:'jobicy',label:'Jobicy',category:'public_job_apis',region:'Global / Remote',country_code:null,
    content_types:['job','internship'],mode:'public_api',integration_status:'active',
    description:'Public remote-jobs feed already normalized by TodayInfo.',
    homepage:'https://jobicy.com/',aliases:['jobicy'],
    action:{type:'harvest',provider:'jobicy'}
  },
  {
    id:'remoteok',label:'Remote OK',category:'public_job_apis',region:'Global / Remote',country_code:null,
    content_types:['job'],mode:'public_api',integration_status:'active',
    description:'Public remote-job feed normalized with source attribution.',
    homepage:'https://remoteok.com/',aliases:['remote ok','remoteok'],
    action:{type:'harvest',provider:'remoteok'}
  },
  {
    id:'remotive',label:'Remotive',category:'public_job_apis',region:'Global / Remote',country_code:null,
    content_types:['job','internship'],mode:'public_api',integration_status:'active',
    description:'Public remote-jobs API. TodayInfo keeps Remotive attribution and links users back to the source listing.',
    homepage:'https://remotive.com/',aliases:['remotive'],
    action:{type:'harvest',provider:'remotive'}
  },
  {
    id:'eures',label:'EURES',category:'public_job_apis',region:'European Union / EEA',country_code:null,
    content_types:['job','internship'],mode:'official_portal',integration_status:'discovery',
    description:'Official European employment-services network used for first-party job discovery and location verification.',
    homepage:'https://eures.europa.eu/',aliases:['eures']
  },
  {
    id:'usajobs',label:'USAJOBS',category:'public_job_apis',region:'United States',country_code:'US',
    content_types:['job'],mode:'official_api',integration_status:'credentials_required',
    description:'Official United States federal jobs API. Search access requires registered API credentials and source attribution.',
    homepage:'https://developer.usajobs.gov/',aliases:['usajobs']
  },
  {
    id:'adzuna',label:'Adzuna',category:'public_job_apis',region:'Multiple countries',country_code:null,
    content_types:['job'],mode:'licensed_api',integration_status:'licence_required',
    description:'Jobs API with publishing and attribution conditions. TodayInfo keeps it catalogued until appropriate API credentials/licensing are configured.',
    homepage:'https://developer.adzuna.com/',aliases:['adzuna']
  },

  {
    id:'lever',label:'Lever Public Boards',category:'employer_ats',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'public_ats',integration_status:'active',
    description:'Employer-first public Lever postings. Add employer board slugs in Source Hub.',
    homepage:'https://www.lever.co/',aliases:['lever'],
    action:{type:'harvest',provider:'lever',requires:'leverSites'}
  },
  {
    id:'ashby',label:'Ashby Public Boards',category:'employer_ats',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'public_ats',integration_status:'active',
    description:'Employer-first public Ashby job boards. Add employer board names in Source Hub.',
    homepage:'https://www.ashbyhq.com/',aliases:['ashby'],
    action:{type:'harvest',provider:'ashby',requires:'ashbyBoards'}
  },
  {
    id:'greenhouse',label:'Greenhouse Job Board API',category:'employer_ats',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'public_ats',integration_status:'active',
    description:'Public GET job-board API for employer-published Greenhouse roles. Add employer board tokens in Source Hub.',
    homepage:'https://docs.greenhouse.io/job-board.html',aliases:['greenhouse'],
    action:{type:'harvest',provider:'greenhouse',requires:'greenhouseBoards'}
  },
  {
    id:'workable',label:'Workable Public Careers',category:'employer_ats',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'public_ats',integration_status:'active',
    description:'Public Workable careers endpoints expose published employer jobs. Add account subdomains in Source Hub.',
    homepage:'https://www.workable.com/',aliases:['workable'],
    action:{type:'harvest',provider:'workable',requires:'workableAccounts'}
  },
  {
    id:'smartrecruiters',label:'SmartRecruiters Posting API',category:'employer_ats',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'public_ats',integration_status:'active',
    description:'Public employer posting API. Add company identifiers in Source Hub.',
    homepage:'https://developers.smartrecruiters.com/docs/posting-api',aliases:['smartrecruiters','smart recruiters'],
    action:{type:'harvest',provider:'smartrecruiters',requires:'smartRecruitersCompanies'}
  },
  {
    id:'recruitee',label:'Recruitee Careers Site API',category:'employer_ats',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'public_ats',integration_status:'credentials_required',
    description:'Careers Site API for employer job offers. The platform is moving toward token-authenticated access, so TodayInfo keeps this disabled until credentials are configured.',
    homepage:'https://docs.recruitee.com/reference/intro-to-careers-site-api',aliases:['recruitee']
  },

  {
    id:'daad',label:'DAAD Scholarship Database',category:'scholarships_funding',region:'Global / Germany',country_code:'DE',
    content_types:['scholarship'],mode:'first_party',integration_status:'discovery',
    description:'Official DAAD scholarship database for international students and researchers.',
    homepage:'https://www2.daad.de/deutschland/stipendium/datenbank/en/21148-scholarship-database/',aliases:['daad']
  },
  {
    id:'chevening',label:'Chevening',category:'scholarships_funding',region:'Global / United Kingdom',country_code:'GB',
    content_types:['scholarship'],mode:'first_party',integration_status:'discovery',
    description:'Official UK-government international scholarship programme source.',
    homepage:'https://www.chevening.org/scholarships/',aliases:['chevening']
  },
  {
    id:'erasmus-plus',label:'Erasmus+',category:'scholarships_funding',region:'Europe / Global',country_code:null,
    content_types:['scholarship','opportunity'],mode:'first_party',integration_status:'discovery',
    description:'Official European Union education, training and mobility opportunity source.',
    homepage:'https://erasmus-plus.ec.europa.eu/',aliases:['erasmus','erasmus+']
  },
  {
    id:'mastercard-foundation',label:'Mastercard Foundation Scholars Program',category:'scholarships_funding',region:'Africa / Global',country_code:null,
    content_types:['scholarship'],mode:'first_party',integration_status:'discovery',
    description:'Official Mastercard Foundation Scholars Program information and partner opportunities.',
    homepage:'https://mastercardfdn.org/all/scholars/',aliases:['mastercard foundation']
  },

  {
    id:'un-careers',label:'United Nations Careers',category:'international_organisations',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'first_party',integration_status:'discovery',
    description:'Official United Nations careers source for vacancies and internships.',
    homepage:'https://careers.un.org/',aliases:['un careers','united nations']
  },
  {
    id:'unicef-jobs',label:'UNICEF Careers',category:'international_organisations',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'first_party',integration_status:'discovery',
    description:'Official UNICEF job and internship source.',
    homepage:'https://jobs.unicef.org/',aliases:['unicef']
  },
  {
    id:'who-careers',label:'WHO Careers',category:'international_organisations',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'first_party',integration_status:'discovery',
    description:'Official World Health Organization careers source.',
    homepage:'https://www.who.int/careers',aliases:['who','world health organization']
  },
  {
    id:'world-bank-careers',label:'World Bank Careers',category:'international_organisations',region:'Global',country_code:null,
    content_types:['job','internship'],mode:'first_party',integration_status:'discovery',
    description:'Official World Bank Group careers and programme source.',
    homepage:'https://www.worldbank.org/en/about/careers',aliases:['world bank']
  }
];

export const ACTIVE_HARVEST_SOURCE_IDS=SOURCE_CATALOG.filter(x=>x.action?.type==='harvest').map(x=>x.id);

export function categorizedSources(){
  return SOURCE_CATEGORIES.map(category=>({
    ...category,
    sources:SOURCE_CATALOG.filter(source=>source.category===category.id)
  }));
}

function matchesSource(row,source){
  const text=`${row?.source_name||''} ${row?.source_url||''} ${row?.source?.source_name||''} ${row?.source?.source_url||''}`.toLowerCase();
  return (source.aliases||[source.id]).some(alias=>text.includes(String(alias).toLowerCase()));
}

export function sourceCatalogWithStats({imports=[],posts=[]}={}){
  return SOURCE_CATALOG.map(source=>{
    const sourceImports=imports.filter(row=>matchesSource(row,source));
    const sourcePosts=posts.filter(row=>matchesSource(row,source));
    return {
      ...source,
      stats:{
        imports:sourceImports.length,
        waiting:sourceImports.filter(x=>x.review_status==='unreviewed').length,
        promoted:sourceImports.filter(x=>x.review_status==='promoted'||x.promoted_post_id).length,
        published:sourcePosts.filter(x=>x.status==='published'&&!x.deleted_at).length,
        average_quality:sourceImports.length?Math.round(sourceImports.reduce((n,x)=>n+Number(x.quality_score||0),0)/sourceImports.length):0,
        last_seen_at:sourceImports.map(x=>x.last_seen_at||x.updated_at).filter(Boolean).sort().at(-1)||null
      }
    };
  });
}

export function sourceHubPayload({imports=[],posts=[],permanentRecords=80}={}){
  const catalog=sourceCatalogWithStats({imports,posts});
  return {
    schema:'todayinfo.source-hub.v2',
    generated_at:new Date().toISOString(),
    totals:{
      sources:catalog.length,
      active:catalog.filter(x=>x.integration_status==='active').length,
      discovery:catalog.filter(x=>x.integration_status==='discovery').length,
      credentials_required:catalog.filter(x=>['credentials_required','licence_required'].includes(x.integration_status)).length,
      permanent_records:permanentRecords
    },
    categories:SOURCE_CATEGORIES.map(category=>({...category,sources:catalog.filter(source=>source.category===category.id)})),
    sources:catalog,
    regional:catalog.filter(x=>x.category==='todayinfo_network'),
    global:catalog.filter(x=>x.action?.type==='harvest'),
    permanent_seeds:{expected_records:permanentRecords,description:'South Africa and Africa reference datasets are published on startup.'}
  };
}
