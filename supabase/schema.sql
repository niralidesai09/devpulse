-- =====================================================================
-- DevPulse database schema (Supabase / Postgres)
-- Applied to project oxibeeaaelnavkjngneg as migration "create_devpulse_schema".
--
-- Security model:
--   * Row Level Security (RLS) is ON for every table.
--   * The public "anon" key (used in the browser) can only READ.
--   * All writes happen on the server with the service role key,
--     which bypasses RLS. No insert/update/delete policies exist.
-- =====================================================================

-- ---------------------------------------------------------------------
-- topics: the categories Sumit wants to monitor + their search keywords.
-- Editable in Supabase without code changes (hard rule).
-- ---------------------------------------------------------------------
create table public.topics (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  keywords    text[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- runs: one row each time the weekly pipeline runs (cron or "Run now").
-- sources_status records which data sources worked, e.g.
--   {"hackernews": {"ok": true, "count": 120}, "github": {"ok": false, "error": "..."}}
-- ---------------------------------------------------------------------
create table public.runs (
  id             uuid primary key default gen_random_uuid(),
  started_at     timestamptz not null default now(),
  finished_at    timestamptz,
  status         text not null default 'running'
                 check (status in ('running', 'success', 'partial', 'failed')),
  window_start   timestamptz,          -- start of the 7-day data window
  window_end     timestamptz,          -- end of the 7-day data window
  sources_status jsonb not null default '{}'::jsonb,
  error          text
);

-- ---------------------------------------------------------------------
-- posts: every real thread fetched in a run, plus Gemini's classification.
-- The same URL can appear again in a later run, but only once per run.
-- ---------------------------------------------------------------------
create table public.posts (
  id                uuid primary key default gen_random_uuid(),
  run_id            uuid not null references public.runs(id) on delete cascade,
  source            text not null
                    check (source in ('hackernews', 'stackoverflow', 'github', 'devto')),
  external_id       text,               -- the post's id on its own website
  url               text not null,
  title             text not null,
  snippet           text,
  author            text,
  score             integer,            -- upvotes / points / reactions
  comment_count     integer,
  posted_at         timestamptz,
  -- Filled in by Gemini classification:
  topic_id          uuid references public.topics(id) on delete set null,
  pain_point        text,               -- one-line summary of the problem
  is_unresolved     boolean,
  unresolved_reason text,
  sentiment         text check (sentiment in ('positive', 'neutral', 'negative')),
  severity          smallint check (severity between 1 and 5),
  competitors       text[] not null default '{}',
  created_at        timestamptz not null default now(),
  unique (run_id, url)                  -- dedupe by URL within a run
);

-- ---------------------------------------------------------------------
-- topic_stats: the numbers per topic per run (counts, trend, score).
-- One row per (run, topic), so the primary key is the pair.
-- ---------------------------------------------------------------------
create table public.topic_stats (
  run_id             uuid not null references public.runs(id) on delete cascade,
  topic_id           uuid not null references public.topics(id) on delete cascade,
  mention_count      integer not null default 0,
  prev_mention_count integer,           -- null when there is no previous run
  change_pct         numeric,           -- null when there is no previous run
  unresolved_count   integer not null default 0,
  avg_severity       numeric,
  opportunity_score  numeric check (opportunity_score between 0 and 100),
  primary key (run_id, topic_id)
);

-- ---------------------------------------------------------------------
-- briefs: the executive brief (markdown) Gemini writes for each run.
-- ---------------------------------------------------------------------
create table public.briefs (
  id         uuid primary key default gen_random_uuid(),
  run_id     uuid not null unique references public.runs(id) on delete cascade,
  markdown   text not null,
  emailed_at timestamptz,               -- null until Resend sends it
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- suggested_topics: Emerging Topic Radar. New pain points Gemini spots
-- that no keyword covers yet. Sumit approves or rejects them.
-- ---------------------------------------------------------------------
create table public.suggested_topics (
  id            uuid primary key default gen_random_uuid(),
  run_id        uuid references public.runs(id) on delete set null,
  name          text not null,
  keywords      text[] not null default '{}',
  evidence_urls text[] not null default '{}',
  status        text not null default 'pending'
                check (status in ('pending', 'approved', 'rejected')),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Indexes: make the common lookups fast.
-- (posts.run_id is already covered by the unique (run_id, url) index,
--  topic_stats.run_id by its primary key, briefs.run_id by its unique.)
-- ---------------------------------------------------------------------
create index posts_topic_id_idx            on public.posts (topic_id);
create index posts_posted_at_idx           on public.posts (posted_at desc);
create index runs_started_at_idx           on public.runs (started_at desc);
create index topic_stats_topic_id_idx      on public.topic_stats (topic_id);
create index suggested_topics_run_id_idx   on public.suggested_topics (run_id);
create index suggested_topics_status_idx   on public.suggested_topics (status);

-- ---------------------------------------------------------------------
-- Row Level Security: browser (anon) may read, never write.
-- ---------------------------------------------------------------------
alter table public.topics           enable row level security;
alter table public.runs             enable row level security;
alter table public.posts            enable row level security;
alter table public.topic_stats      enable row level security;
alter table public.briefs           enable row level security;
alter table public.suggested_topics enable row level security;

create policy "Public read access" on public.topics           for select to anon, authenticated using (true);
create policy "Public read access" on public.runs             for select to anon, authenticated using (true);
create policy "Public read access" on public.posts            for select to anon, authenticated using (true);
create policy "Public read access" on public.topic_stats      for select to anon, authenticated using (true);
create policy "Public read access" on public.briefs           for select to anon, authenticated using (true);
create policy "Public read access" on public.suggested_topics for select to anon, authenticated using (true);

-- Extra safety: remove write permissions from the public roles entirely,
-- so even a mistakenly added policy could not allow browser writes.
revoke insert, update, delete, truncate on
  public.topics, public.runs, public.posts,
  public.topic_stats, public.briefs, public.suggested_topics
from anon, authenticated;
