-- TodayInfo v0.3.1 recommendations and import workflow update.
-- Review this against the real Supabase schema before running in production.

alter table if exists posts
  add column if not exists recommendation_links jsonb not null default '[]'::jsonb;

-- The Ignore workflow has been removed. Bring old hidden imports back for review.
update raw_imports
set review_status='unreviewed', updated_at=now()
where review_status='ignored';
