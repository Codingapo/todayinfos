import { config } from '../config.mjs';
import { DemoStore } from './store-demo.mjs';
import { PostgresStore } from './store-postgres.mjs';
import { LocalFallbackStore } from './local-fallback-store.mjs';
import { FederatedStore } from './federated-store.mjs';

let resolvedStore;

if(config.dataStore==='postgres'){
  const dbs=config.databaseUrls.map(url=>new PostgresStore({connectionString:url,ssl:config.databaseSsl,connectionTimeoutMillis:config.databaseConnectTimeoutMs}));
  const primary=dbs[0];
  const fallback=new LocalFallbackStore();
  resolvedStore=new FederatedStore({primary,readers:dbs.slice(1),fallback});
}else{
  resolvedStore=new DemoStore();
}

export const store=resolvedStore;
