# Groundswell: Viva preparation

Live app: https://devpulse-sable-seven.vercel.app · Architecture: https://devpulse-sable-seven.vercel.app/architecture

---

## 3-minute demo script

**Before you start:** open the live site, unlock with the admin passcode (it's the `ADMIN_PASSCODE` value in `.env.local`), and
have your email inbox open in another tab. Optionally press **Run now** ~2 minutes before the viva so the newest run is fresh.

**0:00 – 0:20 · The problem.**
"Sumit is the only PM at a 15-person code-review-automation startup. Every Friday he spends 90 minutes reading developer
forums by hand and can't tell if a problem appeared 4 times or 14 times, or whether it's growing. Groundswell does that
automatically every Friday at 8 AM IST and emails him a brief before his engineering sync."

**0:20 – 0:50 · The dashboard (/).**
Point at the KPI cards: "This week it read about 250 live posts from Hacker News, Stack Overflow, GitHub and DEV.to; Gemini Flash
kept the relevant ones." Point at **Topics ranked by opportunity**: "Each topic shows mentions across all four sources, Hacker News keyword
matches last week versus this week, the share of unresolved problems and severity." Click **Why this score?** on the top topic: "The score is frequency × growth ×
unresolved × severity. Here is the exact maths, and anyone can recompute it. And these are the 3 real threads behind it."

**0:50 – 1:10 · Trend chart.**
"This chart is Hacker News only, because it's the one source we can count the same way for both weeks. It's labelled
that way, and when there are fewer than 5 matches it says 'too few to compare' instead of inventing a trend."

**1:10 – 1:40 · Ask the Pulse.**
Click the example **"Why do teams turn off AI code review bots?"**. "Gemini answers only from posts we found with Postgres
full-text search, and every claim links to a real thread. If I ask something unrelated…" type *"best pizza in Naples?"*
→ "…it says *not enough data* instead of making something up."

**1:40 – 2:05 · Radars.**
Scroll to **Emerging topic radar**: "Gemini found pain points that none of Sumit's topics cover and suggested new topics with
keywords and evidence. One click approves it and next week's run monitors it." Then **Competitor radar** (mentions + sentiment
per tool) and **Objection radar** (what prospects will say in demos, with an honest response).

**2:05 – 2:35 · Run now + the email.**
Press **Run now** (timer starts). While it runs, open the email: "This is the Friday brief: TL;DR, a pain-point table with
counts, trend % and scores, unresolved problems, emerging topics, competitors, objections, and three things for Monday sprint
planning. Every link is a real thread."

**2:35 – 3:00 · Architecture + rules.**
Open **/topics**: "Topics and keywords live in Supabase. Sumit edits them here without code changes." Open **/architecture**:
"Four live sources, Gemini Flash only for AI, Supabase, Resend, deployed on Vercel with a Friday cron." Back on `/`, the run
has finished: "Done: success · N relevant posts · brief emailed."

---

## Data audit: 5 extra questions

**A1. How do you know the data isn't made up?**
`npm run verify:provenance` re-fetches stored posts from each source's official API and compares id, title, timestamp and URL.
The last audit: 21 PASS, 3 WARN (explained: 2 Hacker News stories retitled by moderators, 1 Stack Overflow page that blocks scripts), 0 FAIL.

**A2. What problems did the audit find?**
Two runs were marked "success" although a source had failed requests; Hacker News results were silently cut at 100 per keyword;
and the dashboard put an HN-only trend next to all-source mentions. All three are fixed and covered by tests.

**A3. Does Groundswell see every post on these sites?**
No. It reads what the four APIs return: GitHub Issues gives the newest 100 issues per search and DEV.to the newest 1,000 articles
per tag, so busy weeks are sampled. Each run records these limits, and the brief's "About this data" lists them.

**A4. How do you stop a post from hijacking the AI?**
Collected text is wrapped in `<post>` tags with its angle brackets neutralised, and every prompt says that text inside the
tags is data only: never instructions.

**A5. Why isn't Reddit included?**
Authorised access needs a Reddit OAuth app and acceptance of Reddit's Data API terms. We don't have those credentials, so it's
blocked, and the app never claims to cover Reddit.

## 25 likely viva questions

### The problem and the product
**1. What problem does Groundswell solve?**
Sumit can't systematically see what developers struggle with right now. Groundswell collects a week of public discussions,
measures how often each pain point appears, whether it's rising or falling, and what's still unsolved, then emails him a
Friday brief with links to the real threads.

**2. Which three questions does the brief always answer?**
Which pain points surface most often (mention counts), whether each is trending up or down vs last week (% change), and which
problems are unresolved or underserved by existing tools.

**3. Why these four sources?**
Hacker News, Stack Overflow, GitHub Issues and DEV.to are where developers discuss tools and workflow publicly, and all four
have free APIs. Each is a separate adapter with the same interface, so adding a source is one new file.

**4. What happens if one source is down?**
Each adapter catches its own errors and reports `ok: false`. The run continues with the other sources, is marked **partial**,
and `/runs` shows which source failed and why.

### AI (Gemini Flash)
**5. Where exactly is AI used?**
Four places, all Gemini Flash: classifying posts, clustering emerging topics, writing the brief's text, and answering Ask
the Pulse. Counting, trends and scores are plain code.

