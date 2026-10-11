-- =====================================================================
-- DevPulse starter topics for Sumit.
-- Applied to project oxibeeaaelnavkjngneg as migration "seed_starter_topics".
--
-- Keywords are short phrases developers actually type in posts/titles,
-- because they are sent as search queries to HN, Stack Overflow,
-- GitHub Issues and DEV.to.
--
-- Safe to run more than once: "on conflict" updates the existing row.
-- After seeding, edit topics in the Supabase Table Editor — no code needed.
-- =====================================================================

insert into public.topics (name, description, keywords) values
(
  'Code review bottlenecks',
  'PRs waiting too long for review, reviewer overload, slow merge times.',
  array['code review bottleneck', 'waiting for code review', 'PR review time',
        'slow code reviews', 'review backlog', 'pull request stuck', 'time to merge']
),
(
  'False positives / noisy review bots',
  'Automated reviewers, linters and static analysis that flag too much or the wrong things.',
  array['false positives', 'noisy bot comments', 'code review bot', 'static analysis false positive',
        'sonarqube false positive', 'linter noise', 'review bot spam']
),
(
  'CI/CD pipeline failures',
  'Broken, slow or unreliable builds and deployment pipelines.',
  array['CI pipeline failing', 'GitHub Actions failing', 'build failure', 'pipeline timeout',
        'slow CI', 'Jenkins build failed', 'deployment pipeline broken']
),
(
  'Flaky tests',
  'Tests that pass and fail randomly, blocking merges and eroding trust in CI.',
  array['flaky tests', 'flaky test', 'intermittent test failure', 'test retry',
        'non-deterministic tests', 'quarantine flaky tests']
),
(
  'Trust in AI code review',
  'Whether developers trust AI reviewers (accuracy, hallucinations, usefulness).',
  array['AI code review', 'Copilot code review', 'CodeRabbit', 'LLM code review',
        'AI reviewer', 'AI generated code review', 'AI review hallucination']
),
(
  'PR size & review culture',
  'Large PRs, stacked diffs, nitpicking, rubber-stamp approvals and team review norms.',
  array['large pull requests', 'PR size', 'stacked PRs', 'code review culture',
        'nitpick code review', 'rubber stamp approval', 'small pull requests']
)
on conflict (name) do update
  set description = excluded.description,
      keywords    = excluded.keywords;
