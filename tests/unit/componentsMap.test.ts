// The Components Map must match the implementation, not an aspiration.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MAP_ROUTES, MAP_TABLES } from "@/lib/componentsMap";

const root = join(__dirname, "..", "..");
const migrations = readdirSync(join(root, "supabase/migrations"))
  .map((f) => readFileSync(join(root, "supabase/migrations", f), "utf8"))
  .join("\n");

describe("components map", () => {
  it.each(MAP_TABLES)("table %s is created by a migration", (t) => {
    expect(migrations).toMatch(new RegExp(`create table (if not exists )?public\\.${t}\\b`));
  });
  it.each(MAP_ROUTES)("route %s exists", (r) => {
    expect(existsSync(join(root, r))).toBe(true);
  });
  it("vercel.json schedules the cron route shown on the map", () => {
    const v = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8"));
    expect(v.crons).toEqual([{ path: "/api/cron/weekly", schedule: "30 2 * * 5" }]);
  });
  it("the shipped code never calls the Anthropic/Claude API", () => {
    const pkg = readFileSync(join(root, "package.json"), "utf8");
    expect(pkg).not.toMatch(/@anthropic-ai|anthropic/i);
  });
});

describe("docs/COMPONENTS_MAP.md", () => {
  it("contains exactly the diagram the app renders", async () => {
    const { COMPONENTS_MAP } = await import("@/lib/componentsMap");
    const doc = readFileSync(join(root, "docs/COMPONENTS_MAP.md"), "utf8");
    expect(doc).toContain(COMPONENTS_MAP.trimEnd());
  });
});
