import { config } from '../config.mjs';
import { DemoStore } from './store-demo.mjs';
import { PostgresStore } from './store-postgres.mjs';

if (!config.demoMode && !config.databaseUrl) throw new Error('DATABASE_URL is required when DEMO_MODE=false.');
export const store = config.demoMode ? new DemoStore() : new PostgresStore({ connectionString: config.databaseUrl, ssl: config.databaseSsl });
