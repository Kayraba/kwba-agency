# KWBA Ads — How to Use

30 self-running HTML ads, organised by platform.

## Folder structure

```
ads/
├── _shared/           # Shared engine — DON'T edit per-ad
│   ├── engine.css     # Design tokens + animations
│   ├── engine.js      # Scene sequencer
│   └── scenes-*.html  # Scene markup for each of the 5 ads
├── tiktok/            # 9:16 vertical · 1080×1920
├── instagram-reels/   # 9:16 vertical · 1080×1920
├── instagram-feed/    # 1:1 square · 1080×1080
├── facebook/          # 1:1 square · 1080×1080
├── linkedin/          # 16:9 horizontal · 1920×1080
├── youtube/           # 16:9 horizontal · 1920×1080
└── index.html         # Gallery — browse all 30 ads
```

Each platform folder contains:
- `ratio.css` — locks the stage to the platform's aspect ratio
- `01-brand.html` — agency sizzle reel (22s)
- `02-web-design.html` — web design focus (18s)
- `03-ai-chatbot.html` — AI receptionist demo (20s)
- `04-trades.html` — plumbers/gas engineers/trades niche (18s)
- `05-clinics.html` — dentists/salons/clinics niche (18s)

## To view

Open `ads/index.html` in any browser. The gallery has every ad with a preview card. Click any card → the ad auto-plays in a clean window. A subtle progress bar runs along the bottom. When it ends, a small ▷ Replay button appears in the corner.

## To record as MP4 (the actual ad video)

### Method 1 — Loom (fastest, no install for Chrome users)
1. Open the ad HTML file in Chrome (drag-and-drop, or `open` from terminal)
2. Resize the window to the platform aspect ratio (rough is fine; trim later)
3. Loom → record current tab → start
4. The ad auto-plays. When the progress bar hits the end, stop recording.
5. Loom gives you a downloadable MP4.

### Method 2 — OBS (highest quality, native resolution)
1. In OBS, add a **Browser Source** pointed at the ad HTML file (use `file://` URL).
2. Set Width × Height to the platform's exact pixels:
   - TikTok / Insta Reels: **1080 × 1920**
   - Instagram Feed / Facebook: **1080 × 1080**
   - LinkedIn / YouTube: **1920 × 1080**
3. Start Recording. The ad auto-plays on browser source mount.
4. Wait for the progress bar to complete, stop.
5. Output is a clean MP4 at native resolution.

### Method 3 — Chrome DevTools Recorder (built-in, no install)
1. Open the ad in Chrome
2. DevTools → 3-dot menu → More tools → **Recorder** → start
3. Wait for the ad to finish
4. Export → save as MP4

### Method 4 — QuickTime Mac (built-in)
1. QuickTime → File → New Screen Recording
2. Drag the recording area over the ad in your browser
3. Start, wait for the ad to finish, stop
4. Crop in QuickTime's edit menu before export

## To edit any ad

Every ad's content is in `_shared/scenes-XX-*.html`. Edit one of those files — all 6 platform versions of that ad update automatically (they all import from the same scene file).

To change colours, fonts, or animation timing site-wide, edit `_shared/engine.css`.
To change scene order or timing logic, edit `_shared/engine.js`.

## Customisation per platform

If you want a specific ad to behave differently on (e.g.) LinkedIn than TikTok, copy the scene markup directly into that platform's HTML file (rather than importing from `_shared/`). Then edit it freely.

## A note on what these are not

These aren't pre-rendered MP4 videos — they're HTML that *plays like* video when opened in a browser. The advantage: you can edit any text, colour, or animation in 30 seconds without touching a video editor. The trade-off: you have to screen-record once to get a shareable MP4.

Most social platforms accept MP4 at 1080p H.264 with AAC audio. The recordings from any of the methods above will work.

## Audio

The ads are silent by design. Add music in a video editor after recording — most stock platforms (Epidemic Sound, Artlist, free YouTube audio library) have 15–25s tracks that fit perfectly. Recommended vibe: minimal piano + soft synth swell, similar to what Linear / Stripe / Apple use.
