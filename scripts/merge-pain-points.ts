// One-off/maintenance: run the Stage B2 merge pass over all active pain points.
//   npx tsx --env-file=.env.local scripts/merge-pain-points.ts [--dry-run]
import { proposeMerges } from "@/lib/ai/mergePainPoints";
import { applyMerge, listMergeCandidates } from "@/lib/db/painPoints";

async function main() {
  const dry = process.argv.includes("--dry-run");
  const candidates = await listMergeCandidates();
  const plans = await proposeMerges(candidates);
  const title = new Map(candidates.map((c) => [c.id, `${c.title} (${c.discussions})`]));
  console.log(`${candidates.length} pain points → ${plans.length} merge group(s)${dry ? " [dry run]" : ""}`);
  for (const p of plans) {
    console.log(`\n→ ${p.title}\n   keep:  ${title.get(p.survivorId)}\n   merge: ${p.mergedIds.map((id) => title.get(id)).join("\n          ")}`);
    if (!dry) await applyMerge(p);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
