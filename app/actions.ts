"use server";
// Server Actions: functions the browser can call from a <form>, but which
// run only on the server. Every action that changes data re-checks the
// admin cookie itself; hiding a button in the UI is NOT security.

import { refresh } from "next/cache";
import { z } from "zod";
import { isAdmin, logIn, logOut } from "@/lib/admin";
import { createServerClient } from "@/lib/db/supabase";

export type ActionState = { ok: boolean; message: string } | null;

// ---------------------------------------------------------------------
// Unlock / lock admin features
// ---------------------------------------------------------------------
export async function unlockAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const passcode = String(formData.get("passcode") ?? "");
  if (!(await logIn(passcode))) return { ok: false, message: "Wrong passcode." };
  refresh();
  return { ok: true, message: "Unlocked." };
}

export async function lockAction(): Promise<void> {
  await logOut();
  refresh();
}

// ---------------------------------------------------------------------
// Topics: add / edit / pause. Keywords are typed one per line (or comma separated).
// ---------------------------------------------------------------------
const TopicForm = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2, "Name is too short").max(80, "Name is too long"),
  description: z.string().trim().max(300, "Description is too long"),
  keywords: z
    .array(z.string().trim().min(2, "Each keyword needs at least 2 characters").max(60, "A keyword is too long"))
    .min(1, "Add at least one keyword")
    .max(20, "Use at most 20 keywords"),
  isActive: z.boolean(),
});

function parseKeywords(raw: string): string[] {
  const list = raw.split(/[\n,]/).map((k) => k.trim()).filter(Boolean);
  // Remove duplicates, ignoring upper/lower case.
  return [...new Map(list.map((k) => [k.toLowerCase(), k])).values()];
}

export async function saveTopicAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  if (!(await isAdmin())) return { ok: false, message: "Unlock editing with the admin passcode first." };

  const parsed = TopicForm.safeParse({
    id: formData.get("id") || undefined,
    name: formData.get("name"),
    description: formData.get("description") ?? "",
    keywords: parseKeywords(String(formData.get("keywords") ?? "")),
    isActive: formData.get("isActive") === "on",
  });
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };

  const { id, name, description, keywords, isActive } = parsed.data;
  const row = { name, description: description || null, keywords, is_active: isActive };
  const supabase = createServerClient();
  const { error } = id
    ? await supabase.from("topics").update(row).eq("id", id)
    : await supabase.from("topics").insert(row);

  if (error) {
    const duplicate = error.code === "23505";
    return { ok: false, message: duplicate ? "A topic with this name already exists." : `Could not save: ${error.message}` };
  }
  refresh();
  return { ok: true, message: id ? "Topic saved." : "Topic added. It will be monitored from the next run." };
}

export async function setTopicActiveAction(formData: FormData): Promise<void> {
  if (!(await isAdmin())) return;
  const id = z.string().uuid().safeParse(formData.get("id"));
  if (!id.success) return;
  await createServerClient()
    .from("topics")
    .update({ is_active: formData.get("active") === "true" })
    .eq("id", id.data);
  refresh();
}
