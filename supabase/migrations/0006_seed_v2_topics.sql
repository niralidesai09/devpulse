-- =====================================================================
-- 0006 — extra starter topics required by the brief (all editable in the
-- app under Settings → Topics). Safe to re-run.
-- =====================================================================

insert into public.topics (name, description) values
  ('CI/CD integration reliability',
   'Code review and CI tools failing to integrate reliably: webhooks, status checks, GitHub/GitLab apps, required checks that hang.'),
  ('Existing tool limitations',
   'Developers describing what current code review / static analysis tools cannot do, or why they abandoned them.')
on conflict do nothing;

insert into public.topic_keywords (topic_id, keyword)
select t.id, k
from public.topics t
join (values
  ('CI/CD integration reliability', 'status check stuck'),
  ('CI/CD integration reliability', 'required status check'),
  ('CI/CD integration reliability', 'webhook not triggering'),
  ('CI/CD integration reliability', 'GitHub App permissions'),
  ('CI/CD integration reliability', 'merge queue'),
  ('CI/CD integration reliability', 'GitLab CI integration'),
  ('Existing tool limitations',     'switched from SonarQube'),
  ('Existing tool limitations',     'code review tool'),
  ('Existing tool limitations',     'static analysis tool'),
  ('Existing tool limitations',     'stopped using CodeRabbit'),
  ('Existing tool limitations',     'automated code review'),
  ('Existing tool limitations',     'code review automation')
) as v(topic_name, k) on v.topic_name = t.name
on conflict do nothing;

-- Coexistence: mirror these keywords into the v1 topics.keywords array so
-- the v1 pipeline (branch `roadmap`, same database) sees them too.
update public.topics t
set keywords = coalesce((select array_agg(k.keyword order by k.keyword) from public.topic_keywords k where k.topic_id = t.id), '{}')
where t.name in ('CI/CD integration reliability', 'Existing tool limitations')
  and coalesce(array_length(t.keywords, 1), 0) = 0;
