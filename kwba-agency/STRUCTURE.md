# KWBA Agency — File Structure

Everything in this repo is **one Render deployment** at `kwba-agency.onrender.com`. But functionally, it's **four products** sharing one backend. This doc tells you which file does what.

---

## Product 1 — Public Marketing Website

The public-facing site that prospects visit. Sells your services, explains packages, captures briefs.

| File | What it is |
|---|---|
| `index.html` | Homepage — hero, three core services (Web Design, Marketing, AI Chatbot), social proof, CTA |
| `marketing.html` | Marketing services page with niche-specific packages (8 niches × 3 tiers) |
| `package-explainer.html` | Slideshow that walks through the three retainer tiers |
| `brief.html` | Generic brief intake form for new prospects |
| `marketing-brief.html` | Marketing-specific intake form |
| `intake.html` | Existing client intake form |
| `blog.html` + `blog/` | Blog index + posts |
| `404.html` | Error page |

**Public URL pattern:** `kwba-agency.onrender.com/marketing.html` etc.

---

## Product 2 — Lead Intelligence Platform (Prospector)

Internal tool for finding new leads via Google Maps API. Real-time search, gap scoring, AI audit, outreach sequence generation.

| File | What it is |
|---|---|
| `prospector.html` | The full platform — niche+city search, gap scoring, audit, agent recommendations, outreach queue |

**Public URL:** `kwba-agency.onrender.com/prospector.html`
**Login required:** Yes (uses KWBA admin credentials)
**Backend endpoints used:**
- `POST /login`
- `POST /api/places-search` — Google Places API proxy
- `POST /public-audit` — Gemini-streamed AI audit
- `POST /api/outreach` — save outreach sequences
- `GET /api/outreach` — list outreach queue
- `PATCH /api/outreach/:id` — mark sent/skip/done

**Required env vars:** `GOOGLE_PLACES_KEY`, `GEMINI_API_KEY`, `JWT_SECRET`, `DATABASE_URL`

---

## Product 3 — AI Receptionist (Chatbot)

The product you SELL to clients. Each client gets their own slug + knowledge base. Real LLM conversation, captures leads to KWBA admin.

| File | What it is |
|---|---|
| `chatbot-demo.html` | Internal interface — create new chatbots, edit existing, copy embed codes, preview live |
| `chatbot-widget.js` | The embeddable widget that clients paste into their website |

**Public URLs:**
- Internal management: `kwba-agency.onrender.com/chatbot-demo.html` (login required)
- Embed source: `kwba-agency.onrender.com/chatbot-widget.js` (public — clients reference it)

**Backend endpoints used:**
- `GET /api/chatbot/:slug` — public config fetch (widget loads this on boot)
- `POST /api/chatbot/:slug/chat` — public chat endpoint (Gemini-powered)
- `POST /api/chatbot/:slug/lead` — public lead capture
- `GET /api/chatbots` — admin list (login required)
- `POST /api/chatbots` — admin create (login required)
- `GET /api/chatbots/:slug` — admin fetch full config (login required)
- `PATCH /api/chatbots/:slug` — admin update (login required)
- `DELETE /api/chatbots/:slug` — admin delete (login required)
- `GET /api/chatbots/:slug/conversations` — admin view chat history (login required)

**Database tables:** `chatbots`, `chatbot_conversations`

**Required env vars:** `GEMINI_API_KEY` (the chatbot uses Gemini 1.5 Flash)

---

## Product 4 — KWBA Admin Dashboard

Internal team tool. Briefs/leads kanban, client management, AI agents, settings, team accounts.

| File | What it is |
|---|---|
| `admin.html` | The full admin dashboard |
| `admin-new-logic.html` | Older version (kept for reference, not deployed-linked) |
| `admin_backup.html` | Older backup (kept for reference) |
| `client.html` | Single-client view |
| `portal.html` | Client-facing portal |
| `login.html` | Login page (used by all admin tools) |

**Public URL pattern:** `kwba-agency.onrender.com/admin.html` (login required)

---

## Backend (Powers All Four Products)

| File | What it is |
|---|---|
| `server.js` | The Node/Express server. Handles auth, all API endpoints, AI calls, database. **One server runs everything.** |
| `package.json` | Node dependencies |
| `package-lock.json` | Dependency lockfile |
| `render.yaml` | Render deployment config |
| `netlify.toml` | Netlify config (if hosting frontend separately) |
| `robots.txt` | Search engine crawler rules |
| `sitemap.xml` | Search engine sitemap |

---

## Shared Assets

| File | What it is |
|---|---|
| `favicon-16x16.png` etc. | Browser tab icons |
| `apple-touch-icon.png` | iOS home screen icon |
| `og-image.svg` | Social sharing preview image |
| `placeholder.svg` | Generic placeholder |
| `assets/` | Other shared assets folder |

---

## Required Render Environment Variables

| Variable | Used by | Where to get it |
|---|---|---|
| `DATABASE_URL` | All products | Render adds this automatically when you connect a Postgres database |
| `JWT_SECRET` | All products | Generate any long random string |
| `GEMINI_API_KEY` | Audit + AI Receptionist | aistudio.google.com/apikey |
| `GOOGLE_PLACES_KEY` | Lead Platform | console.cloud.google.com (Places API New) |
| `NODE_ENV` | Server | Set to `production` on Render |
| `SMTP_*` | Email notifications | Optional |
| `CLOUDINARY_*` | File uploads | Optional |

---

## Deployment

This is **one Render service**. You do NOT need three separate deployments.

1. Push the entire repo to GitHub (`Kayraba/kwba-agency`, branch `main`)
2. Render auto-deploys from the connected GitHub repo
3. All four products go live at `kwba-agency.onrender.com` in one deploy

If you ever want to extract one product (e.g. sell the Lead Platform to other agencies as standalone SaaS), see the `extracted-zips/` folder for ready-to-deploy starter packs of each product. **You don't need them right now** — they're just there for future flexibility.
