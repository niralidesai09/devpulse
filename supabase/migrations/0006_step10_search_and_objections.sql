-- =====================================================================
-- Step 10: full-text search for "Ask the Pulse" + structured objections.
-- Applied to project oxibeeaaelnavkjngneg as migration "step10_search_and_objections".
-- =====================================================================

-- A generated column keeps the search vector up to date automatically.
alter table public.posts add column fts tsvector
  generated always as (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(pain_point, '') || ' ' || coalesce(snippet, ''))
  ) stored;
create index posts_fts_idx on public.posts using gin (fts);

-- search_posts(q): turns a plain-English question into search words
-- (English stemming, stop words like "what"/"the" removed), finds posts
-- matching ANY of them, ranks posts that match more words higher, and
-- keeps the newest copy of each URL (the same thread can appear in many runs).
-- Lexemes are quoted, so user input can never break the query syntax.
create or replace function public.search_posts(q text, max_results int default 12)
returns table (
  id uuid, url text, title text, source text, snippet text, pain_point text, topic_id uuid,
  is_unresolved boolean, severity smallint, sentiment numeric, competitors text[], posted_at timestamptz, rank real
)
language sql stable
set search_path = ''
as $$
  with query as (
    select to_tsquery('simple', string_agg(quote_literal(lexeme), ' | ')) as tsq
    from unnest(tsvector_to_array(to_tsvector('english', q))) as lexeme
  ),
  hits as (
    select distinct on (p.url) p.id, p.url, p.title, p.source, p.snippet, p.pain_point, p.topic_id,
           p.is_unresolved, p.severity, p.sentiment, p.competitors, p.posted_at,
           ts_rank_cd(p.fts, query.tsq) as rank
    from public.posts p, query
    where query.tsq is not null and p.fts @@ query.tsq
    order by p.url, p.created_at desc
  )
  select * from hits order by rank desc, posted_at desc limit least(greatest(max_results, 1), 30);
$$;
revoke execute on function public.search_posts(text, int) from public, anon, authenticated;
grant execute on function public.search_posts(text, int) to service_role;

-- The brief's sales objections, stored as structured data for the dashboard.
alter table public.briefs add column objections jsonb not null default '[]'::jsonb;
