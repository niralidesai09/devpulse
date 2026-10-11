// Page data loading with a readable failure instead of a crashed route.

import { ConfigError } from "./client";

export type Loaded<T> = { ok: true; data: T } | { ok: false; error: string; isConfig: boolean };

export async function safeLoad<T>(fn: () => Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // A missing table means migrations have not been applied yet.
    const missingTable = /relation .* does not exist|Could not find the table|schema cache/i.test(message);
    return {
      ok: false,
      error: missingTable ? `${message} — the database schema is not set up yet (run npm run db:migrate).` : message,
      isConfig: err instanceof ConfigError || missingTable,
    };
  }
}
