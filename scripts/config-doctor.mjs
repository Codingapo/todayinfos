import 'dotenv/config';
import dns from 'node:dns/promises';
import { inspectDatabaseUrl, resolveStoreMode, collectDatabaseUrls, isLikelySupabaseDirectHost } from '../src/lib/database-config.mjs';

const databaseUrls=collectDatabaseUrls(process.env,{max:20});
const databaseUrl=databaseUrls[0]||process.env.DATABASE_URL||'';
const legacy=String(process.env.DEMO_MODE||'').trim().toLowerCase();
const requestedMode=legacy==='true'?'demo':(process.env.DATA_STORE||'auto');
const inspection=inspectDatabaseUrl(databaseUrl);

console.log('TodayInfo configuration doctor');
console.log('------------------------------');
console.log(`Requested store: ${requestedMode}`);
console.log(`DATABASE_URL_IPV4: ${process.env.DATABASE_URL_IPV4?'set':'not set'}`);
console.log(`DATABASE_URL: ${process.env.DATABASE_URL?'set':'not set'}`);
console.log(`Effective database URLs: ${databaseUrls.length}`);
console.log(`Database URL valid: ${inspection.valid?'yes':'no'}`);
if(!inspection.valid)console.log(`Database URL reason: ${inspection.reason}`);
if(inspection.host)console.log(`Database host: ${inspection.host}`);

if(inspection.host){
  try{
    const a=await dns.resolve4(inspection.host);
    console.log(`IPv4 DNS (A): ${a.length?a.join(', '):'none'}`);
  }catch(error){
    console.log(`IPv4 DNS (A): none (${error.code||error.message})`);
  }
  try{
    const aaaa=await dns.resolve6(inspection.host);
    console.log(`IPv6 DNS (AAAA): ${aaaa.length?aaaa.join(', '):'none'}`);
  }catch(error){
    console.log(`IPv6 DNS (AAAA): none (${error.code||error.message})`);
  }
  if(isLikelySupabaseDirectHost(inspection.host)&&!process.env.DATABASE_URL_IPV4){
    console.log('');
    console.log('WARNING: This looks like a Supabase direct database hostname.');
    console.log('Supabase direct database endpoints are normally IPv6 unless the IPv4 add-on is enabled.');
    console.log('On an IPv4-only VPS, copy the Session pooler string from Supabase -> Connect and set DATABASE_URL_IPV4.');
  }
}

try{
  const resolved=resolveStoreMode({requestedMode,databaseUrl});
  console.log(`Effective store: ${resolved.mode}`);
  console.log(`Automatic fallback: ${resolved.fallback?'yes':'no'}`);
  if(resolved.fallback)console.log('NOTE: demo storage is suitable for testing but should not be treated as persistent production storage.');
}catch(error){
  console.error(`CONFIG ERROR: ${error.message}`);
  process.exitCode=1;
}
