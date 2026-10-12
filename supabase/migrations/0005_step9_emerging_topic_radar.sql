-- =====================================================================
-- Step 9: Emerging Topic Radar — richer suggestions + who decided what.
-- Applied to project oxibeeaaelnavkjngneg as migration "step9_emerging_topic_radar".
-- (Posts the classifier marks "other" are saved with topic_id = null and
--  clustered into suggested_topics; Sumit approves -> a new row in topics.)
-- =====================================================================
alter table public.suggested_topics add column description text;
alter table public.suggested_topics add column rationale   text;                 -- why Gemini thinks it matters
alter table public.suggested_topics add column post_count  integer not null default 0; -- evidence threads behind it
alter table public.suggested_topics add column decided_at  timestamptz;          -- when Sumit approved / rejected
alter table public.suggested_topics add column topic_id    uuid references public.topics(id) on delete set null; -- topic created on approve
create index suggested_topics_topic_id_idx on public.suggested_topics (topic_id);
