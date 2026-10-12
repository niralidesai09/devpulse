// POST /api/ask  { "question": "..." }  -> "Ask the Pulse" answer with citations.
// Public (so the dashboard and examiners can try it), but guarded:
//   - question must be 3-300 characters
//   - max 8 questions per minute per visitor (simple in-memory limit; it
//     resets when Vercel starts a fresh instance, which is fine for a demo)

import { z } from "zod";
import { askThePulse } from "@/lib/ai/ask";

export const maxDuration = 60;

const Body = z.object({ question: z.string().trim().min(3, "Ask a slightly longer question.").max(300, "Keep it under 300 characters.") });

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 8;
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > MAX_PER_WINDOW;
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "local";
  if (rateLimited(ip)) return Response.json({ error: "Too many questions. Wait a minute and try again." }, { status: 429 });

  const parsed = Body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0].message }, { status: 400 });

  try {
    return Response.json(await askThePulse(parsed.data.question));
  } catch (err) {
    console.error("ask failed", err);
    return Response.json({ error: "Something went wrong answering that. Please try again." }, { status: 500 });
  }
}
