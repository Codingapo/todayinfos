import { config } from '../config.mjs';
import { DemoStore } from './store-demo.mjs';
import { PostgresStore } from './store-postgres.mjs';

export const store = config.dataStore === 'postgres'
  ? new PostgresStore({ connectionString: config.databaseUrl, ssl: config.databaseSsl })
  : new DemoStore();
