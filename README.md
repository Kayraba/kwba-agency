# KWBA Agency Platform

A Node/Express backend and a static front end for a small UK web-design agency:
the public marketing site, an internal lead-prospecting tool, a multi-tenant AI
receptionist sold to clients, and the admin dashboard the team runs the business
from. One service, one database, no build step.

Live at https://kwba-agency.onrender.com

## Why I built it

I was running the agency and doing the same three things by hand: finding local
businesses with weak web presence, writing the first-draft pitch for each one,
and answering enquiries that arrived out of hours. Each of those is a small
piece of software, so I wrote them — and then kept them in one codebase because
they share the same login, the same database and the same Gemini key.

It is also where I learned most of what I know about running a server in
production: rate limiting that survives contact with a proxy, why a database
abstraction has to return the same shape everywhere, and how much of "AI
engineering" is really cost control and input validation.

## What it does

- **Prospector** — searches Google Places for businesses in a category and area,
  then fetches each one's website server-side and scores its web presence (TLS,
  mobile viewport, page weight, analytics, forms, schema, social links).
- **AI receptionist** — a per-client chatbot. Each tenant's configuration
  (services, pricing, hours, what they will not do) is compiled into a system
  prompt; the widget is a single embeddable script tag.
- **Lead audit funnel** — a visitor enters their URL on the homepage, gets a real
  scan of their site, and can request an AI-written audit that is streamed back
  and emailed to them.
- **Admin dashboard** — briefs, pipeline, invoices, KPIs and a document tracker.
- **Agent runner** (`/agent-v2`) — the drafting agent, with tool calling,
  retrieval over past outputs, and per-run token/cost telemetry.

## Tech stack

Node 22, Express 5, PostgreSQL (SQLite locally), JWT + bcrypt, Google Gemini
2.5 Flash, Google Places API, Cloudinary, Nodemailer. The front end is plain
HTML, CSS and JavaScript — 23 pages, no framework and no bundler. Tests use
Node's built-in `node:test`. Deployed on Render from `render.yaml`.

## Architecture

```
public/            static pages + the embeddable widget, served by Express
  assets/          shared CSS/JS
server.js          50 routes: auth, briefs, prospector, chatbots, KPIs, docs
agent_v2.js        5 routes: the tool-calling agent + its telemetry
lib/safe-fetch.js  outbound URL guard shared by everything that fetches a URL
test/              node:test unit + integration tests
```

One Express process serves the API and the static files, so there is no CORS
problem in production and nothing to deploy separately. `public/` is the only
directory exposed to the web.

The database is Postgres on Render and SQLite locally. `server.js` picks based
on whether `DATABASE_URL` is set, and the SQLite path is a shim that translates
`$1` placeholders to `?` and emulates `RETURNING` by reading the row back by
rowid. Sixteen tables, created on boot with `CREATE TABLE IF NOT EXISTS` plus a
short list of `ALTER TABLE` migrations.

## Key engineering decisions

**One server instead of separate services.** At this size the split would cost
more than it buys: a second deployment, cross-origin config, and a second cold
start on Render's free tier. `STRUCTURE.md` maps which file belongs to which
product, which is the part that actually needed solving.

**No front-end framework.** The pages are mostly forms and tables that are
loaded once. React would add a build step and a bundle to every page for
behaviour that `fetch` and template literals already cover. The cost of this
choice is real and visible: `admin.html` is large, and rendering goes through
`innerHTML` with a manual escape helper, which is exactly the kind of thing a
framework would have made safe by default.

**The database shim returns pg's shape everywhere.** It previously resolved to
`{ rows }` while call sites hedged with `isProduction ? result.rows : result` —
so in local development those reads were `undefined` and every chatbot route
404'd on my own machine. The fix was to make the shim's contract identical in
both backends and delete all fifteen hedges. An abstraction that behaves
differently per environment is not an abstraction.

**Rate limiting keys on `req.ip` with `trust proxy` set.** The limiters used to
read the left-most entry of `X-Forwarded-For`, which is whatever the caller
sent — so every limit on the service, including the ones protecting the Gemini
key, could be bypassed with one header. Render appends the real client IP, so
trusting exactly one hop makes `req.ip` the value a caller cannot choose.

**One outbound URL guard, in one file.** Three places fetch a URL somebody else
chose. Two had a hostname regex; the agent's `fetch_url` tool had nothing.
`lib/safe-fetch.js` resolves the hostname and checks the resulting addresses,
re-checks on every redirect hop, and refuses non-HTTP schemes.

## AI

**Model.** Gemini 2.5 Flash for all generation, `text-embedding-004` for
retrieval. Flash because these are short, high-volume, latency-visible calls
where quality per pound matters more than peak capability.

