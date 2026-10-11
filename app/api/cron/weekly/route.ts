// GET /api/cron/weekly
// Runs the whole weekly pipeline. Called by Vercel Cron every Friday
// (schedule added in Step 7), which sends  Authorization: Bearer <CRON_SECRET>.
// ALWAYS protected, even in local development, because it writes data
// and spends Gemini quota.

import { hasCronSecret } from "@/lib/auth";
import { runPipeline } from "@/lib/pipeline/run";

// Collect (~10s) + Gemini classify / baseline (~30-90s). Vercel allows up to 300s.
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!hasCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runPipeline("cron");
    return Response.json(summary, { status: summary.status === "failed" ? 500 : 200 });
  } catch (err) {
    // e.g. "Another run is already in progress"
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 409 });
  }
}
