// "Ask the Pulse": Sumit asks a question in plain English and gets an
// answer built ONLY from posts Groundswell has stored.
//
//   1. Postgres full-text search (search_posts) finds the most relevant posts.
//   2. No matches -> "not enough data" straight away (Gemini isn't called).
//   3. Gemini gets ONLY those posts, numbered S1, S2, ... and must cite them.
//      It can also say "not enough data" if the posts don't answer the question.
//   4. Code turns [S3] into real links and drops any id that doesn't exist,
//      so every citation points to a real thread.

import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase";
import { SOURCE_LABEL } from "@/lib/format";
import { generateJson, UNTRUSTED_CONTENT_RULE, untrusted } from "./gemini";

const MAX_POSTS = 12;

export type Citation = { ref: string; title: string; url: string; source: string };
export type AskResult = { enoughData: boolean; answer: string; citations: Citation[]; postsFound: number };

const NOT_ENOUGH = "Not enough data: Groundswell hasn't stored posts that answer this. Try different words, or add a topic for it.";

const AnswerSchema = z.object({
  enough_data: z.boolean().describe("false if the posts don't contain an answer to the question"),
  answer: z.string().describe("Short markdown answer (max ~150 words, bullets welcome) with [S#] citations after each claim"),
});

const SYSTEM_PROMPT = `You answer questions for Sumit, PM of a code review automation product, using ONLY the developer posts provided.
Rules:
- Use only facts stated in the posts. No outside knowledge, no guessing, no invented numbers.
- Cite every claim with the post ids in square brackets, e.g. [S2] or [S1, S4].
- Counting is allowed only by counting the provided posts (say "in the posts found", not "developers in general").
- If the posts do not answer the question, set enough_data to false and say briefly what is missing.
- Never write URLs.

${UNTRUSTED_CONTENT_RULE}`;

export async function askThePulse(question: string): Promise<AskResult> {
  const { data: posts, error } = await createServerClient().rpc("search_posts", { q: question, max_results: MAX_POSTS });
  if (error) throw new Error(`Search failed: ${error.message}`);
  if (!posts || posts.length === 0) return { enoughData: false, answer: NOT_ENOUGH, citations: [], postsFound: 0 };

  const sources = (posts as Record<string, unknown>[]).map((p, i) => ({
    ref: `S${i + 1}`,
    url: p.url as string,
    title: p.title as string,
    source: p.source as string,
    text:
      `(${SOURCE_LABEL[p.source as string] ?? p.source}, ${String(p.posted_at).slice(0, 10)})\n` +
      `<post>\ntitle: ${untrusted(p.title as string)}\nexcerpt: ${untrusted(p.snippet as string)}\n</post>\n` +
      `pain point: ${untrusted(p.pain_point as string) || "-"} | ${p.is_unresolved ? "unresolved" : "resolved"} | severity ${p.severity ?? "-"}/5` +
      ((p.competitors as string[])?.length ? ` | tools: ${(p.competitors as string[]).join(", ")}` : ""),
  }));

  const result = await generateJson({
    system: SYSTEM_PROMPT,
    prompt: `Question (from Sumit): ${untrusted(question)}\n\nPosts:\n${sources.map((s) => `[${s.ref}] ${s.text}`).join("\n\n")}`,
    schema: AnswerSchema,
  });

  if (!result.enough_data) {
    return { enoughData: false, answer: `${NOT_ENOUGH}\n\n${stripRefs(result.answer)}`.trim(), citations: [], postsFound: sources.length };
  }

  const { answer, used } = linkCitations(result.answer, sources);

  // An answer with no valid citation is not trustworthy -> treat as not enough data.
  if (used.length === 0) return { enoughData: false, answer: NOT_ENOUGH, citations: [], postsFound: sources.length };
  return { enoughData: true, answer, citations: used, postsFound: sources.length };
}

/**
 * [S3] / [S1, S4] -> numbered links to the real threads. Unknown ids are
 * removed, and any link or URL the model typed itself is stripped, so every
 * remaining link points to a post that search actually found.
 */
export function linkCitations(text: string, sources: { ref: string; title: string; url: string; source: string }[]) {
  const byRef = new Map(sources.map((s) => [s.ref, s]));
  const used: Citation[] = [];
  const answer = text
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1") // links typed by the model -> plain text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\s*\[((?:S\d+\s*,?\s*)+)\]/g, (_, ids: string) => {
      const links = ids
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((id) => byRef.get(id))
        .filter((s): s is (typeof sources)[number] => Boolean(s))
        .map((s) => {
          if (!used.some((u) => u.ref === s.ref)) used.push({ ref: s.ref, title: s.title, url: s.url, source: s.source });
          return `[${s.ref}](${s.url})`;
        });
      return links.length ? ` ${links.join(" ")}` : "";
    });
  return { answer, used };
}

const stripRefs = (text: string) => text.replace(/\s*\[((?:S\d+\s*,?\s*)+)\]/g, "");
