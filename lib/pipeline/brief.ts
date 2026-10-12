// writeBrief(runId): turns one run's numbers + evidence into Sumit's
// Friday brief (markdown), using Gemini Flash for the WORDS only.
//
// How we stop Gemini from inventing things:
//   1. Numbers: the tables (pain points, competitors) are rendered by CODE
//      from topic_stats. Gemini only writes the commentary, and is told to
//      use only numbers from the STATS we give it. Afterwards we check every
//      number it wrote against the input and record any we can't find.
//   2. Links: Gemini never writes a URL. Each real thread gets a short id
//      (E1, E2, ...). Gemini cites ids like [E3]; code swaps them for the
//      real links. Unknown ids and any URL Gemini types itself are removed.

import { z } from "zod";
import { generateJson, getModel, ThinkingLevel, UNTRUSTED_CONTENT_RULE, untrusted } from "@/lib/ai/gemini";
import { createServerClient } from "@/lib/db/supabase";
import { formatRunComparison, formatTrend, MIN_SAMPLE, type Trend, type TrendDetail } from "./scoring";

const MAX_EVIDENCE = 120; // most-engaged posts given to Gemini

const SOURCE_LABEL: Record<string, string> = {
  hackernews: "Hacker News",
  github: "GitHub Issues",
  devto: "DEV.to",
  stackoverflow: "Stack Overflow",
};

// ---------------------------------------------------------------------
// 1. Load everything the brief needs from the database.
// ---------------------------------------------------------------------
export type Evidence = {
  ref: string; // E1, E2, ...
  url: string;
  source: string;
  title: string;
  topic: string;
  painPoint: string;
  isUnresolved: boolean;
  unresolvedReason: string;
  severity: number;
  sentiment: number;
  competitors: string[];
};

type TopicRow = {
  topic: string;
  mentionsAllSources: number; // relevant posts this week, all four sources
  hnKeywordTrend: string; // "11 → 19 (▲ 73%)", "2 → 0 (too few to compare)" (Hacker News only)
  vsPreviousRun: string; // mentions vs the previous weekly run, or why not comparable
  keywordMatchesThisWeek: number | null;
  keywordMatchesLastWeek: number | null;
  unresolvedPct: number;
  avgSeverity: number | null;
  avgSentiment: number | null;
  opportunityScore: number;
  evidence: string[]; // top refs for this topic
};

type CompetitorRow = { tool: string; mentions: number; avgSentiment: number; evidence: string[] };

export type BriefData = {
  runId: string;
  windowStart: string;
  windowEnd: string;
  postsCollected: number;
  postsKept: number;
  sources: { name: string; status: string; count: number; notes: string[] }[]; // every source queried
  rejected: { invalidUrl: number; duplicates: number; overCap: number } | null;
  topics: TopicRow[];
  competitors: CompetitorRow[];
  evidence: Evidence[];
  suggestedTopics: { name: string; description: string | null; keywords: string[] }[];
};

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;

