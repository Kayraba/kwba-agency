# Agent V2 — Deployment & Configuration Guide

A production-grade agent infrastructure layer on top of Gemini Flash, mounted at `/agent-v2/*` alongside the existing `/stream-agent`. The legacy admin still works; V2 is opt-in via the **⬩ V2 Pro** toggle next to the Run Agent button.

## What V2 adds

| Feature | What it does | Default |
|---|---|---|
| **RAG memory** | Retrieves the top 3 highest-rated past outputs for the same agent with similarity ≥30%. Injects them into the prompt as "examples of what worked". | ON |
| **Tools (function calling)** | Lets the model fetch URLs, search Google, look up Companies House, search past outputs — all chosen autonomously based on the brief. Max 4 rounds of tool calls per run. | ON |
| **Validation retry** | Runs schema-aware checks on the output (e.g., did the Deal Maker include 3 tiers; did the Financial Modeller include assumptions). If validation fails, automatically retries once with a targeted refinement instruction. | ON |
| **PII safety scrub** | Scans every output for UK postcodes, phone numbers, emails, NI numbers, credit cards that weren't in the original brief. Hard-masks high-severity matches; flags medium-severity. | Always on |
| **Banned phrase scan** | Catches "as an AI", "I am an AI", "As a language model" — flagged for review. | Always on |
| **Full telemetry** | Every run logged: latency, tokens, cost, tool calls, validation rate, retry count, errors. Per-agent dashboard via the Telemetry button. | Always on |
| **Agentic loop** | One automatic retry when validation fails. Not multi-step autonomous looping. | Configurable |

## Required environment variables (Render)

These are the only env vars you must have set. Everything else is optional.

```
GEMINI_API_KEY = (your Gemini API key)
```

## Optional environment variables — unlock tools

V2 works without these but the tools will return "not configured" messages when called. Highly recommended to add all three:

```
GOOGLE_CSE_KEY         = your Google Custom Search API key
GOOGLE_CSE_ID          = your CSE search engine ID
COMPANIES_HOUSE_KEY    = your Companies House Developer Hub API key
```

### How to get each one

**GOOGLE_CSE_KEY + GOOGLE_CSE_ID** (lets agents do live web search):
1. Go to https://programmablesearchengine.google.com/
2. Create a new search engine → "Search the entire web" → save → grab the cx ID (this is `GOOGLE_CSE_ID`)
3. Go to https://console.cloud.google.com/apis/library/customsearch.googleapis.com → Enable the Custom Search API
4. Create an API key in Credentials → that's `GOOGLE_CSE_KEY`
5. Free tier: 100 searches/day. Paid: $5 per 1000 queries after that.

**COMPANIES_HOUSE_KEY** (lets agents look up UK company financials):
1. Sign up at https://developer.company-information.service.gov.uk/
2. Create an application → grab the API key
3. Free, unlimited within fair-use limits.

## Database setup

V2 creates 4 new tables automatically on server boot:
- `agent_runs` — full telemetry per run
- `agent_embeddings` — pgvector store for RAG memory
- `agent_tool_calls` — per-tool latency and result logging
- `agent_safety_flags` — PII / banned phrase detection log

These are **additive** — they do not modify your existing `outputs`, `briefs`, `users`, etc.

### Optional: enable pgvector on Render Postgres

V2 will work without pgvector (stores embeddings as TEXT, ranks in-app), but pgvector makes retrieval significantly faster at scale.

On Render → your Postgres → Shell tab → run:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

If you already have data in `agent_embeddings`, the schema auto-upgrade handles the column type change. If pgvector isn't available, V2 silently falls back to TEXT storage with in-app cosine similarity. Either path works.

## How V2 fits with the existing admin

- The legacy `/stream-agent` endpoint and its streaming Senior Review pass are **untouched** — your admin keeps working exactly as before
- V2 is **opt-in per run** via the new "⬩ V2 Pro" toggle next to Run Agent
- When V2 is enabled, three sub-toggles appear: **Memory**, **Tools**, **Retry** (all on by default)
- The **📊 Telemetry** button opens a modal with per-agent run counts, total cost, validation rates, and average latency
- Approved V2 outputs are auto-saved to the existing `outputs` table AND embedded into `agent_embeddings` for future memory

## Cost on Gemini Flash (your current spend)

V2 adds ~1 embedding call per output save (~$0.0000125 per call) and optionally ~1-4 extra Gemini calls per run if tools are invoked. The validation retry adds at most 1 extra call per run when validation fails (~30% of runs in early testing).

Rough per-run cost on Flash:
- Basic V2 run (no tools, no retry): same as legacy, ~$0.001
- With memory injection: +$0.0001 (extra context tokens)
- With 2 tool calls: +$0.001-$0.002 (extra round-trips)
- With validation retry: +$0.001 (one full re-run)

**Expected V2 cost per agent run: $0.001–$0.005.** Versus what you'd pay on Claude Sonnet: $0.04–$0.10.

## Quick sanity test

After deploy, log in to admin, pick any client brief, pick any agent (e.g., The Summariser), tick **⬩ V2 Pro**, click **▶ Run Agent**. You should see:

1. A status of "V2 running — RAG + tools + validation…"
2. ~3-8 second wait (longer than legacy because tools may be called)
3. The output renders with a telemetry chip at the top showing latency, tokens, cost, and `✓ VALIDATED` or `⚠ MISSING SECTIONS`
4. The 📊 Telemetry button now shows 1 run in the dashboard

If you see "V2 error: ..." check the Render Logs tab for the actual error.
