import { createRequire } from "module";
import { fileURLToPath, pathToFileURL } from "url";
import { execFileSync } from "child_process";
import path from "path";
import fs from "fs";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PW_PATH || "/opt/node22/lib/node_modules/playwright");
const FFMPEG = process.env.FFMPEG || "/opt/pw-browsers/ffmpeg-1011/ffmpeg-linux";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const creatives = require("./creatives.js");
const templateURL = pathToFileURL(path.join(__dirname, "animated.html")).href;

// Video formats (kept modest in size; 30s each).
const FORMATS = [
  { name: "story-1080x1920", w: 1080, h: 1920 }, // 9:16 Reels/TikTok/Stories
  { name: "square-1080",     w: 1080, h: 1080 }, // 1:1 feed
  { name: "wide-1920x1080",  w: 1920, h: 1080 }, // 16:9 YouTube
];
const DUR_MS = 26000; // + ~4s load/finalize ≈ 30s final

const outDir = path.join(__dirname, "..", "public", "assets", "ad-videos");
fs.mkdirSync(outDir, { recursive: true });

const onlyCreative = process.argv[2]; // optional id filter
const onlyFormat = process.argv[3];   // optional format filter

const browser = await chromium.launch();
const made = [];
for (const c of creatives) {
  if (onlyCreative && c.id !== onlyCreative) continue;
  const d = encodeURIComponent(JSON.stringify(c));
  for (const f of FORMATS) {
    if (onlyFormat && f.name !== onlyFormat) continue;
    const ctx = await browser.newContext({
      viewport: { width: f.w, height: f.h },
      recordVideo: { dir: outDir, size: { width: f.w, height: f.h } },
    });
    const page = await ctx.newPage();
    await page.goto(`${templateURL}?d=${d}&w=${f.w}&h=${f.h}`, { waitUntil: "networkidle" });
    await page.waitForFunction(() => document.title === "ready");
    await page.waitForTimeout(DUR_MS);
    const video = page.video();
    await ctx.close(); // finalizes the video file
    const tmp = await video.path();
    const mp4 = path.join(outDir, `kwba-${c.id}-${f.name}.mp4`);
    // Transcode WebM(VP8) -> MP4(H.264) for ad-platform compatibility.
    execFileSync(FFMPEG, [
      "-y", "-loglevel", "error", "-i", tmp,
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "veryfast",
      "-crf", "23", "-movflags", "+faststart", mp4,
    ]);
    fs.unlinkSync(tmp);
    made.push(path.relative(path.join(__dirname, ".."), mp4));
    console.log("  ✓ " + path.basename(mp4));
  }
}
await browser.close();
console.log(`Recorded ${made.length} videos.`);
