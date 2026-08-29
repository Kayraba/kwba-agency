# KWBA Agency Platform

The backend and front end for my web design agency. It's a Node/Express server
plus a set of static pages covering four things: the marketing site, an internal
tool for finding leads, an AI receptionist chatbot I sell to clients, and the
admin dashboard I run the business from.

Live at https://kwba-agency.onrender.com

## Why I built it

I was doing the same three jobs by hand every week: finding local businesses
with bad or missing websites, writing a first-draft pitch for each one, and
answering enquiries that came in after hours. Each of those is a small program,
so I wrote them. They ended up in one codebase because they share a login, a
database and the same Gemini API key.

It's also where I learned most of what I know about running a server that other
people actually use. A lot of what's in here I got wrong the first time.

## What it does

- **Prospector** — searches Google Places for businesses in a category and area,
  then fetches each one's website and scores it (HTTPS, mobile viewport, page
  size, analytics, contact forms, schema, social links).
- **AI receptionist** — a chatbot per client. Their services, pricing, hours and
  what they won't do get turned into a system prompt. Clients embed it with one
  script tag.
- **Audit funnel** — a visitor puts their URL in on the homepage, gets a real
  scan of their site, and can ask for an AI-written audit that streams back and
  gets emailed to them.
- **Admin dashboard** — briefs, pipeline, invoices, KPIs, document tracking.
- **Agent runner** (`/agent-v2`) — the drafting agent, with tool calling and
  token/cost logging per run.

## Tech stack

Node 22, Express 5, PostgreSQL in production and SQLite locally, JWT and bcrypt
for auth, Gemini 2.5 Flash, Google Places, Cloudinary, Nodemailer. The front end
is plain HTML, CSS and JavaScript — 23 pages, no framework, no build step. Tests
use Node's built-in test runner. Hosted on Render.

## Architecture

```
public/            static pages + the embeddable widget, served by Express
  assets/          shared CSS/JS
server.js          50 routes: auth, briefs, prospector, chatbots, KPIs, docs
agent_v2.js        5 routes: the tool-calling agent + telemetry
lib/safe-fetch.js  URL guard, used anywhere the server fetches a URL
test/              unit + integration tests
```

One Express process serves both the API and the static files. That means no
CORS setup in production and only one thing to deploy. `public/` is the only
folder exposed to the web.

For the database, `server.js` uses Postgres if `DATABASE_URL` is set and SQLite
if it isn't. The SQLite side is a small wrapper that swaps `$1` placeholders for
`?` and fakes `RETURNING` by reading the row back by rowid. 16 tables, created
on boot with `CREATE TABLE IF NOT EXISTS`, plus a couple of `ALTER TABLE` lines
for columns I added later.

## Decisions I made and why

**One server, not several.** Splitting this up would mean a second deploy, CORS
config between them and another cold start on Render's free tier, and I'd get
almost nothing back at this size. What actually needed solving was knowing which
file does what, which is what `STRUCTURE.md` is for.

**No front-end framework.** The pages are mostly forms and tables that load
once. React would mean a build step to maintain and a bundle on every page. The
downside is real though — `admin.html` is about 5,000 lines and I render
everything with `innerHTML` and a manual escape function, which is the kind of
thing React would have handled for me.

**Making the SQLite wrapper return the same shape as Postgres.** This one was a
bug I'd been living with. The wrapper resolved to `{ rows }`, same as `pg`, but
I had 15 call sites written as `isProduction ? result.rows : result` — so
locally those came back undefined and every chatbot route 404'd on my own
machine. It worked in production so I never chased it properly, I just worked
around it wherever it bit me. Fixing it meant changing the wrapper once instead
of 15 call sites.

**Rate limiting on `req.ip` with `trust proxy` set.** I was reading the first
entry of `X-Forwarded-For` to get the client IP. That entry is whatever the
caller sends, so anyone could reset their own rate limit with one header —
including on the endpoints that cost me money. Render appends the real IP rather
than replacing the header, so `trust proxy` tells Express how far to look and
`req.ip` gives the right value.

**One URL guard in one file.** Three places fetch a URL that someone else
picked. Two had the same hostname regex copy-pasted between them, and the
agent's `fetch_url` tool had nothing at all. `lib/safe-fetch.js` resolves the
hostname and checks the IPs it comes back with, checks again on every redirect,
and refuses anything that isn't http or https.

## AI

**Model.** Gemini 2.5 Flash for everything, `text-embedding-004` for
embeddings. Flash because these are short calls where the user is waiting, and
the cost per call matters more to me than getting the best possible output.

