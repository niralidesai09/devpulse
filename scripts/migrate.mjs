// Applies supabase/migrations/*.sql in filename order, each in its own
// transaction, and records what ran in meta.schema_migrations.
//
//   npm run db:migrate            apply pending migrations
//   npm run db:migrate -- --status   list applied / pending, change nothing
//
// Needs SUPABASE_DB_URL (Supabase → Connect → Session pooler URI).
// Reads .env.local when present. Never prints the connection string.

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const DIR = join(process.cwd(), "supabase", "migrations");

// Minimal .env.local loader (no dependency): KEY=value lines only.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL is not set. Add it to .env.local (Supabase → Connect → Session pooler).");
  process.exit(1);
}

const statusOnly = process.argv.includes("--status");
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`
  create schema if not exists meta;
  revoke all on schema meta from anon, authenticated;
  create table if not exists meta.schema_migrations (
    name text primary key,
    applied_at timestamptz not null default now()
  );`);

// 0001/0002 were applied through the Supabase MCP before this runner
// existed. If their tables are present, record them as applied (baseline).
const { rows: baseline } = await client.query(
  `select to_regclass('public.topics') is not null as has_topics,
          (select count(*) from meta.schema_migrations)::int as recorded`,
);
if (baseline[0].has_topics && baseline[0].recorded === 0) {
  await client.query(
    `insert into meta.schema_migrations (name) values ('0001_initial_schema.sql'), ('0002_seed_starter_topics.sql')
     on conflict do nothing`,
  );
  console.log("Baseline: recorded 0001 and 0002 as already applied.");
}

const applied = new Set((await client.query("select name from meta.schema_migrations")).rows.map((r) => r.name));
const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();

let failed = false;
for (const file of files) {
  if (applied.has(file)) {
    if (statusOnly) console.log(`applied  ${file}`);
    continue;
  }
  if (statusOnly) {
    console.log(`PENDING  ${file}`);
    continue;
  }
  const sql = readFileSync(join(DIR, file), "utf8");
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into meta.schema_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`applied  ${file}`);
  } catch (err) {
    await client.query("rollback");
    console.error(`FAILED   ${file}: ${err.message}`);
    failed = true;
    break;
  }
}

// Tell PostgREST (the Supabase REST API) to pick up new tables/columns.
if (!statusOnly) await client.query("notify pgrst, 'reload schema'");

await client.end();
process.exit(failed ? 1 : 0);
