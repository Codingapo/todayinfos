import 'dotenv/config';
import { inspectDatabaseUrl, resolveStoreMode } from '../src/lib/database-config.mjs';

const databaseUrl = process.env.DATABASE_URL || '';
const legacy = String(process.env.DEMO_MODE || '').trim().toLowerCase();
const requestedMode = legacy === 'true' ? 'demo' : (process.env.DATA_STORE || 'auto');
const inspection = inspectDatabaseUrl(databaseUrl);

console.log('TodayInfo configuration doctor');
console.log('------------------------------');
console.log(`Requested store: ${requestedMode}`);
console.log(`DATABASE_URL: ${databaseUrl ? 'set' : 'not set'}`);
console.log(`Database URL valid: ${inspection.valid ? 'yes' : 'no'}`);
if (!inspection.valid) console.log(`Database URL reason: ${inspection.reason}`);
if (inspection.host) console.log(`Database host: ${inspection.host}`);

try {
  const resolved = resolveStoreMode({ requestedMode, databaseUrl });
  console.log(`Effective store: ${resolved.mode}`);
  console.log(`Automatic fallback: ${resolved.fallback ? 'yes' : 'no'}`);
  if (resolved.fallback) {
    console.log('NOTE: demo storage is suitable for testing but should not be treated as persistent production storage.');
  }
} catch (error) {
  console.error(`CONFIG ERROR: ${error.message}`);
  process.exitCode = 1;
}