**How it works.** The chatbot builds a system prompt from the client's row in
the database, sends the conversation as `system_instruction` plus `contents`,
and returns one reply. The audit endpoint streams `streamGenerateContent`
straight through to the browser so text appears immediately, keeps a copy
server-side, and emails the finished report.

**Structured output.** The receptionist tells me it's captured a lead by ending
its reply with `[LEAD_CAPTURED]`, which I strip before sending the reply on.
It works but it isn't great — the model sometimes forgets, and someone could
guess the string. Gemini has a structured output mode that would do this
properly and I haven't moved to it yet.

**Grounding.** The agent has four tools (`fetch_url`, `google_search`,
`lookup_companies_house`, `search_past_outputs`) and loops up to four times.
Outputs I rated 4 or 5 get embedded, and the closest three go into the prompt as
examples.

**Cost control.** Every AI route is rate limited, message count and length are
capped, `maxOutputTokens` is set, and each agent run writes its token counts and
an estimated cost to the database. The cost figure is rough — the price
constants are env vars and the real number is in Google's billing console.

**Things I know aren't right yet.** The similarity search is a JavaScript loop
over the 200 most recent rows. I turn on pgvector but never actually query it
with a vector operator, so it isn't doing anything — at this size the loop is
fine, but I'd need to fix that before the table gets big. The output check is
just regexes looking for required section headings, so it spots a cut-off draft
and nothing about whether the writing is any good. There's no retry when Gemini
returns a 429. And the conversation history comes from the client, so someone
could fake what the bot said earlier — nothing important depends on it, but
keeping it server-side would be better.

## Problems I ran into

Rate limiting took the longest, mostly because I thought it was done. I had five
limiters and assumed the AI endpoints were covered. It wasn't until I looked at
where the IP came from that I realised the key was a header the caller sets. It
looked like working code and every test I'd have thought to write would have
passed.

The SQLite and Postgres mismatch was the same sort of thing somewhere else.
Production was fine, so all I ever saw was "the chatbot doesn't work locally",
and I patched around it each time instead of fixing the wrapper.

The site scanner has to deal with the actual web, which is messier than I
expected: sites that are HTTPS in DNS but only answer on HTTP, pages that never
finish loading, and responses big enough to be a problem. It stops at 600KB,
gives up after nine seconds, and retries once over HTTP. A site that's
completely down gets recorded as a signal rather than an error, because that's
a business worth ringing.

## What I learned

- Where a value comes from matters more than what it looks like. A header the
  client sets, a session ID the client picks and a system prompt the client
  sends all look like normal variables when you're reading the code.
- Copy-pasted code drifts. My two copies of the site-fetch logic had already
  gone out of sync, and the third place that needed the same guard never got it.
- Tests are worth the most at the joins between things. The unit tests here
  cover simple functions, but the bugs that mattered were at the boundary
  between two databases, so the integration tests start the real server against
  a temporary SQLite file.
- Writing down what something doesn't do is more useful than listing what it
  does, and it's less embarrassing than being asked about it later.

## Running it locally

Node 18 or newer (I'm on 22).

```bash
npm install
cp .env.example .env      # GEMINI_API_KEY is the only one the AI routes need
npm run dev
```

Open http://localhost:3000. With no `DATABASE_URL` it makes a `database.db`
SQLite file in the working directory and creates an admin user from
`ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Without `GEMINI_API_KEY` everything still runs — the demo chat gives canned
replies and the other AI routes return 503. The server logs which optional
variables are missing when it starts.

```bash
npm test                  # 32 tests, nothing external needed
npm audit --omit=dev      # what actually ships
```

## Deploying

Render, from `render.yaml` — one web service and a Postgres database. Pushing to
`main` deploys it. Render generates `JWT_SECRET` and the server won't start in
production without one. `GEMINI_API_KEY`, `GOOGLE_PLACES_KEY`, `ADMIN_PASSWORD`
and the SMTP and Cloudinary settings go in the dashboard.

## Things I'd do next

- Use Gemini's structured output instead of the `[LEAD_CAPTURED]` string.
- Retry with backoff on 429 and 503. At the moment one rate-limit response is
  just a failed request for the user.
- Query pgvector properly (`ORDER BY embedding <=> $1 LIMIT k`) instead of
  ranking in JavaScript, before 200 rows stops being enough.
- Move the rate limit counters out of process memory. They reset on every deploy
  and wouldn't work at all if I ran two instances.
- Break up `admin.html` and stop rendering through `innerHTML`.
- Keep the chatbot conversation on the server instead of trusting the client.
