-- =====================================================================
-- 0003 — DevPulse v2 intelligence schema
--
-- Why v2: the v1 tables stored posts PER RUN (unique run_id+url), so the
-- same discussion was copied into every run and could not be counted
-- reliably across weeks. v2 stores each discussion ONCE (stable source id),
-- keeps the model's interpretation in a separate table, groups discussions
-- into canonical pain points, and snapshots every report so reporting
-- periods can be compared later without regenerating history.
--
-- Layers (kept separate on purpose):
--   configuration : topics, topic_keywords, sources
--   ingestion     : collection_runs, source_runs, discussions
--   analysis      : pain_points, discussion_analysis
--   reporting     : reports, report_pain_points, report_evidence
--   decisions     : pain_point_decisions (human, never AI)
--
-- Security: RLS on every table with NO policies for anon/authenticated.
-- The browser never talks to Supabase; all reads and writes happen on the
-- server with the service-role key.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Archive v1 run tables (kept for reference, removed from the API).
-- ---------------------------------------------------------------------
create schema if not exists archive;
revoke all on schema archive from anon, authenticated;

alter table if exists public.suggested_topics set schema archive;
alter table if exists public.briefs           set schema archive;
alter table if exists public.topic_stats      set schema archive;
alter table if exists public.posts            set schema archive;
alter table if exists public.runs             set schema archive;

-- Shared trigger: keep updated_at current.
create or replace function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ---------------------------------------------------------------------
-- 1. Configuration
-- ---------------------------------------------------------------------
alter table public.topics add column if not exists updated_at  timestamptz not null default now();
alter table public.topics add column if not exists archived_at timestamptz;
alter table public.topics add constraint topics_name_not_blank check (length(btrim(name)) between 2 and 80);
create unique index if not exists topics_name_lower_key on public.topics (lower(btrim(name)));
create trigger topics_updated_at before update on public.topics
  for each row execute function public.set_updated_at();

