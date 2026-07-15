import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "/opt/node22/lib/node_modules/playwright");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const adsDir = path.join(__dirname, "..", "public", "assets", "ads");
const files = fs.readdirSync(adsDir).filter(f => f.endsWith(".png") && f !== "contact-sheet.png").sort();

const cards = files.map(f => {
  const b64 = fs.readFileSync(path.join(adsDir, f)).toString("base64");
  return `<figure><img src="data:image/png;base64,${b64}"/><figcaption>${f.replace("kwba-","").replace(".png","")}</figcaption></figure>`;
}).join("");

const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body{margin:0;background:#201c18;color:#fffdf8;font-family:Arial,sans-serif;padding:40px}
  h1{font-size:34px;margin:0 0 6px}h1 b{color:#d4a84c}
  p{color:#a89e8c;margin:0 0 30px}
  .grid{display:grid;grid-template-columns:repeat(5,1fr);gap:18px}
  figure{margin:0;background:#2d2820;border:1px solid rgba(212,168,76,.2);border-radius:10px;overflow:hidden;display:flex;flex-direction:column}
  img{width:100%;height:180px;object-fit:contain;background:#15120e}
  figcaption{font-size:11px;color:#c9bfa8;padding:8px;text-align:center;word-break:break-word}
</style></head><body>
  <h1>KWBA — <b>30 ad creatives</b></h1>
  <p>6 angles × 5 platform sizes · rendered with Playwright from live site copy</p>
  <div class="grid">${cards}</div>
</body></html>`;

const out = path.join(adsDir, "_contact-sheet.html");
fs.writeFileSync(out, html);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1500, height: 1400 } });
await page.goto(pathToFileURL(out).href, { waitUntil: "networkidle" });
await page.screenshot({ path: path.join(adsDir, "_contact-sheet.png"), fullPage: true });
await browser.close();
console.log("contact sheet ->", path.relative(path.join(__dirname,".."), path.join(adsDir,"_contact-sheet.png")));
