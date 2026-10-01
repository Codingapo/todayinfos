const PLACEHOLDER_HOSTS = new Set([
  'host',
  'hostname',
  'your-host',
  'your_host',
  'example-host',
  'db-host'
]);

export function inspectDatabaseUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) return { valid: false, reason: 'missing', host: null };

  let url;
  try {
    url = new URL(raw);
  } catch {
    return { valid: false, reason: 'malformed', host: null };
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    return { valid: false, reason: 'unsupported-protocol', host: url.hostname || null };
  }

  const host = String(url.hostname || '').trim().toLowerCase();
  if (!host) return { valid: false, reason: 'missing-host', host: null };
  if (PLACEHOLDER_HOSTS.has(host) || host.includes('your-project') || host.includes('your_host')) {
    return { valid: false, reason: 'placeholder-host', host };
  }

  return { valid: true, reason: null, host };
}

export function resolveStoreMode({ requestedMode = 'auto', databaseUrl = '' } = {}) {
  const mode = String(requestedMode || 'auto').trim().toLowerCase();
  if (!['auto', 'demo', 'postgres'].includes(mode)) {
    throw new Error(`DATA_STORE must be one of: auto, demo, postgres. Received: ${requestedMode}`);
  }

  const database = inspectDatabaseUrl(databaseUrl);

  if (mode === 'demo') return { mode: 'demo', database, fallback: false };

  if (mode === 'postgres') {
    if (!database.valid) {
      const extra = database.host ? ` (host: ${database.host})` : '';
      throw new Error(
        `DATA_STORE=postgres requires a valid DATABASE_URL; current value is ${database.reason}${extra}. ` +
        'Use your real Supabase/PostgreSQL connection string, or set DATA_STORE=auto/demo while testing.'
      );
    }
    return { mode: 'postgres', database, fallback: false };
  }

  if (database.valid) return { mode: 'postgres', database, fallback: false };
  return { mode: 'demo', database, fallback: true };
}


export function collectDatabaseUrls(env=process.env,{max=20}={}) {
  const candidates=[
    env.DATABASE_URL,
    ...String(env.DATABASE_URLS||'').split(/[\n,;]+/),
    ...Array.from({length:max},(_,i)=>env[`DATABASE_URL_${i+1}`])
  ].map(x=>String(x||'').trim()).filter(Boolean);
  return [...new Set(candidates.filter(x=>inspectDatabaseUrl(x).valid))];
}
