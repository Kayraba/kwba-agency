# KWBA Agency — Full Platform

UK digital marketing agency platform built around four integrated products: marketing website, lead intelligence platform (prospector), AI receptionist (chatbot product sold to clients), and admin dashboard.

**Live at:** https://kwba-agency.onrender.com

## What's in this repo?

See [STRUCTURE.md](./STRUCTURE.md) for the full breakdown of which file does what.

**Quick summary:**

-  **Website** (`index.html`, `marketing.html`, `package-explainer.html` etc.) — public-facing marketing site
-  **Prospector** (`prospector.html`) — internal lead-finding tool using Google Places API
-  **AI Receptionist** (`chatbot-demo.html`, `chatbot-widget.js`) — multi-tenant chatbot product sold to clients
-  **Admin** (`admin.html`, `client.html`, `portal.html`) — internal team dashboard
-  **Backend** (`server.js`) — single Node/Express server that powers all of the above

## Deployment

One Render service handles everything. Push to GitHub `main` branch → Render auto-deploys.

Required environment variables (set in Render → Environment):
- `DATABASE_URL` (auto-set by Render Postgres)
- `JWT_SECRET` (any long random string)
- `GEMINI_API_KEY` (from aistudio.google.com/apikey)
- `GOOGLE_PLACES_KEY` (from console.cloud.google.com)
- `NODE_ENV=production`

## URLs

- Homepage: `/`
- Marketing/Pricing: `/marketing.html`
- Lead Prospector: `/prospector.html` (login required)
- Chatbot Creator: `/chatbot-demo.html` (login required)
- Admin Dashboard: `/admin.html` (login required)
- Chatbot Widget Source: `/chatbot-widget.js` (public — clients embed this)

## Three Pricing Tiers

| Tier | Price | What's included |
|---|---|---|
| AI Receptionist | £499/mo | Chatbot, missed-call text-back, review automation |
| AI Lead Engine | £1,299/mo | Above + Google Ads, landing pages, 5-day follow-up sequences |
| AI Growth System | £2,499/mo | Above + retargeting, full SEO, dedicated account manager |

Standalone chatbot setup: £299 one-off (or included in any retainer)

## Parallax / Scroll Effects (Public Pages)

The public marketing pages (`index.html`, `marketing.html`, `blog.html`, `brief.html`, `marketing-brief.html`, `package-explainer.html`, `404.html`) use a shared parallax layer.

**Two files**, both in `/assets/`:

- **`parallax.css`** — global background layers, scroll-progress bar styles, watermark words, reveal-on-scroll utility classes (`.reveal-item`, `.delay-1`–`.delay-5`)
- **`parallax.js`** — auto-runs on DOMContentLoaded; handles scroll-driven translate of any element with `data-speed`, fades any element with `data-fade`, runs the IntersectionObserver for `.reveal-item`s, and adds mouse-tracked hover glow on cards

**To add parallax to a new page**, drop these three things in:

```html
<link rel="stylesheet" href="/assets/parallax.css"/>  <!-- in <head> -->

<!-- right after <body> -->
<div class="scroll-progress" id="sp"></div>
<div class="bg-parallax" aria-hidden="true">
  <div class="bg-layer bg-l1" data-speed="0.15"></div>
  <div class="bg-layer bg-l2" data-speed="0.25"></div>
  <div class="bg-layer bg-l3" data-speed="0.18"></div>
  <div class="bg-layer bg-l4" data-speed="0.22"></div>
  <div class="bg-layer bg-l5" data-speed="0.16"></div>
</div>
<div class="bg-grid" aria-hidden="true"></div>

<script src="/assets/parallax.js"></script>  <!-- before </body> -->
```

Add `data-speed="0.15"` (any number from 0.05–0.5) to any element you want to drift while scrolling. Add `class="reveal-item"` (optionally with `delay-1` to `delay-5`) to any element you want to slide-up + fade in when it enters the viewport. Respects `prefers-reduced-motion`.

The admin/internal tools (`admin.html`, `prospector.html`, `chatbot-demo.html` etc.) deliberately do NOT include parallax — they're tools, not marketing pages, and the effects would just slow them down.

