// Database helpers for the "topics" table.

import { createServerClient, type Topic } from "./supabase";

/** Load all active topics (is_active = true), oldest first. */
export async function getActiveTopics(): Promise<Topic[]> {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("topics")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Could not load topics: ${error.message}`);
  return (data ?? []) as Topic[];
}
