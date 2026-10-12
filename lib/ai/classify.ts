// classifyPosts(): Gemini reads every collected post and decides
//   - which topic it belongs to (or "irrelevant" -> the post is dropped)
//   - the pain point in one line
//   - whether the problem looks unresolved, and why (evidence)
//   - sentiment (-1 .. 1) and severity (1 .. 5)
//   - which competitor tools are mentioned
//
// Posts are sent in batches of 25 (one Gemini call per batch), with at
// most 3 batches running at the same time to stay under rate limits.

import { z } from "zod";
import type { Topic } from "@/lib/db/supabase";
import type { SourcePost } from "@/lib/sources/types";
import { mapWithLimit } from "@/lib/sources/utils";
import { generateJson } from "./gemini";

const BATCH_SIZE = 25;
const PARALLEL_BATCHES = 3;
const IRRELEVANT = "irrelevant";
// A real pain point in Sumit's space that NO monitored topic covers.
// These posts are kept (topicId = null) and feed the Emerging Topic Radar.
const OTHER = "other";

// Competitor tools Sumit cares about. Gemini's answers are mapped to these
// exact names so "coderabbit" and "Code Rabbit" count as the same tool.
const COMPETITORS: Record<string, string[]> = {
  SonarQube: ["sonarqube", "sonarcloud", "sonar"],
  CodeRabbit: ["coderabbit", "code rabbit"],
  "GitHub Copilot code review": ["github copilot", "copilot code review", "copilot review", "copilot"],
  Graphite: ["graphite"],
  Reviewable: ["reviewable"],
  Codacy: ["codacy"],
  DeepSource: ["deepsource"],
  Qodo: ["qodo", "codiumai", "codium"],
  Greptile: ["greptile"],
  Sourcery: ["sourcery"],
  "Cursor Bugbot": ["bugbot", "cursor bugbot"],
  Semgrep: ["semgrep"],
  "Snyk Code": ["snyk"],
};

/** Map a tool name from Gemini to our canonical name (unknown names kept as-is). */
function normaliseCompetitor(name: string): string {
  const lower = name.trim().toLowerCase();
  for (const [canonical, aliases] of Object.entries(COMPETITORS)) {
    if (lower === canonical.toLowerCase() || aliases.includes(lower)) return canonical;
  }
  return name.trim();
}

export type Classification = {
  topicId: string | null; // null = relevant, but no monitored topic fits ("other")
  painPoint: string;
  isUnresolved: boolean;
  unresolvedReason: string;
  sentiment: number; // -1 very negative .. 1 very positive
  severity: number; // 1 minor annoyance .. 5 blocks teams / costs real money
  competitors: string[];
};

export type ClassifiedPost = SourcePost & { classification: Classification };

export type ClassifyResult = {
  classified: ClassifiedPost[]; // relevant posts, with Gemini's answers
  dropped: { post: SourcePost; note: string }[]; // Gemini said "irrelevant"
  errors: string[]; // batches that failed, or posts Gemini skipped
  batches: number;
};

// The shape Gemini must return for one batch. Built per call because the
// list of allowed topic keys depends on the topics stored in Supabase.
function buildSchema(topicKeys: string[]) {
  return z.object({
    results: z.array(
      z.object({
        id: z.string().describe("The post id exactly as given, e.g. p3"),
        topic: z
          .enum([IRRELEVANT, OTHER, ...topicKeys])
          .describe(`Best matching topic key, "${OTHER}" or "${IRRELEVANT}"`),
        pain_point: z
          .string()
          .describe("One line (max 20 words): the developer's problem. For irrelevant posts: why it is irrelevant."),
        is_unresolved: z.boolean(),
        unresolved_reason: z.string().describe("Short evidence for is_unresolved, e.g. 'GitHub issue still open, no fix'"),
        sentiment: z.number().min(-1).max(1).describe("-1 very negative .. 0 neutral .. 1 very positive"),
        severity: z.number().int().min(1).max(5),
        competitors: z.array(z.string()).describe("Code review / static analysis tools explicitly named"),
      }),
    ),
  });
}

