# KWBA V9 — Status & What's Next

## What this build contains

### ✓ Completed in V9

**Homepage** — `index.html`
- White+gold theme: `#fafaf7` body, `#b08a2e` editorial gold, `#1a1814` ink text
- Inter Tight (display) + Inter (body) typography
- Parallax engine running on `/assets/parallax.js`
- Stripe/Linear-tier layout polish (full V7 component system)
- All hero stats, services, pricing, work, testimonials, insights, CTA sections present
- Logo: KWBA horizontal lockup SVG in nav + footer

**Parallax engine v3** — `/assets/parallax.js`
- LERP-smoothed scroll position (0.14 smoothing factor)
- Velocity sensing — orbs subtly scale on fast scrolls (cinematic depth cue)
- Hero scale-down on scroll (depth)
- Idle detection — stops RAF loop when no scroll for >1s (battery friendly)
- Hardware-aware: disables on low-RAM devices, Save-Data, prefers-reduced-motion
- Re-caches on font swap and window resize
- Mouse-tracked card glow (RAF-throttled, desktop only)

**Brand assets** — `/assets/brand/`
- Regenerated in Inter Tight at light-theme deep gold (`#b08a2e`)
- 3 primary stacked monograms (gold / ink / cream)
- 3 horizontal lockups (gold / ink / cream)
- 2 secondary K marks (gold / cream)
- All have matching PNG exports at 512px or 960px

**Favicons + apple-touch-icon** — regenerated on cream backgrounds with deep gold glyphs

**OG image** — regenerated in light theme (cream bg, gold accents)

**Agent V2 infrastructure** — fully wired (from V6, untouched here)
- 26 specialist agents with RAG memory, function-calling tools, validation retry, PII safety scrub, full telemetry
- Mounted at `/agent-v2/*` alongside the legacy `/stream-agent`
- Admin OS has the V2 toggle and telemetry dashboard

### ⏳ Outstanding — needs migration to white+gold

These pages still use **dark theme** and need migration to match the new homepage:

- `login.html` — single-purpose page, just needs token swap
- `404.html` — already has parallax, needs theme flip
- `blog.html` — index page, needs full restyle
- `blog/affordable-website-uk-sme.html` — article, dark editorial style
- `blog/seo-basics-small-business-uk.html` — article, dark
- `blog/fast-website-turnaround.html` — article, dark
- `blog/web-design-milton-keynes.html` — article, dark
- `marketing.html` — needs full V7-style rebuild
- `brief.html` — needs theme flip AND accessibility fix (22 unlabeled inputs)
- `marketing-brief.html` — same as brief.html
- `chatbot-demo.html` — needs theme flip
- `package-explainer.html` — needs theme flip

### ⛔ Deliberately staying dark

The admin/operator surfaces stay on the dark theme. Industry convention: Linear, Stripe, Notion all have light marketing sites + dark application surfaces because operators work in these for hours and dark reduces eye strain.

- `admin.html` (the 26-agent OS)
- `portal.html`
- `intake.html`
- `prospector.html`
- `client.html`
- `admin_backup.html` / `admin-new-logic.html`

## How to finish the migration

The shared design tokens are defined inline at the top of `index.html`. To migrate any of the outstanding pages:

1. Replace its inline `:root{}` block with the homepage's white+gold tokens
2. Swap font-family from Cormorant Garamond / Lora to Inter Tight + Inter
3. Replace `--bg:#0f0e0c` and similar dark values with the light palette
4. Update nav and footer to use `/assets/brand/lockup-horizontal-gold.svg` instead of text
5. For brief.html and marketing-brief.html: also add `<label for>` to every input

A shared `/assets/kwba.css` was started but not finished — that's the architectural fix that would let every page import the tokens with one line. Recommended for the next round.

## Deploy notes

- Render env vars unchanged from V8
- `FRONTEND_URL=https://kwba-agency.com` still required for CORS
- `GEMINI_API_KEY` required for AI features
- Optional: `GOOGLE_CSE_KEY`, `GOOGLE_CSE_ID`, `COMPANIES_HOUSE_KEY` unlock V2 tools
- pgvector extension on Postgres still optional (V2 has TEXT fallback)

## Files of note

- `AGENT-V2-README.md` — full V2 deployment guide
- `AI-AGENTS-REPORT.md` — 258-line honest agent-stack benchmark
- `FRONTEND-REPORT.md` — 315-line measured frontend audit
- `AUDIT-NOTES.md` / `AUDIT-REPORT.txt` — static route/asset integrity audit
- `diagnostic.html` — drop-in browser tool to verify live deploy health
