// GET /api/health — which integrations are configured (booleans only, never values)
// and whether the database answers. Safe to expose publicly.

import { connection } from "next/server";
import { getModel, isGeminiConfigured } from "@/lib/ai/gemini";
import { isAdminConfigured } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import { isEmailConfigured } from "@/lib/email/sendBrief";
import { errorMessage } from "@/lib/log";

export async function GET() {
  await connection();
  let database: { ok: boolean; error?: string } = { ok: false };
  try {
    const { error } = await getDb().from("sources").select("id", { head: true, count: "exact" });
    database = error ? { ok: false, error: error.message } : { ok: true };
  } catch (err) {
    database = { ok: false, error: errorMessage(err) };
  }
  let model: string | null = null;
  try {
    model = isGeminiConfigured() ? getModel() : null;
  } catch {
    model = "invalid (must be a Gemini Flash model)";
  }
  return Response.json({
    database,
    gemini: { configured: isGeminiConfigured(), model },
    github: { configured: Boolean(process.env.GITHUB_TOKEN) },
    email: { configured: isEmailConfigured() },
    admin: { configured: isAdminConfigured() },
    cron: { secretConfigured: Boolean(process.env.CRON_SECRET) },
  });
}