export async function loadBriefData(runId: string): Promise<BriefData> {
  const supabase = createServerClient();
  const [{ data: run, error: runError }, { data: stats }, { data: posts }, { data: topics }, { data: suggested }] =
    await Promise.all([
      supabase.from("runs").select("*").eq("id", runId).single(),
      supabase.from("topic_stats").select("*").eq("run_id", runId).order("opportunity_score", { ascending: false }),
      supabase
        .from("posts")
        .select("url, source, title, topic_id, pain_point, is_unresolved, unresolved_reason, severity, sentiment, competitors, score, comment_count")
        .eq("run_id", runId),
      supabase.from("topics").select("id, name"),
      supabase.from("suggested_topics").select("name, description, keywords").eq("status", "pending").limit(10),
    ]);
  if (runError || !run) throw new Error(`Run ${runId} not found`);

  const topicName = new Map((topics ?? []).map((t) => [t.id, t.name as string]));

  // Evidence = the most-engaged posts, each with a short reference id.
  const sorted = [...(posts ?? [])].sort(
    (a, b) => (b.score ?? 0) + (b.comment_count ?? 0) - ((a.score ?? 0) + (a.comment_count ?? 0)),
  );
  const evidence: Evidence[] = sorted.slice(0, MAX_EVIDENCE).map((p, i) => ({
    ref: `E${i + 1}`,
    url: p.url,
    source: p.source,
    title: p.title,
    topic: p.topic_id ? (topicName.get(p.topic_id) ?? "Unknown") : "Not monitored yet",
    painPoint: p.pain_point ?? "",
    isUnresolved: Boolean(p.is_unresolved),
    unresolvedReason: p.unresolved_reason ?? "",
    severity: p.severity ?? 0,
    sentiment: Number(p.sentiment ?? 0),
    competitors: p.competitors ?? [],
  }));

  const topicRows: TopicRow[] = (stats ?? []).map((s) => ({
    topic: topicName.get(s.topic_id) ?? "Unknown",
    mentionsAllSources: s.mention_count,
    hnKeywordTrend: formatTrend(s.trend as Trend, s.change_pct === null ? null : Number(s.change_pct), s.baseline_this_week, s.baseline_last_week),
    vsPreviousRun: formatRunComparison(s.mention_count, s.trend_detail as TrendDetail),
    keywordMatchesThisWeek: s.baseline_this_week,
    keywordMatchesLastWeek: s.baseline_last_week,
    unresolvedPct: s.mention_count ? Math.round((s.unresolved_count / s.mention_count) * 100) : 0,
    avgSeverity: s.avg_severity === null ? null : Number(s.avg_severity),
    avgSentiment: s.avg_sentiment === null ? null : Number(s.avg_sentiment),
    opportunityScore: Number(s.opportunity_score ?? 0),
    evidence: evidence.filter((e) => e.topic === topicName.get(s.topic_id)).slice(0, 5).map((e) => e.ref),
  }));

  // Competitor radar: count mentions and average sentiment per tool.
  const byTool = new Map<string, Evidence[]>();
  for (const e of evidence) for (const tool of e.competitors) byTool.set(tool, [...(byTool.get(tool) ?? []), e]);
  const competitors: CompetitorRow[] = [...byTool.entries()]
    .map(([tool, list]) => ({
      tool,
      mentions: list.length,
      avgSentiment: round(list.reduce((sum, e) => sum + e.sentiment, 0) / list.length),
      evidence: list.slice(0, 3).map((e) => e.ref),
    }))
    .sort((a, b) => b.mentions - a.mentions);

  // Every source that was queried, with its real outcome (not just the ones that worked).
  type RawStatus = { ok: boolean; status?: string; count?: number; notes?: string[] };
  const sources = Object.entries((run.sources_status ?? {}) as Record<string, RawStatus>).map(([name, st]) => ({
    name: SOURCE_LABEL[name] ?? name,
    status: st.status ?? (st.ok ? "ok" : "failed"),
    count: st.count ?? 0,
    notes: st.notes ?? [],
  }));

  return {
    runId,
    windowStart: run.window_start,
    windowEnd: run.window_end,
    postsCollected: run.stats?.postsCollected ?? 0,
    postsKept: run.stats?.postsKept ?? posts?.length ?? 0,
    sources,
    rejected: run.stats?.rejected ?? null,
    topics: topicRows,
    competitors,
    evidence,
    suggestedTopics: suggested ?? [],
  };
}

// ---------------------------------------------------------------------
// 2. Ask Gemini for the words (structured JSON, validated with Zod).
// ---------------------------------------------------------------------
const evidenceIds = z.array(z.string()).describe("Evidence ids like E3 that support this item");

const BriefSchema = z.object({
  tldr: z.array(z.string()).length(3).describe("Exactly 3 one-sentence bullets for a busy PM, with [E#] citations"),
  rising_falling: z.string().describe("Markdown bullets: which topics are rising or falling ACCORDING TO hnKeywordTrend (say 'Hacker News keyword matches'), or vsPreviousRun when comparable; topics marked 'too few to compare' must be described as having too little data. [E#] citations for any claim about what developers say."),
  unresolved: z.string().describe("Markdown bullets: specific problems still unsolved or underserved by existing tools, with [E#] citations"),
  emerging: z.string().describe("Markdown bullets: the radar's suggestedNewTopics (and other recurring pain points in evidence whose topic is 'Not monitored yet'), with [E#] citations. Mention they await Sumit's approval on the dashboard. Say so plainly if there are none."),
  competitor_commentary: z.string().describe("1-3 sentences on what developers say about competitor tools, with [E#] citations. Say if the number of posts is small."),
  objections: z
    .array(z.object({ objection: z.string(), response: z.string(), evidence: evidenceIds }))
    .min(2)
    .max(4),
  sprint: z
    .array(z.object({ title: z.string(), why: z.string(), evidence: evidenceIds }))
    .length(3),
});
type BriefJson = z.infer<typeof BriefSchema>;

