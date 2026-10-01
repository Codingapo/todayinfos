-- TodayInfo Control Center schema (structured-content edition).
-- IMPORTANT: compare this with BOTH existing Supabase databases before running it.
create extension if not exists pgcrypto;

create table if not exists admin_users (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  email text not null unique,
  display_name text not null,
  role text not null default 'viewer',
  password_hash text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists raw_imports (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  source_name text,
  source_id text,
  source_url text,
  source_slug text,
  source_hash text,
  source_payload jsonb not null default '{}'::jsonb,
  detected_type text,
  prepared_draft jsonb not null default '{}'::jsonb,
  review_status text not null default 'unreviewed',
  promoted_post_id uuid,
  source_changed boolean not null default false,
  quality_score integer not null default 0,
  quality_issues jsonb not null default '[]'::jsonb,
  source_record_date timestamptz,
  fetch_count integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raw_imports_review_status_idx on raw_imports(review_status);
create index if not exists raw_imports_source_id_idx on raw_imports(source_id);

create table if not exists posts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  content_type text not null default 'other',
  summary text not null default '',
  body_markdown text not null default '',
  posted_date timestamptz,
  category text,
  categories text[] not null default '{}',
  tags text[] not null default '{}',
  topics jsonb not null default '[]'::jsonb,
  related_links jsonb not null default '[]'::jsonb,
  related_ids uuid[] not null default '{}',
  recommendation_ids uuid[] not null default '{}',
  recommendation_links jsonb not null default '[]'::jsonb,
  documents jsonb not null default '[]'::jsonb,
  navigation_links jsonb not null default '[]'::jsonb,
  type_data jsonb not null default '{}'::jsonb,
  main_image_url text,
  seo_title text,
  seo_description text,
  source jsonb,
  status text not null default 'draft',
  is_trending boolean not null default false,
  created_by uuid references admin_users(id) on delete set null,
  updated_by uuid references admin_users(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index if not exists posts_public_idx on posts(status,content_type,published_at desc) where deleted_at is null;
create index if not exists posts_tags_gin on posts using gin(tags);
create index if not exists posts_categories_gin on posts using gin(categories);
create index if not exists posts_type_data_gin on posts using gin(type_data);

create table if not exists post_revisions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references posts(id) on delete cascade,
  snapshot jsonb not null,
  actor_id uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists redirects (
  id uuid primary key default gen_random_uuid(),
  from_slug text not null unique,
  to_slug text not null,
  created_at timestamptz not null default now()
);

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  visitor_id text,
  event_type text not null,
  post_id uuid references posts(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists analytics_events_created_idx on analytics_events(created_at desc);
create index if not exists analytics_events_post_idx on analytics_events(post_id,event_type,created_at desc);

create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  url text not null,
  key text not null,
  provider text,
  media_kind text,
  mime_type text,
  size_bytes bigint,
  title text,
  alt_text text,
  uploaded_by uuid references admin_users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists site_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references admin_users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_created_idx on audit_logs(created_at desc);
