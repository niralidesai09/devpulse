// POST /api/run — the dashboard's "Run now" button.
// Runs the full weekly pipeline on demand (collect → classify → score →
// brief → email). Protected by the admin cookie (ADMIN_PASSCODE), so only
// Sumit can spend API quota and send emails.

import { ADMIN_COOKIE, isValidAdminToken } from "@/lib/admin";
import { runPipeline } from "@/lib/pipeline/run";

export const maxDuration = 300; // a full run takes ~70-90s

export async function POST(request: Request) {
  // Read our cookie from the raw Cookie header.
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim().split("="))
    .find(([name]) => name === ADMIN_COOKIE)?.[1];
  if (!isValidAdminToken(cookie)) {
    return Response.json({ error: "Locked. Enter the admin passcode first." }, { status: 401 });
  }

  try {
    const summary = await runPipeline("manual");
    return Response.json(
      { status: summary.status, runId: summary.runId, stats: summary.stats, error: summary.error ?? null },
      { status: summary.status === "failed" ? 500 : 200 },
    );
  } catch (err) {
    // e.g. "Another run is already in progress"
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 409 });
  }
}
