// Emails a saved brief to Sumit with Resend.
//
// - From: onboarding@resend.dev (Resend's test sender; no domain setup
//   needed, but it can only deliver to the email of the Resend account owner).
// - To: BRIEF_TO_EMAIL.
// - The markdown is turned into simple HTML with inline-friendly styles
//   (email apps ignore most modern CSS), plus a plain-text copy.
// - On success we store emailed_at; on failure we store email_error.

import { Resend } from "resend";
import { createServerClient } from "@/lib/db/supabase";
import { markdownToHtml } from "@/lib/markdown";

const FROM = "Groundswell <onboarding@resend.dev>";

/** Wrap the brief HTML in an email-safe page. */
export function briefEmailHtml(markdown: string): string {
  const body = markdownToHtml(markdown);
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body { margin:0; padding:0; background:#f4f5f7; }
  .wrap { max-width:680px; margin:0 auto; padding:24px 16px; }
  .card { background:#ffffff; border:1px solid #e3e5e8; border-radius:10px; padding:28px 28px 20px; }
  .card, .card td, .card th { font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; color:#1f2328; font-size:15px; line-height:1.55; }
  h1 { font-size:22px; line-height:1.3; margin:0 0 6px; }
  h2 { font-size:17px; margin:28px 0 8px; padding-top:14px; border-top:1px solid #eceef1; }
  p { margin:8px 0; }
  em { color:#59636e; }
  ul, ol { padding-left:22px; margin:8px 0; }
  li { margin:6px 0; }
  a { color:#0b62d6; text-decoration:none; }
  table { border-collapse:collapse; width:100%; margin:10px 0; font-size:14px; }
  th { text-align:left; background:#f6f8fa; font-weight:600; }
  th, td { border:1px solid #e3e5e8; padding:6px 8px; vertical-align:top; }
  hr { border:0; border-top:1px solid #eceef1; margin:24px 0 12px; }
  .foot { color:#8c959f; font-size:12px; text-align:center; margin-top:14px; font-family:Arial,sans-serif; }
</style></head>
<body><div class="wrap"><div class="card">${body}</div>
<div class="foot">Groundswell · catch developer pain before it peaks</div></div></body></html>`;
}

/** First line of the brief ("# Groundswell Friday Brief — …") as the subject. */
function subjectFrom(markdown: string): string {
  const firstHeading = markdown.split("\n").find((l) => l.startsWith("# "));
  return firstHeading ? firstHeading.replace(/^#\s+/, "") : "Groundswell Friday Brief";
}

/** Send a saved brief by id. Never throws: returns { ok, error }. */
export async function sendBriefEmail(briefId: string): Promise<{ ok: boolean; error: string | null; emailId?: string }> {
  const supabase = createServerClient();
  const { data: brief, error: loadError } = await supabase.from("briefs").select("id, markdown").eq("id", briefId).single();
  if (loadError || !brief) return { ok: false, error: `Brief not found: ${loadError?.message}` };

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.BRIEF_TO_EMAIL;
  let result: { ok: boolean; error: string | null; emailId?: string };

  if (!apiKey || !to) {
    result = { ok: false, error: "RESEND_API_KEY or BRIEF_TO_EMAIL is not set" };
  } else {
    const { data, error } = await new Resend(apiKey).emails.send({
      from: FROM,
      to: [to],
      subject: subjectFrom(brief.markdown),
      html: briefEmailHtml(brief.markdown),
      text: brief.markdown, // plain-text fallback
    });
    result = error ? { ok: false, error: `${error.name}: ${error.message}` } : { ok: true, error: null, emailId: data?.id };
  }

  await supabase
    .from("briefs")
    .update(result.ok ? { emailed_at: new Date().toISOString(), email_error: null } : { email_error: result.error })
    .eq("id", briefId);
  return result;
}
