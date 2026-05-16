# KWBA — Static Audit Notes (V5)

Audit run on `kwba-MASTER-V5.zip` against `server.js`.

## Summary

| Metric | Value |
|---|---|
| HTML files audited | 17 |
| Backend routes defined | 33 |
| Unique frontend API calls | 8 |
| Real broken routes | **0** (the 1 "unmatched" is a false positive) |
| Real broken resources | **0** (the 4 "missing" are template literals or unused tools) |

## What the audit found and fixed

### ✓ Fixed: client.html upload was calling non-existent routes
`client.html` was POSTing to `/client/upload` and `/client/save-file` which don't exist in `server.js`. Now uses `/upload` (the actual route), with the JWT auth header and proper FormData fields (`briefId`, `tag`). Also adds error handling that surfaces real failure messages.

### ✓ Fixed: 404.html linked to 3 pages that don't exist
`/agent-lead-followup.html`, `/agent-seo-content.html`, `/agent-case-study.html` were "popular pages" on 404 but those files don't exist. Replaced with real links: Web Brief, Marketing Brief, Client Login.

### False positives (not real bugs)

- **`PATCH /api/chatbots/`** — the audit regex stripped the URL template variable. Actual call is `PATCH ${API_BASE}/api/chatbots/${slug}` which correctly matches `PATCH /api/chatbots/:slug` in server.js.
- **`${API_BASE}/chatbot-widget.js`** — chatbot-demo uses this template literal at runtime; resolves correctly when JS runs.
- **`${f.url}`** / **`${esc(lead.website)}`** — portal/prospector use dynamic per-row URLs from data.

### Low-priority remaining items

- **`package-explainer.html`** references `char-explainer.mp4` which was never delivered. That page is an internal slideshow tool (overflow:hidden, not public-facing). Not in the user flow. Leave as-is or delete the page entirely if not used.

## How to verify the LIVE deployment is connected

Open `https://kwba-agency.com/diagnostic.html` in your browser and click "Run all checks". You'll see green ticks for every:
- Static asset on Netlify
- Backend route on Render  
- CORS preflight
- Login auth round-trip

Any red ✕ tells you exactly which connection is broken and what to do about it.
