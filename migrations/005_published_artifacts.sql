-- TodayInfo v0.4 published JSON artifact tracking.
-- R2 stores the published JSON; this column only tracks where/how it was published.
alter table if exists posts
  add column if not exists publication jsonb not null default '{}'::jsonb;

create index if not exists posts_publication_gin on posts using gin(publication);