**6. How do you make sure Gemini's output is valid?**
We send a JSON schema (built from our Zod schema) so Gemini must answer in that shape, then validate the reply with Zod.
If it's invalid we ask once more; if it's still invalid we report an error instead of saving bad data.

**7. What do you do about rate limits?**
On 429 or 5xx we wait (Google's suggested delay, or 2s/4s/8s/16s) and retry. Posts are sent 25 per call with at most 3 calls at
once, so ~250 posts take ~30 seconds.

**8. How do you stop Gemini from inventing numbers?**
The tables are built by code from the database. Gemini gets the computed stats and is told to use only those, and afterwards
code checks every number it wrote against its input (`unverifiedNumbers` is recorded for each brief).

**9. How do you guarantee every link is real?**
Gemini never writes URLs. Each real thread gets an id like `E3`. Gemini cites ids, and code replaces them with the real link.
Unknown ids and any URL Gemini typed are removed.

**10. Why is the model `gemini-3.8-flash` and not `gemini-2.5-flash`?**
We listed the models available to our key. `gemini-2.5-flash` returned "no longer available to new users", so we switched to
the newest Flash model. It comes from the `GEMINI_MODEL` env var, so changing it needs no code change.

**11. How do you decide a problem is "unresolved"?**
We give Gemini real source signals as evidence: is the GitHub issue still open, does the Stack Overflow question have an
accepted answer. For HN and DEV.to it reads the text (complaints with no working fix). It must also state the reason it used.

### Trends and the Opportunity Score
**12. How can you show a trend on the very first run?**
We ask Hacker News directly for keyword matches in this week's window and the 7 days before, counted the same way. It's
labelled "Hacker News keyword matches", never "mentions", because mentions come from all four sources. From the second weekly
run, mentions are also compared run against run, but only when every source was complete in both runs.

**13. Why only Hacker News for the baseline?**
It supports exact-phrase search over any date range with no tight limit. GitHub's search "secondary rate limit" blocked the
extra searches every time we tested, DEV.to has no date search, and Stack Overflow had almost no matches.

**14. What is the Opportunity Score?**
A relative ranking: frequency (mentions ÷ the top topic's mentions) × growth ((this + 3) ÷ (previous + 3), kept between 0.5
and 2, or ×1 when there are too few data points) × unresolved share × severity ÷ 5. Then we divide by the week's highest
product and multiply by 100, so this week's top topic is 100. It ranks topics against each other; it does not measure market size.

**15. Why add 3 in the growth factor, and what if the numbers are tiny?**
Adding 3 to both weeks smooths noise (16 → 10 gives 13 ÷ 19 = 0.68). And if both weeks together have fewer than 5 matches
(e.g. 0 → 2) we don't claim a direction at all: the label says "too few to compare" and growth is neutral (×1).

**16. How do we know "Why this score?" matches the real score?**
It's built by code from the stored components, each component is rounded before multiplying, and we recomputed every formula
on the live site to prove the product and score match.

### Radars and Ask the Pulse
**17. How does the Emerging Topic Radar work?**
The classifier marks real pain points that fit no topic as "other". Gemini clusters them into up to 4 suggested topics with
keywords and evidence. Code requires ≥ 2 real threads, no duplicate or previously rejected names, and ≥ 3 new keywords.
Sumit approves (creates a topic) or rejects (never suggested again).

**18. How does Ask the Pulse avoid hallucinating?**
Postgres full-text search finds matching stored posts. If there are none, we answer "not enough data" without calling Gemini.
Otherwise Gemini sees only those posts, must cite them as [S#], and code turns citations into links. If the posts don't answer
the question, it must say "not enough data". An answer with no valid citation is treated the same way.

**19. How does the full-text search work?**
A generated `tsvector` column (title + pain point + excerpt) with a GIN index. The `search_posts` function turns the question into
stemmed keywords without stop words, finds posts matching any of them, and ranks those matching more words higher. Every word is
quoted, so user input can't break the query.

### Data, security and deployment
**20. Where are topics stored and how are they edited?**
In the Supabase `topics` table (name, description, keywords, active). Sumit edits them on `/topics` after unlocking with the
admin passcode, or approves radar suggestions. No code change or redeploy is needed.

**21. How is the database secured?**
Row Level Security is on for every table. The public anon key can only read; insert/update/delete are revoked. All writes happen
on the server with the secret service-role key, which never reaches the browser.

**22. How is the cron protected, and how is "Run now" protected?**
Vercel Cron calls `/api/cron/weekly` with `Authorization: Bearer CRON_SECRET`, compared in constant time; anything else gets
401. "Run now" needs the admin passcode: the server sets an httpOnly cookie with an HMAC token (not the passcode) and re-checks
it on every admin action.

**23. Will the pipeline finish within Vercel's time limit?**
Yes. `maxDuration` is 300 s and a run takes about 2 minutes: collection ~10–20 s, classification and baseline in parallel ~30–60 s,
radar ~5 s, brief ~15 s. Posts are capped at 300.

**24. How are secrets kept safe?**
Only in `.env.local` (git-ignored) and Vercel environment variables. Only `.env.example` with empty values is committed. We copied
them to Vercel by piping each value straight into the CLI, so they were never printed.

**25. What would you improve next?**
Store each week's numbers so trends can also be compared run-over-run once history builds up; add Reddit (needs OAuth) for more
volume; let Sumit tune the score weights; send the brief from a verified domain instead of `onboarding@resend.dev`.
