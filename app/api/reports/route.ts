// POST /api/reports — (re)generate the brief from data already stored, without
// collecting again (admin only). Useful when a run had no time left for the
// report or the model was temporarily unavailable.

import { requestIsAdmin } from "@/lib/auth";
import { errorMessage, logger } from "@/lib/log";
import { generateReport } from "@/lib/pipeline/report";

export const maxDuration = 300;

export async function POST(request: Request) {
  if (!requestIsAdmin(request)) return Response.json({ error: "Admin access required." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { sendEmail?: boolean };
  try {
    const r = await generateReport({ runId: null, trigger: "manual", log: logger({ route: "reports.generate" }), sendEmail: body.sendEmail === true });
    return Response.json(r, { status: r.status === "failed" ? 422 : 200 });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}
