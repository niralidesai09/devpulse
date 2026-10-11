// Supabase clients for DevPulse.
//
// There are TWO ways to talk to the database, with different powers:
//
// 1. createServerClient()  -> uses the SERVICE ROLE key.
//    - Bypasses Row Level Security, so it can INSERT/UPDATE/DELETE.
//    - Used ONLY on the server (API routes, the pipeline, cron jobs).
//    - The key has no NEXT_PUBLIC_ prefix, so Next.js never sends it
//      to the browser. We also throw an error if this is ever called
//      in the browser, as an extra safety check.
//
// 2. createBrowserClient() -> uses the public ANON key.
//    - Row Level Security only allows it to SELECT (read).
//    - Safe to use anywhere, including the browser and server pages.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Small helper: read an env var or fail with a clear message.
function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing environment variable ${name}. Check .env.local`);
  }
  return value;
}

/** Full-access client for server-side writes. NEVER use in client components. */
export function createServerClient(): SupabaseClient {
  if (typeof window !== "undefined") {
    throw new Error("createServerClient() must only be called on the server");
  }
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY),
    // The server has no logged-in user, so don't try to store a session.
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

/** Read-only client (anon key). Safe in the browser and in server pages. */
export function createBrowserClient(): SupabaseClient {
  // Note: NEXT_PUBLIC_ vars must be written out in full like this so
  // Next.js can copy their values into the browser bundle.
  return createClient(
    requireEnv("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}

// Shape of one row in the "topics" table (matches supabase/schema.sql).
export type Topic = {
  id: string;
  name: string;
  description: string | null;
  keywords: string[];
  is_active: boolean;
  created_at: string;
};
