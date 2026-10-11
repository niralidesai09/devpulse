-- =====================================================================
-- Step 6: extra facts about each Friday brief.
-- Applied to project oxibeeaaelnavkjngneg as migration "step6_brief_metadata".
-- =====================================================================
alter table public.briefs add column model       text;                              -- Gemini model that wrote it
alter table public.briefs add column email_error text;                              -- why sending failed (null = ok / not sent)
alter table public.briefs add column checks      jsonb not null default '{}'::jsonb; -- self-checks: evidence links used, unverified numbers
