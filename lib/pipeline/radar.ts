// EMERGING TOPIC RADAR
//
// The classifier marks posts "other" when they are a real pain point in
// Sumit's space that NO monitored topic covers. Here Gemini groups those
// posts into up to 4 suggested new topics (name, description, keywords),
// each backed by at least 2 real threads. Sumit approves or rejects them
// on the dashboard; approving creates a real topic, so next week's run
// monitors it automatically.
//
// Code checks every suggestion before saving it:
//   - at least 2 real evidence threads (ids must exist)
//   - not the same name as an existing topic or an earlier suggestion
//     (pending OR rejected, so a rejected idea doesn't come back weekly)
//   - keywords already monitored are removed; at least 3 must remain

import { z } from "zod";
import type { ClassifiedPost } from "@/lib/ai/classify";
import { generateJson } from "@/lib/ai/gemini";
import { createServerClient, type Topic } from "@/lib/db/supabase";

const MIN_POSTS = 3; // fewer unmatched posts than this -> nothing to cluster
const MIN_EVIDENCE = 2; // a suggestion needs at least 2 real threads
const MIN_KEYWORDS = 3;
const MAX_POSTS_FOR_GEMINI = 80;

const RadarSchema = z.object({
  suggestions: z
    .array(
      z.object({
        name: z.string().describe("Short topic name, 2-6 words, e.g. 'Stacked PR tooling gaps'"),
        description: z.string().describe("One sentence: what developers are struggling with"),
        rationale: z.string().describe("One sentence: why this matters for a code review automation product"),
        keywords: z
          .array(z.string())
          .describe("5-8 exact phrases developers actually type in titles/posts (2-4 words, lowercase unless a product name)"),
        evidence: z.array(z.string()).describe("Ids (p1, p2, ...) of the posts that belong to this topic"),
      }),
    )
    .max(4),
});

const SYSTEM_PROMPT = `You run an "emerging topic radar" for Sumit, PM of a code review automation product.
You get developer posts that are real pain points about code review, CI/CD, testing or developer workflow,
but that do NOT fit any topic Sumit already monitors.

Group them into at most 4 NEW topics worth monitoring every week. Rules:
- Only suggest a topic if at least ${MIN_EVIDENCE} posts clearly share the same underlying problem. Fewer good topics beats many weak ones.
- Do not re-create an existing topic under another name (the list is given).
- Keywords are used as exact-phrase searches on Hacker News, GitHub Issues, Stack Overflow and DEV.to:
  short, specific phrases developers really type (e.g. "stacked prs", "merge queue", "ci minutes"). Avoid generic words like "code" or "bug".
- evidence: list the post ids that belong to the topic. Never invent ids.
- Return an empty list if no group of posts qualifies.`;

export type RadarResult = { saved: number; considered: number; rejected: string[]; error: string | null };

export async function runEmergingTopicRadar(
  runId: string,
  unmatched: ClassifiedPost[],
  topics: Pick<Topic, "name" | "description" | "keywords">[],
): Promise<RadarResult> {
  if (unmatched.length < MIN_POSTS) {
    return { saved: 0, considered: unmatched.length, rejected: [], error: null };
  }
  const supabase = createServerClient();

  // Names we must not suggest again: existing topics + every earlier suggestion.
  const { data: earlier } = await supabase.from("suggested_topics").select("name");
  const usedNames = new Set([...topics.map((t) => t.name), ...(earlier ?? []).map((s) => s.name as string)].map((n) => n.trim().toLowerCase()));
  const monitoredKeywords = new Set(topics.flatMap((t) => t.keywords.map((k) => k.trim().toLowerCase())));

  const posts = unmatched.slice(0, MAX_POSTS_FOR_GEMINI);
  const prompt =
    `Topics Sumit already monitors (do not duplicate):\n${topics.map((t) => `- ${t.name}: ${t.description ?? ""}`).join("\n")}\n\n` +
    `Unmatched posts:\n` +
    posts.map((p, i) => `p${i + 1} | ${p.source} | "${p.title}" | pain: ${p.classification.painPoint}`).join("\n");

  let data: z.infer<typeof RadarSchema>;
  try {
    data = await generateJson({ system: SYSTEM_PROMPT, prompt, schema: RadarSchema });
  } catch (err) {
    return { saved: 0, considered: posts.length, rejected: [], error: err instanceof Error ? err.message : String(err) };
  }

  const rejected: string[] = [];
  const rows = [];
  for (const s of data.suggestions) {
    const name = s.name.trim().slice(0, 80);
    // Evidence: only real ids, each counted once.
    const evidence = [...new Set(s.evidence)]
      .map((id) => posts[Number(id.replace(/^p/i, "")) - 1])
      .filter((p): p is ClassifiedPost => Boolean(p));
    // Keywords: tidy, unique, and not already monitored.
    const keywords = [...new Set(s.keywords.map((k) => k.trim().toLowerCase()))]
      .filter((k) => k.length >= 2 && k.length <= 60 && !monitoredKeywords.has(k))
      .slice(0, 10);

    if (name.length < 2 || usedNames.has(name.toLowerCase())) rejected.push(`${name}: duplicate name`);
    else if (evidence.length < MIN_EVIDENCE) rejected.push(`${name}: only ${evidence.length} evidence thread(s)`);
    else if (keywords.length < MIN_KEYWORDS) rejected.push(`${name}: too few new keywords`);
    else {
      usedNames.add(name.toLowerCase());
      rows.push({
        run_id: runId,
        name,
        description: s.description.trim(),
        rationale: s.rationale.trim(),
        keywords,
        evidence_urls: evidence.map((p) => p.url),
        post_count: evidence.length,
        status: "pending",
      });
    }
  }

  if (rows.length) {
    const { error } = await supabase.from("suggested_topics").insert(rows);
    if (error) return { saved: 0, considered: posts.length, rejected, error: `Could not save suggestions: ${error.message}` };
  }
  return { saved: rows.length, considered: posts.length, rejected, error: null };
}
