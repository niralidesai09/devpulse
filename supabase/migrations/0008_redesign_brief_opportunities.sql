-- =====================================================================
-- Redesign: structured opportunity notes and recommendations on briefs.
-- Applied to project oxibeeaaelnavkjngneg as migration "redesign_brief_opportunities".
-- These are AI interpretation and are labelled as such in the UI.
-- =====================================================================
alter table public.briefs add column opportunities   jsonb not null default '[]'::jsonb; -- [{topic, struggle, whyItMatters, evidence[{url,title,source}]}]
alter table public.briefs add column recommendations jsonb not null default '[]'::jsonb; -- [{title, why, evidence[{url,title,source}]}]