**Flow.** The chatbot compiles a tenant's row into a system prompt, sends the
conversation as `system_instruction` plus `contents`, and reads one reply. The
audit endpoint streams `streamGenerateContent` straight to the browser so the
visitor sees text immediately, buffers it server-side, and emails the finished
report.

**Structured output.** The receptionist signals a captured lead by ending its
reply with `[LEAD_CAPTURED]`, which the server strips before returning. This is
a sentinel, not schema-constrained decoding: it works, but it is guessable from
the response and the model can forget it. Gemini's structured-output mode is the
right fix and is in Future improvements.

**Grounding.** The agent has four tools (`fetch_url`, `google_search`,
`lookup_companies_house`, `search_past_outputs`), looped for up to four rounds.
Past outputs rated 4+ are embedded and the closest three are injected as
few-shot examples.

**Cost and abuse control.** Every AI route is rate limited, message count and
length are capped, `maxOutputTokens` is set, and each agent run records token
counts and an estimated cost. The estimate is indicative — the pricing constants
are environment-overridable and Google's billing console is the source of truth.

**Limits I know about.** The "vector store" is a JS cosine loop over the 200 most
recent rows; pgvector is enabled but nothing queries it with a vector operator,
which is fine at this corpus size and wrong later. The output check is a regex
test for required sections — it catches a truncated draft, not a bad argument.
There is no retry with backoff on Gemini 429/503 yet. Conversation history is
sent by the client, so a caller can forge the assistant's turns; nothing
downstream trusts it, but a server-side transcript would be better.

## Challenges

The one that took longest was rate limiting that actually limits. I had five
in-memory limiters and believed the AI endpoints were protected, until I looked
at how the IP was derived and realised the key came from a request header. That
is the kind of bug that reads as working code in every test you think to write.

The SQLite/Postgres shim was the same class of problem in a different place. It
worked in production, so the mismatch showed up only as chatbot routes that
"didn't work locally" — which I had worked around per call site instead of
fixing once at the boundary.

The public site scanner also has to survive the real web: sites that are HTTPS
in DNS but only answer on HTTP, pages that never finish loading, and responses
large enough to exhaust memory. It caps at 600KB, times out at nine seconds, and
falls back to HTTP once — and a hard failure is recorded as a signal rather than
an error, because a prospect whose site is down is a prospect worth calling.

## What I learned

- Where a value comes from matters more than what it looks like. A client-set
  header, a client-set session ID and a client-set system prompt all look like
  ordinary variables at the call site.
- Duplicated logic drifts silently. The two copies of the site-fetch code had
  already diverged, and the third place that needed the guard never got it.
- Tests are worth most on the seams. The unit tests here cover pure functions,
  but the bugs worth catching lived in the boundary between two database
  backends — so the integration tests boot the real server against a temporary
  SQLite file.
- Writing down what a system does *not* do is more useful than describing what
  it does. Naming a table `agent_embeddings` does not make it a vector database.

## Running locally

Requires Node 18+ (developed on 22).

```bash
npm install
cp .env.example .env      # GEMINI_API_KEY is the only one needed for the AI routes
npm run dev
```

Then open http://localhost:3000. With no `DATABASE_URL` the server creates
`database.db` (SQLite) in the working directory and seeds an admin user from
`ADMIN_EMAIL` / `ADMIN_PASSWORD`.

Without `GEMINI_API_KEY` everything still runs; the demo chat returns canned
replies and the other AI routes return 503. The server logs which optional
variables are missing on boot.

```bash
npm test                  # 32 tests, no external services required
npm audit --omit=dev      # what actually ships
```

## Deployment

Render, from `render.yaml`: one web service plus a Postgres instance. Pushing to
`main` deploys. `JWT_SECRET` is generated by Render and the server refuses to
boot in production without it; `GEMINI_API_KEY`, `GOOGLE_PLACES_KEY`,
`ADMIN_PASSWORD` and the SMTP and Cloudinary credentials are set in the
dashboard.

## Future improvements

- Replace the `[LEAD_CAPTURED]` sentinel with Gemini's structured output mode.
- Retry with exponential backoff on Gemini 429/503; right now one 429 is one
  failed request.
- Query pgvector with `ORDER BY embedding <=> $1 LIMIT k` instead of ranking in
  JavaScript, before the corpus outgrows a 200-row scan.
- Move rate-limit state to Postgres or Redis. It is per-process, so it resets on
  every deploy and would not hold across a second instance.
- Split `admin.html` into modules and render through `textContent` rather than
  `innerHTML` with a manual escape helper.
- Server-side conversation state for the chatbot, so history is not client-supplied.
