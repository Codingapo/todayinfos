-- TodayInfo v0.4 global content model.
-- Review against your real Supabase schema before applying.

alter table if exists posts
  add column if not exists geo jsonb not null default '{}'::jsonb,
  add column if not exists classification jsonb not null default '{}'::jsonb;

create index if not exists posts_geo_gin on posts using gin(geo);
create index if not exists posts_classification_gin on posts using gin(classification);
create index if not exists posts_country_idx on posts((upper(coalesce(geo->>'country_code',''))));
create index if not exists posts_region_idx on posts((lower(coalesce(geo->>'region_name',''))));
create index if not exists posts_city_idx on posts((lower(coalesce(geo->>'city',''))));
create index if not exists posts_organisation_idx on posts((lower(coalesce(classification->>'organisation',''))));
