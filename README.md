# KWBA Agency — Full Platform

UK digital marketing agency platform built around four integrated products: marketing website, lead intelligence platform (prospector), AI receptionist (chatbot product sold to clients), and admin dashboard.

**Live at:** https://kwba-agency.onrender.com

## What's in this repo?

See [STRUCTURE.md](./STRUCTURE.md) for the full breakdown of which file does what.

**Quick summary:**

- 🌐 **Website** (`index.html`, `marketing.html`, `package-explainer.html` etc.) — public-facing marketing site
- 🔍 **Prospector** (`prospector.html`) — internal lead-finding tool using Google Places API
- 💬 **AI Receptionist** (`chatbot-demo.html`, `chatbot-widget.js`) — multi-tenant chatbot product sold to clients
- 📋 **Admin** (`admin.html`, `client.html`, `portal.html`) — internal team dashboard
- ⚙️ **Backend** (`server.js`) — single Node/Express server that powers all of the above

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
