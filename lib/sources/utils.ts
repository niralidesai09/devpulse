// HTTP + concurrency helpers shared by all adapters.

import type { SourceAdapter, SourceFetchResult, SourceOutcome, FetchContext } from "./types";

const TIMEOUT_MS = 12_000;
const USER_AGENT = "DevPulse/2.0 (developer community research; https://github.com/niralidesai09/devpulse)";
const MAX_RETRIES = 2; // so at most 3 attempts per request
const MAX_WAIT_MS = 15_000; // never wait longer than this for a Retry-After

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public retryAfterMs: number | null = null,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Retry only what can succeed later: network errors, timeouts, 429 and 5xx. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return err.status === 429 || err.status >= 500;
  return true; // network error / timeout
}

/** Wait time before retry `attempt` (1-based): server's Retry-After if given, else 1s, 3s. */
export function retryDelayMs(err: unknown, attempt: number): number {
  if (err instanceof HttpError && err.retryAfterMs !== null) return Math.min(err.retryAfterMs, MAX_WAIT_MS);
  return 1000 * (2 * attempt - 1);
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return secs * 1000;
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : null;
}

/** GET a URL and parse JSON, with timeout and bounded retry. */
export async function fetchJson<T>(
  url: string,
  headers: Record<string, string> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs(lastError, attempt));
    try {
      const res = await fetchImpl(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 200).replace(/\s+/g, " ");
        throw new HttpError(res.status, `HTTP ${res.status}: ${body}`, parseRetryAfter(res.headers.get("retry-after")));
      }
      return (await res.json()) as T;
    } catch (err) {
      lastError = err;
      if (!isRetryable(err)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/**
 * Run `worker` over every item with at most `limit` in flight, so we never
 * flood an API. Failures are collected, not thrown.
 */
export async function mapWithLimit<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<{ results: R[]; errors: string[] }> {
  const results: R[] = [];
  const errors: string[] = [];
  let next = 0;

  async function lane() {
    while (next < items.length) {
      const index = next++;
      try {
        results.push(await worker(items[index], index));
      } catch (err) {
        errors.push(err instanceof Error ? err.message : String(err));
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return { results, errors };
}

export function toUnixSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

/** An empty result to build on. */
export function emptyResult(): SourceFetchResult {
  return { discussions: [], requests: 0, failedRequests: 0, truncated: false, skippedMalformed: 0, errors: [] };
}

/**
 * Run an adapter and turn any crash into status "failed", so one broken
 * source never stops the whole collection.
 *   succeeded = every request worked
 *   partial   = some requests failed (data from the others is kept)
 *   failed    = nothing worked
 */
export async function runAdapter(adapter: SourceAdapter, ctx: FetchContext): Promise<SourceOutcome> {
  const start = Date.now();
  try {
    const r = await adapter.fetch(ctx);
    const status =
      r.requests > 0 && r.failedRequests >= r.requests ? "failed" : r.failedRequests > 0 ? "partial" : "succeeded";
    const error = r.errors.length
      ? `${r.failedRequests}/${r.requests} requests failed. First error: ${r.errors[0]}`
      : null;
    return { ...r, sourceId: adapter.id, status, error, durationMs: Date.now() - start };
  } catch (err) {
    return {
      ...emptyResult(),
      sourceId: adapter.id,
      status: "failed",
      error: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
    };
  }
}
