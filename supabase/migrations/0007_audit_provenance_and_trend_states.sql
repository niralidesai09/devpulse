-- =====================================================================
-- Final audit: provenance + honest trend states.
-- Applied to project oxibeeaaelnavkjngneg as migration "audit_provenance_and_trend_states".
-- =====================================================================

-- 1. When we fetched each record from its source (separate from when it was published).
alter table public.posts add column retrieved_at timestamptz;
update public.posts set retrieved_at = created_at where retrieved_at is null;
alter table public.posts alter column retrieved_at set default now();
alter table public.posts alter column retrieved_at set not null;

-- 2. "low_data": too few keyword matches in the two weeks to state a direction.
alter table public.topic_stats drop constraint if exists topic_stats_trend_check;
alter table public.topic_stats add constraint topic_stats_trend_check
  check (trend in ('up', 'down', 'flat', 'new', 'low_data', 'no_data'));

-- 3. Document which columns are ORIGINAL SOURCE DATA and which are AI INTERPRETATION.
comment on column public.posts.source        is 'Source data: hackernews | github | stackoverflow | devto';
comment on column public.posts.external_id   is 'Source data: the record id on the source site (stable identifier)';
comment on column public.posts.url           is 'Source data: canonical URL taken from the source API (never generated)';
comment on column public.posts.title         is 'Source data: original title (HN comments: "Comment on: <story title at collection time>")';
comment on column public.posts.snippet       is 'Source data: verbatim excerpt (HTML stripped, max 500 chars, around the matched keyword)';
comment on column public.posts.posted_at     is 'Source data: original publication time';
comment on column public.posts.retrieved_at  is 'Provenance: when Groundswell fetched the record';
comment on column public.posts.run_id        is 'Provenance: the collection run that fetched the record';
comment on column public.posts.matched_keyword is 'Provenance: topic keyword that matched the source text';
comment on column public.posts.topic_id      is 'AI interpretation: topic chosen by the classifier (null = relevant but no topic fits)';
comment on column public.posts.pain_point    is 'AI interpretation: one-line summary of the problem';
comment on column public.posts.is_unresolved is 'AI interpretation (uses source signals such as open issue / accepted answer)';
comment on column public.posts.unresolved_reason is 'AI interpretation: evidence used for is_unresolved';
comment on column public.posts.sentiment     is 'AI interpretation: -1 .. 1';
comment on column public.posts.severity      is 'AI interpretation: 1 .. 5';
comment on column public.posts.competitors   is 'AI interpretation: tools named in the post, normalised by code';
