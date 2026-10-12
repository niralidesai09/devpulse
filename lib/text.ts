// Pure text helpers shared by the source adapters and the analysis step.
// No network, no database — unit-tested in tests/unit/text.test.ts.

/** Turn HTML (or markdown with HTML) into plain text and cap its length. */
export function cleanText(input: string | null | undefined, maxLength = 500): string {
  if (!input) return "";
  const text = input
    .replace(/<[^>]*>/g, " ") // remove tags
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => safeCodePoint(Number(dec)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ") // collapse whitespace/newlines
    .trim();
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}

function safeCodePoint(n: number): string {
  try {
    return String.fromCodePoint(n);
  } catch {
    return " ";
  }
}

/** Lower-case and collapse whitespace — the same rule the database uses for keyword uniqueness. */
export function normalizeKeyword(keyword: string): string {
  return keyword.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Does `keyword` appear in `text` as a phrase? Case-insensitive, whitespace-
 * tolerant, and bounded by non-alphanumerics, with an optional plural
 * suffix: "flaky test" matches "Flaky  tests", but "test retry" does NOT
 * match "contest retry" and "PR size" does not match "PR sizing".
 */
export function containsPhrase(text: string, keyword: string): boolean {
  const k = normalizeKeyword(keyword);
  if (!k) return false;
  const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+");
  return new RegExp(`(^|[^a-z0-9])${escaped}(e?s)?($|[^a-z0-9])`, "i").test(text);
}

export type KeywordRef = { keyword: string; topicId: string };

/** Every configured keyword found in the text (deduplicated, original casing). */
export function matchKeywords(text: string, keywords: KeywordRef[]): KeywordRef[] {
  const seen = new Set<string>();
  const out: KeywordRef[] = [];
  for (const ref of keywords) {
    const key = normalizeKeyword(ref.keyword);
    if (seen.has(key)) continue;
    if (containsPhrase(text, ref.keyword)) {
      seen.add(key);
      out.push(ref);
    }
  }
  return out;
}

/**
 * Pick a short excerpt from the full body that CONTAINS the keyword, so the
 * evidence shown (and sent to Gemini) is the part that talks about the problem.
 */
export function excerptAround(fullText: string, keyword: string | null, maxLength = 600): string {
  if (fullText.length <= maxLength) return fullText;
  const pos = keyword ? fullText.toLowerCase().indexOf(keyword.toLowerCase()) : -1;
  if (pos < 0 || pos < maxLength - keyword!.length - 100) return fullText.slice(0, maxLength - 1) + "…";
  const start = Math.max(0, pos - 200); // some context before the keyword
  return "…" + fullText.slice(start, start + maxLength - 2) + "…";
}

// Query parameters that never change which page a URL points to.
const TRACKING_PARAMS = /^(utm_[a-z]+|ref|ref_src|source|fbclid|gclid|mc_cid|mc_eid)$/i;

/**
 * Canonical form of a URL for the SECONDARY dedupe key:
 * lower-case host, no "www.", no fragment, no trailing slash, no tracking
 * parameters, remaining parameters sorted, http → https.
 */
export function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw.trim());
    const params = [...u.searchParams.entries()]
      .filter(([k]) => !TRACKING_PARAMS.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const query = params.length ? "?" + new URLSearchParams(params).toString() : "";
    const host = u.host.toLowerCase().replace(/^www\./, "");
    const path = u.pathname.replace(/\/+$/, "");
    return `https://${host}${path}${query}`;
  } catch {
    return raw.trim();
  }
}

/** Only http(s) links are ever rendered as clickable (blocks javascript: URLs). */
export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/** Does `quote` appear verbatim (ignoring case/whitespace/quote-style) in `source`? */
export function isVerbatimQuote(quote: string, source: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201c\u201d]/g, '"')
      .replace(/…/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const q = norm(quote);
  return q.length >= 12 && norm(source).includes(q);
}

/**
 * Display-only: make Markdown-heavy excerpts (GitHub issues) readable.
 * The stored text is never changed — this only affects how it is shown.
 */
export function readableExcerpt(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // links → text
    .replace(/`{1,3}([^`]*)`{1,3}/g, "$1") // inline code
    .replace(/(^|\s)#{1,6}\s+/g, "$1") // headings
    .replace(/(^|\s)[-*+]\s+\[[ xX]\]\s+/g, "$1") // task list items
    .replace(/(^|\s)(?:[-*+]|\d+\.)\s+(?=\S)/g, "$1") // list markers
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, "$1$2") // bold
    .replace(/(^|\s)>\s+/g, "$1") // blockquotes
    .replace(/\|/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
