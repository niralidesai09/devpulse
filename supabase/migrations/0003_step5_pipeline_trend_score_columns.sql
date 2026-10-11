-- =====================================================================
-- Step 5: pipeline runs, smart-baseline trend and Opportunity Score columns.
-- Applied to project oxibeeaaelnavkjngneg as migration "step5_pipeline_trend_score_columns".
-- =====================================================================
alter table public.runs add column trigger text not null default 'cron' check (trigger in ('cron', 'manual'));
alter table public.runs add column stats jsonb not null default '{}'::jsonb;   -- collected / kept / dropped / timings

alter table public.posts add column matched_keyword text;                      -- keyword that found the post

-- Trend from the SMART BASELINE: keyword-match counts for BOTH weeks (fair comparison).
alter table public.topic_stats rename column prev_mention_count to baseline_last_week;
alter table public.topic_stats add column baseline_this_week integer;
alter table public.topic_stats add column trend text check (trend in ('up', 'down', 'flat', 'new', 'no_data'));
alter table public.topic_stats add column trend_detail jsonb not null default '{}'::jsonb; -- per-source counts
alter table public.topic_stats add column avg_sentiment numeric;
-- Opportunity Score components (so the UI can explain "why this score").
alter table public.topic_stats add column score_frequency  numeric;  -- mentions / max mentions (0..1)
alter table public.topic_stats add column score_growth     numeric;  -- 0.5 .. 2 (1 = flat)
alter table public.topic_stats add column score_unresolved numeric;  -- unresolved / mentions (0..1)
alter table public.topic_stats add column score_severity   numeric;  -- avg severity / 5 (0..1)
alter table public.topic_stats add column score_raw        numeric;  -- product of the 4 components

create index runs_status_idx on public.runs (status);
