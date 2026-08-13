import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "/opt/node22/lib/node_modules/playwright");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const creatives = require("./creatives.js");
const SIZES = creatives.SIZES;
const templateURL = pathToFileURL(path.join(__dirname, "template.html")).href;

const outDir = path.join(__dirname, "..", "public", "assets", "ads");
fs.mkdirSync(outDir, { recursive: true });

// Optional filters: node render.mjs [creativeId] [sizeName]
const onlyCreative = process.argv[2];
const onlySize = process.argv[3];

const browser = await chromium.launch();
let count = 0;
const made = [];
for (const c of creatives) {
  if (onlyCreative && c.id !== onlyCreative) continue;
  const d = encodeURIComponent(JSON.stringify(c));
  for (const s of SIZES) {
    if (onlySize && s.name !== onlySize) continue;
    const page = await browser.newPage({ viewport: { width: s.w, height: s.h }, deviceScaleFactor: 1 });
    await page.goto(`${templateURL}?d=${d}&w=${s.w}&h=${s.h}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.title === "ready");
    const file = path.join(outDir, `kwba-${c.id}-${s.name}.png`);
    await page.screenshot({ path: file, clip: { x: 0, y: 0, width: s.w, height: s.h } });
    await page.close();
    count++;
    made.push(path.relative(path.join(__dirname, ".."), file));
  }
}
await browser.close();
console.log(`Rendered ${count} PNGs ->`);
made.forEach(f => console.log("  " + f));