const SYSTEM_PROMPT = `You write the Friday brief for Sumit, the sole PM at a 15-person startup that sells a CODE REVIEW AUTOMATION tool to mid-size engineering teams.
He reads it before his afternoon engineering sync and uses it for Monday sprint planning. Write clear, concise, professional English.

STRICT RULES:
- Use ONLY numbers that appear in STATS. Never estimate, add up or invent counts or percentages.
- Two different measurements exist; never mix them up:
  * mentionsAllSources = relevant posts this week across Hacker News, GitHub Issues, Stack Overflow and DEV.to.
  * hnKeywordTrend = Hacker News keyword matches last week → this week (Hacker News ONLY). Call it "Hacker News keyword matches", never "mentions".
  * vsPreviousRun compares mentionsAllSources with the previous weekly run when one exists and is comparable.
  Never describe an HN-only change as a change in overall mentions.
- "too few to compare" means there is not enough data: do not call that topic rising or falling.
  "new in HN data" means newly observed in the collected Hacker News data, not proven new in the wider market.
- Every claim about what developers say must cite evidence ids in square brackets, e.g. [E3] or [E3, E12]. Only use ids from EVIDENCE.
  If the evidence for a claim is thin (one or two posts), say so instead of generalising.
- Never write URLs or links yourself. Code turns [E#] into real links. Never invent quotes.
- Do not add headings; each field is inserted under a heading by code.
- Do not name the AI model or describe yourself.
- Sales objections: objections developers or engineering leads would raise against adopting automated code review, grounded in the evidence.
  You do NOT know what Sumit's product can do, so never claim it has a feature. Write the suggested response as an honest talking point:
  acknowledge the concern, then say what to show, measure or offer in a demo (e.g. "show the false-positive rate on their own repository").
- Sprint items are RECOMMENDATIONS, not observed facts: 3 actionable product or engineering items, each tied to evidence.

${UNTRUSTED_CONTENT_RULE}`;

function buildPrompt(d: BriefData): string {
  const stats = {
    week: { start: d.windowStart, end: d.windowEnd },
    postsCollected: d.postsCollected,
    relevantPosts: d.postsKept,
    topics: d.topics.map(({ evidence, ...t }) => ({ ...t, topEvidence: evidence })),
    competitors: d.competitors,
    suggestedNewTopics: d.suggestedTopics,
  };
  const evidence = d.evidence
    .map(
      (e) =>
        `${e.ref} | ${SOURCE_LABEL[e.source] ?? e.source} | topic: ${e.topic} | <post>${untrusted(e.title)}</post> | pain: ${untrusted(e.painPoint)} | ` +
        `${e.isUnresolved ? "UNRESOLVED" : "resolved"} (${e.unresolvedReason}) | severity ${e.severity} | sentiment ${e.sentiment}` +
        (e.competitors.length ? ` | tools: ${e.competitors.join(", ")}` : ""),
    )
    .join("\n");
  return `STATS (computed by code, the only numbers you may use):\n${JSON.stringify(stats, null, 1)}\n\nEVIDENCE (real threads):\n${evidence}`;
}

// ---------------------------------------------------------------------
// 3. Turn [E#] citations into real links, and remove anything else.
// ---------------------------------------------------------------------
export function makeLinker(d: Pick<BriefData, "evidence">) {
  const byRef = new Map(d.evidence.map((e) => [e.ref, e]));
  const used = new Set<string>();
  let unknownRefs = 0;

  const link = (ref: string): string | null => {
    const e = byRef.get(ref);
    if (!e) {
      unknownRefs++;
      return null;
    }
    used.add(ref);
    return `[${SOURCE_LABEL[e.source] ?? e.source}](${e.url})`;
  };

  /** Links for a list of ids, e.g. "([GitHub](…), [Hacker News](…))". */
  const links = (refs: string[]) => {
    const parts = refs.map((r) => link(r.trim())).filter(Boolean);
    return parts.length ? ` (${parts.join(", ")})` : "";
  };

  /** Clean one piece of Gemini text. */
  const clean = (text: string) =>
    text
      // Any link Gemini wrote itself -> keep only its text.
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
      // Bare URLs -> remove.
      .replace(/https?:\/\/\S+/g, "")
      // [E3] or [E3, E12] -> real links.
      .replace(/\s*\[((?:E\d+\s*,?\s*)+)\]/g, (_, ids: string) => links(ids.split(/[\s,]+/).filter(Boolean)));

  /** Clean text whose evidence is given separately: drop its [E#] citations. */
  const cleanNoRefs = (text: string) => clean(text.replace(/\s*\[((?:E\d+\s*,?\s*)+)\]/g, ""));

  return { clean, cleanNoRefs, links, used, unknownRefs: () => unknownRefs };
}

