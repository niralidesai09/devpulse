// GET /api/reports/:id/export?format=md|json — download a stored report.

import { getDiscussionsByIds } from "@/lib/db/discussions";
import { getReport, getReportEvidence } from "@/lib/db/reports";
import { errorMessage } from "@/lib/log";
import { appUrl } from "@/lib/pipeline/report";
import { reportToMarkdown } from "@/lib/reports/markdown";

export async function GET(request: Request, ctx: RouteContext<"/api/reports/[id]/export">) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return Response.json({ error: "Invalid id" }, { status: 400 });
  try {
    const report = await getReport(id);
    if (!report) return Response.json({ error: "Not found" }, { status: 404 });
    const format = new URL(request.url).searchParams.get("format") === "json" ? "json" : "md";
    const name = `devpulse-${report.period_start.slice(0, 10)}`;
    if (format === "json") {
      const evidence = await getReportEvidence(id);
      return new Response(JSON.stringify({ ...report, evidence }, null, 2), {
        headers: { "content-type": "application/json; charset=utf-8", "content-disposition": `attachment; filename="${name}.json"` },
      });
    }
    const ids = (await getReportEvidence(id)).map((e) => e.discussion_id);
    const docs = new Map((await getDiscussionsByIds([...new Set(ids)])).map((d) => [d.id, d]));
    const base = appUrl();
    const md = reportToMarkdown(report, docs, base ? `${base}/reports/${id}` : null);
    return new Response(md, {
      headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="${name}.md"` },
    });
  } catch (err) {
    return Response.json({ error: errorMessage(err) }, { status: 500 });
  }
}
