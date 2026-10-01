-- TodayInfo v0.3 import-memory upgrade.
-- Review this against the real Supabase schema before running in production.
alter table if exists raw_imports add column if not exists source_hash text;
alter table if exists raw_imports add column if not exists source_changed boolean not null default false;
alter table if exists raw_imports add column if not exists quality_score integer not null default 0;
alter table if exists raw_imports add column if not exists quality_issues jsonb not null default '[]'::jsonb;
alter table if exists raw_imports add column if not exists source_record_date timestamptz;
alter table if exists raw_imports add column if not exists fetch_count integer not null default 1;
alter table if exists raw_imports add column if not exists first_seen_at timestamptz not null default now();
alter table if exists raw_imports add column if not exists last_seen_at timestamptz not null default now();
alter table if exists raw_imports add column if not exists last_changed_at timestamptz not null default now();

create index if not exists raw_imports_last_seen_idx on raw_imports(last_seen_at desc);
create index if not exists raw_imports_source_changed_idx on raw_imports(source_changed) where source_changed=true;
