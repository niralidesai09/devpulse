// Helpers shared by all adapters: HTTP with timeout + retry,
// limited concurrency, HTML cleaning and keyword matching.

import type { SourceAdapter, SourceName, SourceResult, SourcePost, SourceStatusValue, TopicInput } from "./types";

const TIMEOUT_MS = 10_000; // 10 seconds per request
const USER_AGENT = "Groundswell/1.0";

/**
 * GET a URL and parse JSON. Gives up after 10s (or timeoutMs), and retries ONCE on any
 * failure (network error, timeout or non-2xx status) after a short pause.
 */
export async function fetchJson<T>(url: string, headers: Record<string, string> = {}, timeoutMs = TIMEOUT_MS): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store", // always live data
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 200)}`);
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (attempt === 1) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Run `worker` over every item, but at most `limit` at the same time,
 * so we never flood an API. Failures are collected, not thrown.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<{ results: R[]; errors: string[] }> {
  const results: R[] = [];
  const errors: string[] = [];
  let next = 0;

  async function lane() {
    while (next < items.length) {
      const item = items[next++];
      try {
        results.push(await worker(item));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return { results, errors };
}

// Turn HTML (or markdown with HTML) into plain text and limit its length.
export function cleanText(input: string | null | undefined, maxLength = 500): string {
  if (!input) return "";
  const text = input
    .replace(/<[^>]*>/g, " ") // remove tags
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ") // collapse whitespace/newlines
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}

/**
 * Pick a 500-character snippet from the full body that CONTAINS the keyword.
 * If the keyword is in the title (or near the start), we just take the start.
 * This way the evidence Gemini reads is the part that talks about the problem.
 */
export function snippetAround(fullText: string, keyword: string, maxLength = 500): string {
  if (fullText.length <= maxLength) return fullText;
  const pos = fullText.toLowerCase().indexOf(keyword.toLowerCase());
  if (pos < maxLength - keyword.length) return fullText.slice(0, maxLength - 1) + "…";
  // Start ~150 characters before the keyword so there is some context.
  const start = Math.max(0, pos - 150);
  return "…" + fullText.slice(start, start + maxLength - 2) + "…";
}

/**
 * Find the first topic whose keyword appears in the text (case-insensitive).
 * `preferredTopicId` is checked first: the topic we were searching for.
 */
export function matchTopic(
  text: string,
  topics: TopicInput[],
  preferredTopicId?: string,
): { topicId: string; keyword: string } | null {
  const haystack = text.toLowerCase();
  const ordered = preferredTopicId
    ? [...topics].sort((a, b) => Number(b.id === preferredTopicId) - Number(a.id === preferredTopicId))
    : topics;
  for (const topic of ordered) {
    for (const keyword of topic.keywords) {
      if (haystack.includes(keyword.toLowerCase())) return { topicId: topic.id, keyword };
    }
  }
  return null;
}

// Unix timestamp in seconds (what HN and Stack Overflow expect).
export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/**
 * Wraps an adapter's work: measures time and turns any crash into
 * status "failed", so one broken source never stops the whole run.
 * `work` returns the posts, any per-request errors, how many requests it
 * made, and coverage notes (e.g. "a search hit its 100-result cap").
 *   no errors            -> "ok"
 *   some requests failed -> "partial"  (data is incomplete, so the run is partial too)
 *   all requests failed  -> "failed"
 */
export async function runSafely(
  name: SourceName,
  work: () => Promise<{ posts: SourcePost[]; errors: string[]; requests: number; notes?: string[] }>,
): Promise<SourceResult> {
  const start = Date.now();
  try {
    const { posts, errors, requests, notes = [] } = await work();
    const failedRequests = errors.length;
    const status: SourceStatusValue =
      failedRequests === 0 ? "ok" : requests > 0 && failedRequests >= requests ? "failed" : "partial";
    const error = failedRequests ? `${failedRequests}/${requests} requests failed. First error: ${errors[0]}` : null;
    return { posts, ok: status === "ok", status, error, notes, requests, failedRequests, durationMs: Date.now() - start };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      posts: [],
      ok: false,
      status: "failed",
      error: `${name}: ${message}`,
      notes: [],
      requests: 0,
      failedRequests: 0,
      durationMs: Date.now() - start,
    };
  }
}

// Re-export the types so adapters can import everything from one place.
export type { SourceAdapter, SourcePost, TopicInput };
