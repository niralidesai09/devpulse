// One-off: remove inline evidence keys (e.g. "(P1)") from briefs saved before stripKeys existed.
//   npx tsx --env-file=.env.local scripts/clean-stored-briefs.ts
import { cleanBriefText } from "@/lib/ai/brief";
import { getDb } from "@/lib/db/client";

async function main() {
  const db = getDb();
  const { data, error } = await db.from("reports").select("id, brief").not("brief", "is", null);
  if (error) throw error;
  let changed = 0;
  for (const r of data ?? []) {
    const cleaned = cleanBriefText(r.brief);
    if (JSON.stringify(cleaned) === JSON.stringify(r.brief)) continue;
    const res = await db.from("reports").update({ brief: cleaned }).eq("id", r.id);
    if (res.error) throw res.error;
    changed++;
  }
  console.log(`${data?.length ?? 0} briefs checked, ${changed} cleaned`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