create table public.topic_keywords (
  id                 uuid primary key default gen_random_uuid(),
  topic_id           uuid not null references public.topics(id) on delete cascade,
  keyword            text not null check (length(btrim(keyword)) between 2 and 80),
  -- lower-cased + single-spaced; used for uniqueness and matching
  keyword_normalized text generated always as (lower(regexp_replace(btrim(keyword), '\s+', ' ', 'g'))) stored,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
-- A keyword may belong to only ONE topic, otherwise a match would be ambiguous.
create unique index topic_keywords_normalized_key on public.topic_keywords (keyword_normalized);
create index topic_keywords_topic_idx on public.topic_keywords (topic_id);
create trigger topic_keywords_updated_at before update on public.topic_keywords
  for each row execute function public.set_updated_at();

-- Move v1 keyword arrays into rows (first topic wins if a keyword repeats).
insert into public.topic_keywords (topic_id, keyword)
select t.id, k
from public.topics t, unnest(t.keywords) as k
on conflict do nothing;

alter table public.topics drop column if exists keywords;

create table public.sources (
  id           text primary key check (id ~ '^[a-z0-9_]+$'),
  display_name text not null,
  is_enabled   boolean not null default true,
  docs_url     text,
  notes        text,
  updated_at   timestamptz not null default now()
);
create trigger sources_updated_at before update on public.sources
  for each row execute function public.set_updated_at();

insert into public.sources (id, display_name, docs_url, notes) values
  ('hackernews',    'Hacker News',    'https://hn.algolia.com/api',                         'Algolia search API, stories + comments, no key'),
  ('github',        'GitHub Issues',  'https://docs.github.com/en/rest/search/search',      'Issue search (title match), needs GITHUB_TOKEN'),
  ('stackoverflow', 'Stack Overflow', 'https://api.stackexchange.com/docs/advanced-search', 'Stack Exchange API v2.3, optional key'),
  ('devto',         'DEV Community',  'https://developers.forem.com/api/v1',                'Forem articles API by tag, no key')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- 2. Ingestion
-- ---------------------------------------------------------------------
create table public.collection_runs (
  id               uuid primary key default gen_random_uuid(),
  trigger          text not null check (trigger in ('cron', 'manual', 'retry')),
  status           text not null default 'running'
                   check (status in ('running', 'succeeded', 'partial', 'failed')),
  -- e.g. "cron:2026-10-09T18:30:00Z" — a scheduled run for the same period
  -- can only exist once, so duplicate cron deliveries are harmless.
  idempotency_key  text unique,
  lookback_start   timestamptz,          -- oldest publication date requested
  lookback_end     timestamptz,          -- newest publication date requested
  config_snapshot  jsonb not null default '{}'::jsonb, -- topics + keywords used
  stats            jsonb not null default '{}'::jsonb, -- counts + timings
  pipeline_version text not null,
  model            text,
  error            text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  created_at       timestamptz not null default now()
);
create index collection_runs_started_idx on public.collection_runs (started_at desc);
-- At most ONE run may be "running" at any time (atomic, race-free guard).
create unique index collection_runs_one_running on public.collection_runs ((true)) where status = 'running';

create table public.source_runs (
  id              uuid primary key default gen_random_uuid(),
  run_id          uuid not null references public.collection_runs(id) on delete cascade,
  source_id       text not null references public.sources(id),
  status          text not null check (status in ('succeeded', 'partial', 'failed', 'skipped')),
  window_start    timestamptz,
  window_end      timestamptz,
  requests        integer not null default 0,
  failed_requests integer not null default 0,
  fetched_count   integer not null default 0,  -- keyword-matched records returned
  new_count       integer not null default 0,  -- not seen before
  duplicate_count integer not null default 0,  -- already stored (no inflation)
  truncated       boolean not null default false, -- a query hit the page limit
  error           text,
  duration_ms     integer,
  created_at      timestamptz not null default now(),
  unique (run_id, source_id)
);
create index source_runs_source_idx on public.source_runs (source_id, created_at desc);

create table public.discussions (
  id                uuid primary key default gen_random_uuid(),
  source_id         text not null references public.sources(id),
  external_id       text not null,                 -- id on the source site
  url               text not null,
  url_normalized    text not null,
  title             text not null,
  excerpt           text,                          -- verbatim text around the keyword
  author            text,
  score             integer,
  comment_count     integer,
  published_at      timestamptz not null,          -- original publication time (UTC)
  first_retrieved_at timestamptz not null default now(),
  last_retrieved_at  timestamptz not null default now(),
  first_run_id      uuid references public.collection_runs(id) on delete set null,
  last_run_id       uuid references public.collection_runs(id) on delete set null,
  matched_keywords  text[] not null default '{}',
  matched_topic_ids uuid[] not null default '{}',
  signals           jsonb not null default '{}'::jsonb, -- e.g. {"isOpen": true}
  -- analysis lifecycle
  analysis_status   text not null default 'pending'
                    check (analysis_status in ('pending', 'analyzed', 'irrelevant', 'failed')),
  analysis_attempts integer not null default 0,
  analysis_error    text,
  -- human curation
  is_excluded       boolean not null default false,
  exclusion_reason  text,
  excluded_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (source_id, external_id),               -- primary dedupe key
  unique (url_normalized)                        -- secondary dedupe key
);
create index discussions_published_idx on public.discussions (published_at desc);
create index discussions_status_idx    on public.discussions (analysis_status) where analysis_status in ('pending', 'failed');
create index discussions_source_pub_idx on public.discussions (source_id, published_at desc);
create index discussions_search_idx on public.discussions
  using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(excerpt, '')));
