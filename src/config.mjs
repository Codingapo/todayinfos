import { inspectDatabaseUrl, resolveStoreMode } from './lib/database-config.mjs';

const envFlag = (name) => {
  const raw = process.env[name];
  if (raw == null || String(raw).trim() === '') return null;
  return String(raw).trim().toLowerCase() !== 'false';
};

// DATA_STORE is the preferred setting. DEMO_MODE remains supported for older deployments:
// - DEMO_MODE=true forces demo mode.
// - DEMO_MODE=false means "do not force demo" and lets DATA_STORE/auto decide.
const legacyDemo = envFlag('DEMO_MODE');
const requestedDataStore = legacyDemo === true
  ? 'demo'
  : (process.env.DATA_STORE || 'auto');

const databaseCandidates=[
  process.env.DATABASE_URL,
  ...(process.env.DATABASE_URLS||'').split(/[\n,;]+/),
  ...Array.from({length:20},(_,i)=>process.env[`DATABASE_URL_${i+1}`])
].map(x=>String(x||'').trim()).filter(Boolean);
const databaseUrls=[...new Set(databaseCandidates.filter(x=>inspectDatabaseUrl(x).valid))];
const databaseUrl=databaseUrls[0]||process.env.DATABASE_URL||'';
const storeResolution = resolveStoreMode({ requestedMode: requestedDataStore, databaseUrl });
const jwtSecret = process.env.JWT_SECRET || 'todayinfo-dev-only-change-me';
const nodeEnv = process.env.NODE_ENV || 'development';

export const config = {
  nodeEnv,
  port: Number(process.env.PORT || 8787),
  appOrigin: process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 8787}`,
  jwtSecret,

  // Effective storage mode after validating DATABASE_URL.
  dataStore: storeResolution.mode,
  dataStoreFallback: storeResolution.fallback,
  databaseDiagnostic: storeResolution.database,
  demoMode: storeResolution.mode === 'demo',
  demoAdminUsername: process.env.DEMO_ADMIN_USERNAME || 'apo',
  demoAdminPassword: process.env.DEMO_ADMIN_PASSWORD || 'admin',

  sourceApiBase: (process.env.SOURCE_API_BASE || 'https://todayinfo-zpshgscq.manus.space/api/v1').replace(/\/$/, ''),
  databaseUrl,
  databaseUrls,
  databaseSsl: String(process.env.DATABASE_SSL ?? 'true').toLowerCase() !== 'false',
  supabase: {
    url: (process.env.SUPABASE_URL1 || '').replace(/\/$/, ''),
    key: process.env.SUPABASE_KEY || '',
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'todayinfo'
  },
  r2: {
    accountId: process.env.R2_ACCOUNT_ID || '',
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || 'todayinfo',
    publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/$/, '')
  },
  resendApiKey: process.env.RESEND_API_KEY || '',
  resendFrom: process.env.RESEND_FROM || 'TodayInfo <noreply@example.com>'
};

const insecureJwt = !jwtSecret ||
  jwtSecret === 'todayinfo-dev-only-change-me' ||
  jwtSecret === 'replace-with-a-long-random-secret';

if (config.nodeEnv === 'production' && insecureJwt) {
  throw new Error('JWT_SECRET must be replaced with a long random secret in production.');
}
