"use server";

// All mutations. Every action:
//   1. checks the admin session on the server (requireAdmin),
//   2. validates input with Zod,
//   3. returns a user-readable result instead of throwing raw errors,
//   4. refreshes the affected pages.

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { checkPasscode, isAdminConfigured, newSessionCookie, requireAdmin, SESSION_COOKIE, UnauthorizedError } from "@/lib/auth";
import {
  addKeywords,
  createTopic,
  deleteKeyword,
  deleteTopicIfUnused,
  setSourceEnabled,
  setTopicArchived,
  updateKeyword,
  updateTopic,
  UserError,
} from "@/lib/db/config";
import { setExcluded } from "@/lib/db/discussions";
import { addDecision } from "@/lib/db/painPoints";
import { errorMessage, logger } from "@/lib/log";

export type ActionResult = { ok: boolean; message: string } | null;

const log = logger({ area: "actions" });

async function guarded(name: string, fn: () => Promise<string>): Promise<ActionResult> {
  try {
    await requireAdmin();
    const message = await fn();
    return { ok: true, message };
  } catch (err) {
    if (err instanceof UnauthorizedError || err instanceof UserError || err instanceof z.ZodError) {
      const message = err instanceof z.ZodError ? err.issues.map((i) => i.message).join(" ") : err.message;
      return { ok: false, message };
    }
    log.error("action.failed", { action: name, error: errorMessage(err) });
    return { ok: false, message: `Could not save: ${errorMessage(err)}` };
  }
}

// ---------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------

