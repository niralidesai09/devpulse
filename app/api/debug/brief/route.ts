// GET /api/debug/brief
// Test endpoint for Step 6. Shows the latest Friday brief exactly as the
// email looks (HTML).
//   ?format=md      -> the raw markdown + self-checks as JSON instead
//   ?regenerate=1   -> re-write the brief for the latest run with Gemini (no new data collection)
//   ?email=1        -> (re)send the brief with Resend
//
// Protected like the other debug endpoints: open in local development;
// in production it needs  Authorization: Bearer <CRON_SECRET>.

import { hasCronSecret } from "@/lib/auth";
import { createServerClient } from "@/lib/db/supabase";
import { briefEmailHtml, sendBriefEmail } from "@/lib/email/brief-email";
import { createBrief } from "@/lib/pipeline/brief";

export const maxDuration = 120;

export async function GET(request: Request) {
  const isDev = process.env.NODE_ENV === "development";
  if (!isDev && !hasCronSecret(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params = new URL(request.url).searchParams;
  const supabase = createServerClient();

  try {
    // The latest finished run that has data.
    const { data: run } = await supabase
      .from("runs")
      .select("id")
      .in("status", ["success", "partial"])
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!run) return Response.json({ message: "No finished runs yet." });

    if (params.get("regenerate") === "1") await createBrief(run.id);

    const { data: brief } = await supabase.from("briefs").select("*").eq("run_id", run.id).maybeSingle();
    if (!brief) return Response.json({ message: "This run has no brief yet. Add ?regenerate=1 to write one." });

    let emailResult = null;
    if (params.get("email") === "1") emailResult = await sendBriefEmail(brief.id);

    if (params.get("format") === "md" || emailResult) {
      const { data: fresh } = await supabase.from("briefs").select("*").eq("id", brief.id).single();
      return Response.json({
        runId: run.id,
        model: fresh?.model,
        emailedAt: fresh?.emailed_at,
        emailError: fresh?.email_error,
        checks: fresh?.checks,
        emailResult,
        markdown: fresh?.markdown,
      });
    }

    return new Response(briefEmailHtml(brief.markdown), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: message }, { status: 500 });
  }
}