const SYSTEM_PROMPT = `You are a product analyst for a startup that sells a CODE REVIEW AUTOMATION tool to mid-size engineering teams.
You read public developer posts (Hacker News, Stack Overflow, GitHub Issues, DEV.to) and classify each one.

Rules:
- topic: choose the ONE topic key that best fits the developer problem in the post. The keyword that found the post is only a hint.
  Use "${OTHER}" when the post IS a real developer pain point about code review, CI/CD, testing or developer workflow,
  but none of the topics fits it well (do not force a weak match).
  Use "${IRRELEVANT}" when the post has no real developer pain point or opinion about code review, CI/CD, testing or developer workflow.
  Examples of irrelevant: release notes, changelogs, auto-generated task lists, job ads, the keyword used in an unrelated sense
  (e.g. "false positive" in medical tests or fraud detection), pure product announcements with no problem described,
  and internal project tickets (task lists, roadmap/planning/phase issues, often written by AI agents) that describe
  work to do in one repo rather than a developer's pain with tools or process.
- pain_point: one plain-English line, max 20 words, describing the problem from the developer's point of view.
- is_unresolved: true if the problem still seems unsolved or poorly served by existing tools.
  Use the source signals as evidence: an OPEN GitHub issue or a Stack Overflow question with NO accepted answer counts toward unresolved.
  A closed issue or accepted answer counts toward resolved. For HN / DEV.to decide from the text
  (complaints with no working fix, "no tool does X", workarounds = unresolved).
  Announcements, benchmarks and tutorials that present a working solution are NOT unresolved unless they point out a remaining gap.
  unresolved_reason must name the evidence you used (a source signal or what the text says).
- sentiment: the author's feeling about the situation/tools, from -1 (very negative) to 1 (very positive).
- severity: 1 = minor annoyance, 2 = recurring friction, 3 = slows a team down, 4 = blocks merges/releases, 5 = serious cost, outages or security risk.
- competitors: only code review, static analysis or PR tools EXPLICITLY named (e.g. SonarQube, CodeRabbit, GitHub Copilot code review,
  Graphite, Reviewable, Codacy, DeepSource, Qodo, Greptile, Sourcery, Cursor Bugbot, Semgrep, Snyk). Empty list if none.
- Return exactly one result for EVERY post id. Never invent facts that are not in the post.`;

/** Describe the source signals in words Gemini can use as evidence. */
function describeSignals(post: SourcePost): string {
  const s = post.signals;
  const parts: string[] = [];
  if (s.isOpen !== undefined) parts.push(s.isOpen ? "GitHub issue is OPEN" : "GitHub issue is CLOSED");
  if (s.hasAcceptedAnswer !== undefined) parts.push(s.hasAcceptedAnswer ? "has an ACCEPTED answer" : "NO accepted answer");
  if (s.isAnswered !== undefined && !s.hasAcceptedAnswer) parts.push(s.isAnswered ? "has upvoted answers" : "no upvoted answers");
  return parts.join("; ") || "none";
}

/** Classify one batch of up to 25 posts with one Gemini call. */
async function classifyBatch(posts: SourcePost[], topics: Pick<Topic, "id" | "name" | "description">[]) {
  // Short keys (T1, T2...) instead of long UUIDs: fewer tokens, fewer typos.
  const keyToTopicId = new Map(topics.map((t, i) => [`T${i + 1}`, t.id]));
  const topicIdToKey = new Map([...keyToTopicId].map(([key, id]) => [id, key]));
  const topicList = topics.map((t, i) => `T${i + 1}: ${t.name} — ${t.description ?? ""}`).join("\n");

  // Each post gets a short id (p1, p2, ...) so we can match answers back.
  const postText = posts
    .map(
      (p, i) =>
        `### id: p${i + 1}\nsource: ${p.source}\ntitle: ${p.title}\ntext: ${p.snippet || "(no text)"}\n` +
        `found by keyword: "${p.matchedKeyword}" (hint topic ${topicIdToKey.get(p.topicId) ?? "?"})\n` +
        `engagement: ${p.score} points, ${p.commentCount} comments/answers\nsource signals: ${describeSignals(p)}`,
    )
    .join("\n\n");

  const data = await generateJson({
    system: SYSTEM_PROMPT,
    prompt: `Topics:\n${topicList}\n\nClassify these ${posts.length} posts:\n\n${postText}`,
    schema: buildSchema([...keyToTopicId.keys()]),
  });

  const classified: ClassifiedPost[] = [];
  const dropped: ClassifyResult["dropped"] = [];
  const seen = new Set<string>();

  for (const r of data.results) {
    const index = Number(r.id.replace(/^p/, "")) - 1;
    const post = posts[index];
    if (!post || seen.has(r.id)) continue; // unknown or duplicate id -> ignore
    seen.add(r.id);

    const topicId = r.topic === OTHER ? null : keyToTopicId.get(r.topic);
    if (topicId === undefined) {
      dropped.push({ post, note: r.pain_point });
      continue;
    }
    classified.push({
      ...post,
      classification: {
        topicId,
        painPoint: r.pain_point,
        isUnresolved: r.is_unresolved,
        unresolvedReason: r.unresolved_reason,
        sentiment: Math.round(r.sentiment * 100) / 100,
        severity: r.severity,
        competitors: [...new Set(r.competitors.map(normaliseCompetitor).filter(Boolean))],
      },
    });
  }

  const missing = posts.length - seen.size;
  return { classified, dropped, missing };
}

/** Classify all posts. Never throws: failed batches are reported in `errors`. */
export async function classifyPosts(
  posts: SourcePost[],
  topics: Pick<Topic, "id" | "name" | "description">[],
): Promise<ClassifyResult> {
  const batches: SourcePost[][] = [];
  for (let i = 0; i < posts.length; i += BATCH_SIZE) batches.push(posts.slice(i, i + BATCH_SIZE));

  const { results, errors } = await mapWithLimit(batches, PARALLEL_BATCHES, (batch) => classifyBatch(batch, topics));

  const result: ClassifyResult = { classified: [], dropped: [], errors, batches: batches.length };
  for (const r of results) {
    result.classified.push(...r.classified);
    result.dropped.push(...r.dropped);
    if (r.missing > 0) result.errors.push(`Gemini skipped ${r.missing} post(s) in a batch`);
  }
  return result;
}