export async function login(_prev: ActionResult, form: FormData): Promise<ActionResult> {
  if (!isAdminConfigured()) return { ok: false, message: "Admin access is not configured on this deployment (ADMIN_PASSCODE missing)." };
  const passcode = String(form.get("passcode") ?? "");
  // Small fixed delay slows down guessing.
  await new Promise((r) => setTimeout(r, 400));
  if (!checkPasscode(passcode)) return { ok: false, message: "That passcode is not correct." };
  const c = newSessionCookie();
  (await cookies()).set(c.name, c.value, c.options);
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function logout() {
  (await cookies()).delete(SESSION_COOKIE);
  revalidatePath("/", "layout");
}

// ---------------------------------------------------------------------
// Topics & keywords
// ---------------------------------------------------------------------

const keywordSchema = z
  .string()
  .trim()
  .min(2, "Keywords need at least 2 characters.")
  .max(80, "Keywords can be at most 80 characters.")
  .regex(/^[^<>"]+$/, "Keywords cannot contain <, > or double quotes.");

const nameSchema = z.string().trim().min(2, "Topic names need at least 2 characters.").max(80, "Topic names can be at most 80 characters.");

/** "a, b\nc" → ["a","b","c"], de-duplicated case-insensitively. */
function parseKeywordList(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[,\n]/)) {
    const k = part.trim().replace(/\s+/g, " ");
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(keywordSchema.parse(k));
  }
  return out;
}

function refreshConfigPages() {
  revalidatePath("/topics");
  revalidatePath("/health");
  revalidatePath("/", "layout");
}

export async function createTopicAction(_prev: ActionResult, form: FormData) {
  return guarded("createTopic", async () => {
    const name = nameSchema.parse(form.get("name"));
    const description = z.string().trim().max(300, "Description can be at most 300 characters.").parse(form.get("description") ?? "");
    const keywords = parseKeywordList(String(form.get("keywords") ?? ""));
    if (!keywords.length) throw new UserError("Add at least one keyword so the topic can be monitored.");
    await createTopic({ name, description: description || null, keywords });
    refreshConfigPages();
    return `Created “${name}” with ${keywords.length} keyword${keywords.length === 1 ? "" : "s"}. The next collection will include it.`;
  });
}

export async function updateTopicAction(_prev: ActionResult, form: FormData) {
  return guarded("updateTopic", async () => {
    const id = z.string().uuid().parse(form.get("id"));
    const name = nameSchema.parse(form.get("name"));
    const description = z.string().trim().max(300).parse(form.get("description") ?? "");
    await updateTopic(id, { name, description: description || null });
    refreshConfigPages();
    return "Topic saved.";
  });
}

export async function setTopicActiveAction(id: string, active: boolean) {
  return guarded("setTopicActive", async () => {
    await updateTopic(z.string().uuid().parse(id), { is_active: active });
    refreshConfigPages();
    return active ? "Topic enabled for the next run." : "Topic paused. Existing data is kept.";
  });
}

export async function archiveTopicAction(id: string, archived: boolean) {
  return guarded("archiveTopic", async () => {
    await setTopicArchived(z.string().uuid().parse(id), archived);
    refreshConfigPages();
    return archived ? "Topic archived. History is kept; it is no longer monitored." : "Topic restored (paused — enable it to monitor again).";
  });
}

export async function deleteTopicAction(id: string) {
  return guarded("deleteTopic", async () => {
    await deleteTopicIfUnused(z.string().uuid().parse(id));
    refreshConfigPages();
    return "Topic deleted.";
  });
}

export async function addKeywordsAction(_prev: ActionResult, form: FormData) {
  return guarded("addKeywords", async () => {
    const topicId = z.string().uuid().parse(form.get("topicId"));
    const keywords = parseKeywordList(String(form.get("keywords") ?? ""));
    if (!keywords.length) throw new UserError("Type at least one keyword.");
    await addKeywords(topicId, keywords);
    refreshConfigPages();
    return `Added ${keywords.length} keyword${keywords.length === 1 ? "" : "s"}.`;
  });
}

export async function renameKeywordAction(id: string, keyword: string) {
  return guarded("renameKeyword", async () => {
    await updateKeyword(z.string().uuid().parse(id), { keyword: keywordSchema.parse(keyword) });
    refreshConfigPages();
    return "Keyword updated.";
  });
}

export async function toggleKeywordAction(id: string, active: boolean) {
  return guarded("toggleKeyword", async () => {
    await updateKeyword(z.string().uuid().parse(id), { is_active: active });
    refreshConfigPages();
    return active ? "Keyword enabled." : "Keyword paused.";
  });
}

export async function deleteKeywordAction(id: string) {
  return guarded("deleteKeyword", async () => {
    await deleteKeyword(z.string().uuid().parse(id));
    refreshConfigPages();
    return "Keyword removed. Discussions it already found are kept.";
  });
}

export async function setSourceEnabledAction(id: string, enabled: boolean) {
  return guarded("setSourceEnabled", async () => {
    await setSourceEnabled(z.enum(["hackernews", "github", "stackoverflow", "devto"]).parse(id), enabled);
    refreshConfigPages();
    return enabled ? "Source enabled for the next run." : "Source disabled for the next run.";
  });
}

// ---------------------------------------------------------------------
// Curation & decisions
// ---------------------------------------------------------------------

export async function setExcludedAction(id: string, excluded: boolean, reason: string) {
  return guarded("setExcluded", async () => {
    const r = z.string().trim().max(200).parse(reason);
    await setExcluded(z.string().uuid().parse(id), excluded, r || null);
    revalidatePath("/discussions");
    revalidatePath(`/discussions/${id}`);
    revalidatePath("/pain-points");
    return excluded
      ? "Excluded. It no longer counts in metrics; the next generated report reflects this."
      : "Included again in metrics.";
  });
}

export async function addDecisionAction(_prev: ActionResult, form: FormData) {
  return guarded("addDecision", async () => {
    const painPointId = z.string().uuid().parse(form.get("painPointId"));
    const decision = z.enum(["investigate", "validate", "backlog", "monitor", "dismiss"], { message: "Choose a decision." }).parse(form.get("decision"));
    const rationale = z.string().trim().max(1000, "Keep the rationale under 1000 characters.").parse(form.get("rationale") ?? "");
    const reportId = form.get("reportId") ? z.string().uuid().parse(form.get("reportId")) : null;
    await addDecision({ painPointId, decision, rationale: rationale || null, reportId });
    revalidatePath(`/pain-points/${painPointId}`);
    revalidatePath("/pain-points");
    revalidatePath("/opportunities", "layout");
    return "Decision recorded.";
  });
}