/** Numbers Gemini wrote that do not appear anywhere in its input. */
export function findUnverifiedNumbers(written: string, input: string): string[] {
  const allowed = new Set(input.match(/\d+(?:\.\d+)?/g) ?? []);
  const found = written.replace(/\[E\d+[^\]]*\]/g, "").match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(found.filter((n) => !allowed.has(n)))];
}

// ---------------------------------------------------------------------
// 4. Assemble the final markdown: code-made tables + Gemini's words.
// ---------------------------------------------------------------------
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

function render(d: BriefData, g: BriefJson, linker: ReturnType<typeof makeLinker>): string {
  const { clean, cleanNoRefs, links } = linker;
  const out: string[] = [];

  out.push(`# Groundswell Friday Brief — week ending ${fmtDate(d.windowEnd)}`);
  out.push(
    `_Week ${fmtDate(d.windowStart)} – ${fmtDate(d.windowEnd)} · ${d.postsCollected} posts collected from ` +
      `${d.sources.map((s) => s.name).join(", ")} · ${d.postsKept} relevant after AI-assisted filtering_`,
  );

  out.push(`## 1. TL;DR`);
  out.push(g.tldr.map((b) => `- ${clean(b)}`).join("\n"));

  out.push(`## 2. Top pain points`);
  out.push(
    [
      "| # | Topic | Mentions (all sources) | Hacker News keyword matches (last week → this week) | Unresolved | Opportunity Score |",
      "|---|---|---:|---|---:|---:|",
      ...d.topics.map(
        (t, i) =>
          `| ${i + 1} | ${t.topic} | ${t.mentionsAllSources} | ${t.hnKeywordTrend} | ${t.unresolvedPct}% | **${t.opportunityScore}** |`,
      ),
    ].join("\n"),
  );
  out.push(
    "_**Mentions** = relevant posts this week across Hacker News, GitHub Issues, Stack Overflow and DEV.to. " +
      "**Hacker News keyword matches** compare this week with the 7 days before, on Hacker News only; " +
      `fewer than ${MIN_SAMPLE} matches in total is marked "too few to compare". ` +
      "**Opportunity Score** is relative (0–100): frequency × growth × unresolved share × severity, where this week's top topic = 100. It is not an absolute measure of market size._",
  );

  out.push(`## 3. Rising and falling`);
  out.push(clean(g.rising_falling));

  out.push(`## 4. Unresolved and underserved problems`);
  out.push(clean(g.unresolved));

  out.push(`## 5. Emerging topics not yet monitored`);
  out.push(clean(g.emerging));

  out.push(`## 6. Competitor radar`);
  if (d.competitors.length) {
    out.push(
      [
        "| Tool | Mentions | Average sentiment (−1 to 1) | Threads |",
        "|---|---:|---:|---|",
        ...d.competitors.map((c) => `| ${c.tool} | ${c.mentions} | ${c.avgSentiment} | ${links(c.evidence).trim().replace(/^\(|\)$/g, "")} |`),
      ].join("\n"),
    );
  } else {
    out.push("_No competitor tools were named in this week's relevant posts._");
  }
  out.push(clean(g.competitor_commentary));

  out.push(`## 7. Likely sales objections`);
  out.push("_Objections are drawn from this week's threads; the responses are suggestions._");
  out.push(
    g.objections
      .map((o) => `- **“${cleanNoRefs(o.objection)}”**${links(o.evidence)}\n  - _Suggested response:_ ${cleanNoRefs(o.response)}`)
      .join("\n"),
  );

  out.push(`## 8. Recommendations: bring these 3 things to Monday sprint planning`);
  out.push(g.sprint.map((s, i) => `${i + 1}. **${cleanNoRefs(s.title)}** — ${cleanNoRefs(s.why)}${links(s.evidence)}`).join("\n"));

  out.push("---");
  out.push(`## About this data`);
  out.push(aboutThisData(d));
  return out.join("\n\n");
}

