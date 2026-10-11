// Email delivery via Resend (https://resend.com/docs/api-reference/emails/send-email).
// Status is only recorded as "sent" when Resend returns an email id.

import { Resend } from "resend";
import type { StoredBrief } from "@/lib/ai/brief";
import type { ReportMetrics } from "@/lib/analytics/metrics";
import { isSafeHttpUrl } from "@/lib/text";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.BRIEF_TO_EMAIL);
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderBriefEmail(input: {
  reportUrl: string | null;
  metrics: ReportMetrics;
  brief: StoredBrief;
  links: Map<string, { title: string; url: string; source: string }>;
  painPointTitles: Map<string, string>;
}): { subject: string; html: string; text: string } {
  const { metrics: m, brief } = input;
  const cite = (ids: string[]) =>
    ids
      .map((id) => input.links.get(id))
      .filter((l): l is NonNullable<typeof l> => Boolean(l && isSafeHttpUrl(l.url)))
      .slice(0, 3)
      .map((l) => `<a href="${esc(l.url)}" style="color:#3b5bdb">${esc(l.source)}</a>`)
      .join(" · ");

  const top = m.painPoints.slice(0, 5);
  const rows = top
    .map(
      (p) =>
        `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(p.title)}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${p.current}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${p.previous}</td>` +
        `<td style="padding:6px 8px;border-bottom:1px solid #eee">${esc(p.status.replace("_", " "))}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:640px;margin:0 auto;padding:24px">
<p style="color:#666;font-size:13px;margin:0">Developer Community Pulse · ${esc(m.current.label)} (${esc(m.timezone)})</p>
<h1 style="font-size:20px;line-height:1.35;margin:8px 0 16px">${esc(brief.headline)}</h1>
<p style="font-size:13px;color:#444">${m.totals.current.relevant} relevant of ${m.totals.current.unique} unique discussions · ${m.totals.current.painPoints} pain points · previous week ${m.totals.previous.relevant} relevant</p>
<h2 style="font-size:15px;margin:20px 0 8px">Executive summary</h2>
<ul style="padding-left:18px;margin:0">${brief.executive_summary.map((b) => `<li style="margin:0 0 8px">${esc(b.text)} <span style="font-size:12px">${cite(b.evidence)}</span></li>`).join("")}</ul>
<h2 style="font-size:15px;margin:20px 0 8px">Top pain points</h2>
<table style="border-collapse:collapse;width:100%;font-size:13px"><tr style="text-align:left;color:#666"><th style="padding:6px 8px">Pain point</th><th style="padding:6px 8px;text-align:right">This wk</th><th style="padding:6px 8px;text-align:right">Prev wk</th><th style="padding:6px 8px">Trend</th></tr>${rows}</table>
<h2 style="font-size:15px;margin:20px 0 8px">Recommendations</h2>
<ol style="padding-left:18px;margin:0">${brief.recommendations.map((r) => `<li style="margin:0 0 8px"><strong>${esc(r.title)}</strong> — ${esc(r.rationale)} <span style="font-size:12px">${cite(r.evidence)}</span></li>`).join("")}</ol>
${m.quality.warnings.length ? `<h2 style="font-size:15px;margin:20px 0 8px">Data caveats</h2><ul style="padding-left:18px;margin:0;color:#555;font-size:13px">${m.quality.warnings.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
${input.reportUrl && isSafeHttpUrl(input.reportUrl) ? `<p style="margin-top:24px"><a href="${esc(input.reportUrl)}" style="color:#3b5bdb">Open the full report with all evidence →</a></p>` : ""}
<p style="color:#888;font-size:12px;margin-top:24px">Numbers are computed from stored discussions; narrative written by Gemini Flash and checked against cited evidence.</p>
</body></html>`;

  const text = [
    `Developer Community Pulse — ${m.current.label}`,
    "",
    brief.headline,
    "",
    ...brief.executive_summary.map((b) => `• ${b.text}`),
    "",
    "Recommendations:",
    ...brief.recommendations.map((r, i) => `${i + 1}. ${r.title} — ${r.rationale}`),
    "",
    input.reportUrl ? `Full report: ${input.reportUrl}` : "",
  ].join("\n");

  return { subject: `Developer Community Pulse — ${m.current.label}`, html, text };
}

export async function sendBriefEmail(msg: { subject: string; html: string; text: string }): Promise<
  { ok: true; id: string } | { ok: false; error: string }
> {
  if (!isEmailConfigured()) return { ok: false, error: "RESEND_API_KEY or BRIEF_TO_EMAIL not set" };
  const resend = new Resend(process.env.RESEND_API_KEY);
  const to = process.env.BRIEF_TO_EMAIL!.split(",").map((s) => s.trim()).filter(Boolean);
  const from = process.env.BRIEF_FROM_EMAIL || "DevPulse <onboarding@resend.dev>";
  try {
    const { data, error } = await resend.emails.send({ from, to, subject: msg.subject, html: msg.html, text: msg.text });
    if (error || !data?.id) return { ok: false, error: error?.message ?? "Resend returned no email id" };
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
