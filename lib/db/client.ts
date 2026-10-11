// The ONE Supabase client the app uses: service-role, server-only.
//
// Why only one: the browser never talks to Supabase. Pages are rendered on
// the server and mutations go through authenticated Server Actions / Route
// Handlers, so the service-role key (which bypasses Row Level Security)
// stays on the server. RLS is enabled on every table with no policies for
// the anon/authenticated roles, so the public anon key can read nothing.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export function getDb(): SupabaseClient {
  if (typeof window !== "undefined") throw new Error("getDb() must only be called on the server");
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ConfigError(
      `Supabase is not configured: missing ${[!url && "NEXT_PUBLIC_SUPABASE_URL", !key && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(" and ")}.`,
    );
  }
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return client;
}

/** Throw a readable error for a failed Supabase call. */
export function check<T>(res: { data: T; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what}: ${res.error.message}`);
  return res.data;
}

/** Read every row of a query in pages of 1000 (PostgREST's default cap). */
export async function selectAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  what: string,
  max = 20_000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < max; from += 1000) {
    const res = await build(from, from + 999);
    if (res.error) throw new Error(`${what}: ${res.error.message}`);
    const rows = res.data ?? [];
    out.push(...rows);
    if (rows.length < 1000) break;
  }
  return out;
}