/** Plain facts about coverage and method, written by code (no AI). */
export function aboutThisData(d: Pick<BriefData, "sources" | "rejected" | "postsCollected" | "postsKept" | "topics">): string {
  const lines: string[] = [];
  lines.push(
    `- **Sources queried:** ${d.sources
      .map((s) => `${s.name} (${s.count} ${s.count === 1 ? "match" : "matches"}${s.status === "ok" ? "" : `, ${s.status === "partial" ? "some requests failed" : "failed"}`})`)
      .join(", ")}. No other sites were searched.`,
  );
  const notes = d.sources.flatMap((s) => s.notes.map((n) => `${s.name}: ${n}`));
  if (notes.length) lines.push(`- **Coverage limits (${notes.length}):** ${notes.slice(0, 4).join("; ")}${notes.length > 4 ? "; …" : ""}.`);
  if (d.rejected) {
    lines.push(
      `- **Cleaning:** ${d.rejected.duplicates} duplicate${d.rejected.duplicates === 1 ? "" : "s"} merged, ` +
        `${d.rejected.invalidUrl} record${d.rejected.invalidUrl === 1 ? "" : "s"} with an invalid link dropped, ${d.rejected.overCap} over the 300-post cap.`,
    );
  }
  lines.push(`- **Relevance:** ${d.postsKept} of ${d.postsCollected} collected posts were judged relevant (AI-assisted classification).`);
  const thin = d.topics.filter((t) => t.mentionsAllSources > 0 && t.mentionsAllSources < 3).map((t) => t.topic);
  if (thin.length) lines.push(`- **Small samples:** ${thin.join(", ")} ${thin.length === 1 ? "has" : "have"} fewer than 3 mentions; treat as early signals.`);
  lines.push("- All counts, trends and scores are computed by code from the stored posts; the commentary is AI-assisted and every claim links to its source thread.");
  return lines.join("\n");
}

export type Objection = {
  objection: string;
  response: string;
  evidence: { url: string; title: string; source: string }[];
};

export type WrittenBrief = {
  markdown: string;
  objections: Objection[]; // also stored as structured data for the dashboard
  checks: { evidenceLinks: number; unknownRefs: number; unverifiedNumbers: string[] };
};

/** Write the brief for a run (does NOT save or email it). */
export async function writeBrief(runId: string): Promise<WrittenBrief> {
  const data = await loadBriefData(runId);
  if (data.evidence.length === 0) throw new Error("No relevant posts in this run, so there is nothing to brief.");

  const prompt = buildPrompt(data);
  const json = await generateJson({
    system: SYSTEM_PROMPT,
    prompt,
    schema: BriefSchema,
    thinkingLevel: ThinkingLevel.LOW, // fast enough to fit the run in Vercel's time limit
  });

  const linker = makeLinker(data);
  const markdown = render(data, json, linker);
  const geminiText = [json.tldr, json.rising_falling, json.unresolved, json.emerging, json.competitor_commentary,
    json.objections.map((o) => `${o.objection} ${o.response}`), json.sprint.map((s) => `${s.title} ${s.why}`)].flat().join(" ");

  // Same objections as section 7, as data: real evidence threads only.
  const byRef = new Map(data.evidence.map((e) => [e.ref, e]));
  const plain = (text: string) => text.replace(/\s*\[((?:E\d+\s*,?\s*)+)\]/g, "").replace(/https?:\/\/\S+/g, "").trim();
  const objections: Objection[] = json.objections.map((o) => ({
    objection: plain(o.objection),
    response: plain(o.response),
    evidence: o.evidence
      .map((r) => byRef.get(r.trim()))
      .filter((e): e is Evidence => Boolean(e))
      .map((e) => ({ url: e.url, title: e.title, source: e.source })),
  }));

  return {
    markdown,
    objections,
    checks: {
      evidenceLinks: linker.used.size,
      unknownRefs: linker.unknownRefs(),
      unverifiedNumbers: findUnverifiedNumbers(geminiText, prompt),
    },
  };
}

/** Write + save the brief for a run (one brief per run: re-writing replaces it). */
export async function createBrief(runId: string): Promise<{ id: string } & WrittenBrief> {
  const brief = await writeBrief(runId);
  const { data, error } = await createServerClient()
    .from("briefs")
    .upsert(
      {
        run_id: runId,
        markdown: brief.markdown,
        objections: brief.objections,
        model: getModel(),
        checks: brief.checks,
        emailed_at: null,
        email_error: null,
      },
      { onConflict: "run_id" },
    )
    .select("id")
    .single();
  if (error || !data) throw new Error(`Could not save brief: ${error?.message}`);
  return { id: data.id, ...brief };
}
