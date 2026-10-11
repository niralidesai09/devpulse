// Live tests: hit REAL external APIs (HN, GitHub, Stack Exchange, DEV, Gemini)
// and, when SUPABASE_DB_URL is set, the real database. Opt-in: npm run test:live
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["tests/live/**/*.test.ts"], setupFiles: ["tests/live/setup.ts"], environment: "node", testTimeout: 240_000, hookTimeout: 240_000, fileParallelism: false },
});
