// Evidence: every relevant discussion stored by the latest run that
// produced data, with filters. Source fields (title, excerpt, URL, times)
// are shown exactly as collected; topic, status and summary are labelled
// as AI-assisted in the UI. Server only.

import { createServerClient } from "./supabase";

export type EvidenceFilters = {
  q: string;
  source: string; // "" = all
  topic: string; // "" = all, "none" = not yet monitored, else topic id
  status: "" | "unresolved" | "resolved";
  within: "" | "1" | "3" | "7"; // published within N days
  sort: "newest" | "discussed";
};

export type EvidenceRecord = {
  id: string;
  source: string;
  externalId: string;
  url: string;
  urlValid: boolean;
  title: string;
  snippet: string | null;
  author: string | null;
  score: number;
  comments: number;
  postedAt: string | null;
  retrievedAt: string | null;
  matchedKeyword: string | null;
  topicId: string | null;
  topicName: string | null;
  painPoint: string | null;
  isUnresolved: boolean;
  unresolvedReason: string | null;
  severity: number | null;
};

export type EvidenceResult = {
  runId: string;
  windowStart: string | null;
  windowEnd: string | null;
  total: number; // all relevant discussions in the run
  records: EvidenceRecord[]; // after filters
  topics: { id: string; name: string; count: number }[];
  sources: { id: string; count: number }[];
  unmonitored: number;
};

const SOURCE_HOSTS: Record<string, string> = {
  hackernews: "news.ycombinator.com",
  github: "github.com",
  stackoverflow: "stackoverflow.com",
  devto: "dev.to",
};

/** https on the record's own source site, or we don't render it as a link. */
function validUrl(source: string, url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname.replace(/^www\./, "") === SOURCE_HOSTS[source];
  } catch {
    return false;
  }
}

export function parseEvidenceFilters(sp: Record<string, string | string[] | undefined>): EvidenceFilters {
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "";
  const status = one("status");
  const within = one("within");
  return {
    q: one("q").trim().slice(0, 100),
    source: Object.keys(SOURCE_HOSTS).includes(one("source")) ? one("source") : "",
    topic: one("topic"),
    status: status === "unresolved" || status === "resolved" ? status : "",
    within: within === "1" || within === "3" || within === "7" ? within : "",
    sort: one("sort") === "discussed" ? "discussed" : "newest",
  };
}

export async function getEvidence(f: EvidenceFilters): Promise<EvidenceResult | null> {
  const supabase = createServerClient();
  const { data: run } = await supabase
    .from("runs")
    .select("id, window_start, window_end")
    .in("status", ["success", "partial"])
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!run) return null;

  const [{ data: posts }, { data: topics }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, source, external_id, url, title, snippet, author, score, comment_count, posted_at, retrieved_at, matched_keyword, topic_id, pain_point, is_unresolved, unresolved_reason, severity",
      )
      .eq("run_id", run.id),
    supabase.from("topics").select("id, name"),
  ]);
  const nameById = new Map((topics ?? []).map((t) => [t.id as string, t.name as string]));

  const all: EvidenceRecord[] = (posts ?? []).map((p) => ({
    id: p.id,
    source: p.source,
    externalId: p.external_id ?? "",
    url: p.url,
    urlValid: validUrl(p.source, p.url),
    title: p.title,
    snippet: p.snippet,
    author: p.author,
    score: p.score ?? 0,
    comments: p.comment_count ?? 0,
    postedAt: p.posted_at,
    retrievedAt: p.retrieved_at,
    matchedKeyword: p.matched_keyword,
    topicId: p.topic_id,
    topicName: p.topic_id ? (nameById.get(p.topic_id) ?? "Deleted topic") : null,
    painPoint: p.pain_point,
    isUnresolved: Boolean(p.is_unresolved),
    unresolvedReason: p.unresolved_reason,
    severity: p.severity,
  }));

  const needle = f.q.toLowerCase();
  const cutoff = f.within ? Date.now() - Number(f.within) * 86_400_000 : null;
  const records = all
    .filter((r) => !f.source || r.source === f.source)
    .filter((r) => !f.topic || (f.topic === "none" ? r.topicId === null : r.topicId === f.topic))
    .filter((r) => !f.status || (f.status === "unresolved" ? r.isUnresolved : !r.isUnresolved))
    .filter((r) => cutoff === null || (r.postedAt !== null && new Date(r.postedAt).getTime() >= cutoff))
    .filter(
      (r) =>
        !needle ||
        [r.title, r.snippet, r.painPoint, r.matchedKeyword, r.topicName].some((v) => v?.toLowerCase().includes(needle)),
    )
    .sort((a, b) =>
      f.sort === "discussed"
        ? b.score + b.comments - (a.score + a.comments)
        : new Date(b.postedAt ?? 0).getTime() - new Date(a.postedAt ?? 0).getTime(),
    );

  const topicCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  for (const r of all) {
    if (r.topicId) topicCounts.set(r.topicId, (topicCounts.get(r.topicId) ?? 0) + 1);
    sourceCounts.set(r.source, (sourceCounts.get(r.source) ?? 0) + 1);
  }

  return {
    runId: run.id,
    windowStart: run.window_start,
    windowEnd: run.window_end,
    total: all.length,
    records,
    topics: [...topicCounts.entries()]
      .map(([id, count]) => ({ id, name: nameById.get(id) ?? "Deleted topic", count }))
      .sort((a, b) => b.count - a.count),
    sources: [...sourceCounts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
    unmonitored: all.filter((r) => r.topicId === null).length,
  };
}
