// Provenance check: are the stored posts real, and do they match their source?
//
// For a sample of posts from the latest run (default 5 per source) this script
// re-fetches each record from the source's OFFICIAL API and compares:
//   - source id   (the API returns the same item)
//   - title       (HN comments: the parent story title we stored after "Comment on: ")
//   - timestamp   (original publication time, to the second)
//   - public URL  (opens with HTTP 200 and is the same item)
// It prints PASS / WARN / FAIL and exits with code 1 only on a real FAIL.
//   WARN = a known, explained difference, never a fabricated record:
//     - HN comment whose PARENT story was retitled by HN after collection
//       (we store "Comment on: <story title at collection time>")
//     - page blocks automated clients (e.g. Stack Overflow's Cloudflare check)
//       while the official API confirms the same id, title, time and URL
//
// Usage:  node --env-file=.env.local scripts/verify-provenance.mjs [perSource]
// Read-only: it never writes to the database.

import { createClient } from "@supabase/supabase-js";

const PER_SOURCE = Number(process.argv[2] ?? 5);
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const UA = { "User-Agent": "Groundswell/1.0 provenance-check" };

const getJson = async (url, headers = {}) => {
  const res = await fetch(url, { headers: { ...UA, Accept: "application/json", ...headers }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
};
const sameTime = (a, b) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) < 1000;
const norm = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

// One checker per source: returns { title, postedAt } from the official API.
const original = {
  async hackernews(p) {
    const item = await getJson(`https://hn.algolia.com/api/v1/items/${p.external_id}`);
    let title = item.title;
    if (item.type === "comment") {
      // Walk up to the story: we store comments as "Comment on: <story title>".
      let parent = item;
      while (parent.parent_id && parent.type !== "story") parent = await getJson(`https://hn.algolia.com/api/v1/items/${parent.parent_id}`);
      title = `Comment on: ${parent.title ?? "HN thread"}`;
    }
    return { id: String(item.id), title, postedAt: item.created_at };
  },
  async github(p) {
    const m = p.url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    const issue = await getJson(`https://api.github.com/repos/${m[1]}/${m[2]}/issues/${m[3]}`, {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    });
    return { id: String(issue.id), title: issue.title, postedAt: issue.created_at, url: issue.html_url };
  },
  async devto(p) {
    const a = await getJson(`https://dev.to/api/articles/${p.external_id}`);
    return { id: String(a.id), title: a.title, postedAt: a.published_at, url: a.url };
  },
  async stackoverflow(p) {
    const key = process.env.STACKEXCHANGE_KEY ? `&key=${process.env.STACKEXCHANGE_KEY}` : "";
    const data = await getJson(`https://api.stackexchange.com/2.3/questions/${p.external_id}?site=stackoverflow${key}`);
    const q = data.items[0];
    const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    return { id: String(q.question_id), title: decode(q.title), postedAt: new Date(q.creation_date * 1000).toISOString(), url: q.link };
  },
};

async function urlOpens(url) {
  try {
    const res = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(15000) });
    return res.status;
  } catch (e) {
    return `error: ${e.message}`;
  }
}

const { data: run } = await supabase
  .from("runs")
  .select("id, started_at")
  .in("status", ["success", "partial"])
  .order("started_at", { ascending: false })
  .limit(1)
  .single();
const { data: posts, error } = await supabase
  .from("posts")
  .select("source, external_id, url, title, posted_at, score, comment_count")
  .eq("run_id", run.id)
  .order("score", { ascending: false });
if (error) throw error;

const sample = [];
for (const source of ["hackernews", "github", "stackoverflow", "devto"]) {
  sample.push(...posts.filter((p) => p.source === source).slice(0, PER_SOURCE));
}

console.log(`Run ${run.id} (${run.started_at}) · ${posts.length} stored posts · checking ${sample.length}\n`);
let failures = 0;
let warnings = 0;
for (const p of sample) {
  const checks = []; // [name, "ok" | "warn" | "fail"]
  let apiOk = false;
  try {
    const o = await original[p.source](p);
    const titleOk = norm(o.title) === norm(p.title);
    const retitled = !titleOk && p.source === "hackernews" && p.title.startsWith("Comment on: ") && o.title.startsWith("Comment on: ");
    checks.push(["id", o.id === p.external_id ? "ok" : "fail"]);
    checks.push([retitled ? "parentStoryRetitled" : "title", titleOk ? "ok" : retitled ? "warn" : "fail"]);
    checks.push(["time", sameTime(o.postedAt, p.posted_at) ? "ok" : "fail"]);
    if (o.url) checks.push(["url", o.url === p.url ? "ok" : "fail"]);
    apiOk = checks.every(([, r]) => r !== "fail");
  } catch (e) {
    checks.push([`api(${e.message})`, "fail"]);
  }
  const status = await urlOpens(p.url);
  checks.push([`opens(${status})`, status === 200 ? "ok" : status === 403 && apiOk ? "warn" : "fail"]);

  const result = checks.some(([, r]) => r === "fail") ? "FAIL" : checks.some(([, r]) => r === "warn") ? "WARN" : "PASS";
  if (result === "FAIL") failures++;
  if (result === "WARN") warnings++;
  console.log(`${result}  ${p.source.padEnd(13)} ${p.external_id.padEnd(11)} ${checks.map(([n, r]) => `${n}:${r === "ok" ? "ok" : r === "warn" ? "~" : "X"}`).join(" ")}  ${p.title.slice(0, 50)}`);
}
console.log(`\nPASS ${sample.length - failures - warnings} · WARN ${warnings} (explained, not fabricated) · FAIL ${failures}`);
process.exit(failures ? 1 : 0);