create trigger discussions_updated_at before update on public.discussions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Analysis (model output — kept apart from what authors wrote)
-- ---------------------------------------------------------------------
create table public.pain_points (
  id          uuid primary key default gen_random_uuid(),
  topic_id    uuid references public.topics(id) on delete set null,
  title       text not null,
  description text not null,
  slug        text not null unique,
  created_by  text not null default 'ai' check (created_by in ('ai', 'user')),
  merged_into uuid references public.pain_points(id) on delete set null,
  created_run_id uuid references public.collection_runs(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index pain_points_topic_idx on public.pain_points (topic_id);
create trigger pain_points_updated_at before update on public.pain_points
  for each row execute function public.set_updated_at();

create table public.discussion_analysis (
  discussion_id      uuid primary key references public.discussions(id) on delete cascade,
  is_relevant        boolean not null,
  relevance_reason   text not null,
  topic_id           uuid references public.topics(id) on delete set null,
  pain_point_id      uuid references public.pain_points(id) on delete set null,
  problem_summary    text,                 -- the model's paraphrase, NOT a quote
  evidence_quote     text,                 -- verified verbatim substring of the source text
  quote_verified     boolean not null default false,
  is_unresolved      boolean,
  unresolved_evidence text,
  workaround         text,                 -- only if the author describes one
  tools_mentioned    text[] not null default '{}',
  tool_dissatisfaction boolean,            -- author says an existing tool falls short
  frustration        text check (frustration in ('none', 'low', 'medium', 'high')),
  severity           smallint check (severity between 1 and 5),
  model              text not null,
  prompt_version     text not null,
  run_id             uuid references public.collection_runs(id) on delete set null,
  analyzed_at        timestamptz not null default now()
);
create index discussion_analysis_pp_idx    on public.discussion_analysis (pain_point_id);
create index discussion_analysis_topic_idx on public.discussion_analysis (topic_id);

-- ---------------------------------------------------------------------
-- 4. Reporting (immutable snapshots)
-- ---------------------------------------------------------------------
create table public.reports (
  id               uuid primary key default gen_random_uuid(),
  run_id           uuid references public.collection_runs(id) on delete set null,
  trigger          text not null check (trigger in ('cron', 'manual', 'retry')),
  status           text not null default 'generating'
                   check (status in ('generating', 'succeeded', 'failed')),
  timezone         text not null,
  period_start     timestamptz not null,
  period_end       timestamptz not null,
  prev_period_start timestamptz not null,
  prev_period_end  timestamptz not null,
  metrics          jsonb not null default '{}'::jsonb, -- deterministic numbers (code)
  brief            jsonb,                              -- validated Gemini output
  validation       jsonb not null default '{}'::jsonb, -- grounding checks
  model            text,
  prompt_version   text,
  pipeline_version text not null,
  error            text,
  email_status     text not null default 'not_configured'
                   check (email_status in ('not_configured', 'pending', 'sent', 'failed', 'skipped')),
  email_provider_id text,
  email_error      text,
  emailed_at       timestamptz,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  check (period_end > period_start),
  check (prev_period_end = period_start)
);
create index reports_period_idx on public.reports (period_end desc, created_at desc);

create table public.report_pain_points (
  report_id        uuid not null references public.reports(id) on delete cascade,
  pain_point_id    uuid not null references public.pain_points(id) on delete cascade,
  title            text not null,           -- snapshot at report time
  topic_id         uuid references public.topics(id) on delete set null,
  topic_name       text,
  current_count    integer not null,
  previous_count   integer not null,
  abs_change       integer not null,
  pct_change       numeric,                 -- null when previous = 0
  trend_status     text not null check (trend_status in ('new', 'growing', 'stable', 'declining', 'gone', 'insufficient_data')),
  unresolved_count integer not null default 0,
  source_count     integer not null default 0,
  periods_present  integer not null default 0,
  signal_score     numeric not null,
  signal_components jsonb not null default '{}'::jsonb,
  rank             integer not null,
  primary key (report_id, pain_point_id)
);

create table public.report_evidence (
  id            uuid primary key default gen_random_uuid(),
  report_id     uuid not null references public.reports(id) on delete cascade,
  discussion_id uuid not null references public.discussions(id) on delete cascade,
  pain_point_id uuid references public.pain_points(id) on delete set null,
  claim_ref     text not null,  -- which brief item cites it, e.g. "recommendations[0]"
  unique (report_id, discussion_id, claim_ref)
);
create index report_evidence_report_idx on public.report_evidence (report_id);
create index report_evidence_discussion_idx on public.report_evidence (discussion_id);

-- ---------------------------------------------------------------------
-- 5. Human decisions (Product Decision Workspace) — append-only history
-- ---------------------------------------------------------------------
create table public.pain_point_decisions (
  id            uuid primary key default gen_random_uuid(),
  pain_point_id uuid not null references public.pain_points(id) on delete cascade,
  decision      text not null check (decision in ('investigate', 'validate', 'backlog', 'monitor', 'dismiss')),
  rationale     text check (rationale is null or length(rationale) <= 1000),
  report_id     uuid references public.reports(id) on delete set null,
  decided_by    text not null default 'pm',
  created_at    timestamptz not null default now()
);
create index pain_point_decisions_pp_idx on public.pain_point_decisions (pain_point_id, created_at desc);

-- ---------------------------------------------------------------------
-- 6. Row Level Security: deny everything to browser roles.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['topics', 'topic_keywords', 'sources', 'collection_runs', 'source_runs',
                           'discussions', 'pain_points', 'discussion_analysis', 'reports',
                           'report_pain_points', 'report_evidence', 'pain_point_decisions']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
  end loop;
end $$;

-- v1 allowed public reads of topics; v2 reads happen on the server only.
drop policy if exists "Public read access" on public.topics;
