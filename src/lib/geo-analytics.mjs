const CONTINENTS={
  Africa:'DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW EH',
  Europe:'AL AD AT BY BE BA BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH TR UA GB VA',
  Asia:'AF AM AZ BH BD BT BN KH CN GE IN ID IR IQ IL JP JO KZ KW KG LA LB MY MV MN MM NP KP KR OM PK PS PH QA SA SG LK SY TJ TH TL TM AE UZ VN YE',
  'North America':'AG BS BB BZ CA CR CU DM DO SV GD GT HT HN JM MX NI PA KN LC VC TT US',
  'South America':'AR BO BR CL CO EC GY PY PE SR UY VE FK GF',
  Oceania:'AU FJ KI MH FM NR NZ PW PG WS SB TO TV VU'
};
const CODE_TO_CONTINENT=new Map();
for(const [continent,codes] of Object.entries(CONTINENTS))for(const code of codes.split(' '))CODE_TO_CONTINENT.set(code,continent);

export function continentForCode(code=''){
  return CODE_TO_CONTINENT.get(String(code).trim().toUpperCase())||'Other';
}

export function buildTrafficAtlas(countryRows=[]){
  const countries=(countryRows||[]).map(row=>{
    const code=String(row.code||row.name||row.country_code||'').trim().toUpperCase();
    return{
      code,
      name:row.country_name||row.label||code||'Unknown',
      continent:continentForCode(code),
      visitors:Number(row.visitors||0),events:Number(row.events||row.count||0),
      views:Number(row.views||0),reads:Number(row.reads||0),searches:Number(row.searches||0),
      application_clicks:Number(row.application_clicks||0),downloads:Number(row.downloads||0)
    };
  }).filter(x=>x.code);

  const byContinent={};
  for(const country of countries){
    const c=byContinent[country.continent]||{
      name:country.continent,visitors:0,events:0,views:0,reads:0,searches:0,application_clicks:0,downloads:0,countries:0
    };
    c.visitors+=country.visitors;c.events+=country.events;c.views+=country.views;c.reads+=country.reads;
    c.searches+=country.searches;c.application_clicks+=country.application_clicks;c.downloads+=country.downloads;c.countries+=1;
    byContinent[country.continent]=c;
  }
  return{
    countries:countries.sort((a,b)=>b.visitors-a.visitors||b.events-a.events),
    continents:Object.values(byContinent).sort((a,b)=>b.visitors-a.visitors||b.events-a.events)
  };
}
