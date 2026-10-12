// Builds the downloadable Components Map (a swimlane poster):
//   source  scripts/components-map.html
//   output  public/groundswell-components-map.pdf  (one tall page)
//           public/groundswell-components-map.png  (same, as an image)
//           public/groundswell-components-map.md   (detailed table version, from docs/COMPONENTS_MAP.md)
// Printed by headless Google Chrome. Run: npm run build:map
import { execFileSync } from "node:child_process";
import { copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const src = `file://${join(root, "scripts/components-map.html")}`;
const out = (ext) => join(root, `public/groundswell-components-map.${ext}`);
const chrome = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const base = ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--virtual-time-budget=10000"];
const run = (args) => execFileSync(chrome, [...base, ...args, src], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

// 1. Measure the poster height (the page writes it to <body data-height>).
const height = Number(/data-height="(\d+)"/.exec(run(["--window-size=1600,1200", "--dump-dom"]))?.[1] ?? 2200);
// 2. PDF (page size set by the page itself) and a full-length PNG at 2x.
run(["--no-pdf-header-footer", `--print-to-pdf=${out("pdf")}`]);
run([`--window-size=1600,${height}`, "--force-device-scale-factor=2", `--screenshot=${out("png")}`]);
copyFileSync(join(root, "docs/COMPONENTS_MAP.md"), out("md"));
console.log(`Wrote public/groundswell-components-map.{pdf,png,md} (1600 × ${height}px)`);
