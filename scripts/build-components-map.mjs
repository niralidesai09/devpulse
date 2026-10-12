// Builds the downloadable Components Map from docs/COMPONENTS_MAP.md:
//   public/groundswell-components-map.md   (copy of the markdown)
//   public/groundswell-components-map.pdf  (branded A4 landscape PDF)
// The PDF is printed by headless Google Chrome. Run: npm run build:map
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { marked } from "marked";

const root = resolve(import.meta.dirname, "..");
const md = readFileSync(join(root, "docs/COMPONENTS_MAP.md"), "utf8");
copyFileSync(join(root, "docs/COMPONENTS_MAP.md"), join(root, "public/groundswell-components-map.md"));

const today = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Groundswell · Components Map</title>
<link href="https://fonts.googleapis.com/css2?family=Libre+Franklin:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,600&family=Source+Code+Pro:wght@400&display=swap" rel="stylesheet">
<style>
  @page { size: A4 landscape; margin: 14mm 14mm 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 9.5pt/1.5 "Libre Franklin", system-ui, sans-serif; color: #1f201c; background: #fff; }
  .band { border-bottom: 2px solid #24603f; padding-bottom: 8pt; margin-bottom: 12pt; display: flex; justify-content: space-between; align-items: flex-end; }
  .band .kicker { font: 500 8pt "Libre Franklin"; letter-spacing: .08em; text-transform: uppercase; color: #24603f; }
  .band .date { font-size: 8pt; color: #66665d; }
  h1 { font: 600 22pt/1.15 "Source Serif 4", Georgia, serif; letter-spacing: -.015em; margin: 2pt 0 0; }
  h2 { break-after: avoid; font: 600 14pt/1.3 "Source Serif 4", Georgia, serif; margin: 16pt 0 6pt; padding-top: 8pt; border-top: 1px solid #dcd7cb; }
  h2 + h3, h3 + table { break-before: avoid; }
  h3 { font: 600 10.5pt/1.3 "Libre Franklin"; margin: 12pt 0 4pt; color: #24603f; break-after: avoid; }
  p { margin: 0 0 5pt; max-width: 200mm; color: #45463f; }
  a { color: #24603f; text-decoration: none; }
  strong { color: #1f201c; }
  code { font: 8pt "Source Code Pro", ui-monospace, monospace; background: #f6f4ee; padding: 0 2pt; border-radius: 2px; }
  pre { background: #f6f4ee; border: 1px solid #dcd7cb; border-radius: 4px; padding: 8pt 10pt; font: 8pt/1.45 "Source Code Pro", monospace; break-inside: avoid; white-space: pre; }
  pre code { background: none; padding: 0; }
  table { width: 100%; border-collapse: collapse; margin: 0 0 6pt; break-inside: auto; }
  tr { break-inside: avoid; }
  th { text-align: left; font-weight: 600; font-size: 8pt; color: #45463f; border-bottom: 1.5px solid #c8c2b3; padding: 4pt 6pt 4pt 0; }
  td { vertical-align: top; border-bottom: 1px solid #e6e1d6; padding: 4pt 8pt 4pt 0; }
  td:first-child { font-weight: 600; width: 17%; }
  td:nth-child(2) { width: 22%; }
  td:last-child { width: 16%; color: #45463f; }
  td code { word-break: break-word; }
  .foot { margin-top: 14pt; padding-top: 6pt; border-top: 1px solid #dcd7cb; font-size: 7.5pt; color: #66665d; }
</style></head><body>
<div class="band"><div><div class="kicker">Groundswell · Catch developer pain before it peaks</div></div><div class="date">Components Map · ${today}</div></div>
${marked.parse(md).replace("<h2>Components</h2>", '<h2 style="break-before: page">Components</h2>')}
<p class="foot">All AI tasks use Google Gemini Flash via @google/genai. Live data only. Topics and keywords are stored in Supabase. Deployed on Vercel with a Friday 08:00 IST cron.</p>
</body></html>`;

const dir = mkdtempSync(join(tmpdir(), "gs-map-"));
const htmlPath = join(dir, "map.html");
writeFileSync(htmlPath, html);
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
execFileSync(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-pdf-header-footer",
  "--virtual-time-budget=8000",
  `--print-to-pdf=${join(root, "public/groundswell-components-map.pdf")}`,
  `file://${htmlPath}`,
], { stdio: "ignore" });
console.log("Wrote public/groundswell-components-map.pdf and .md");
