/**
 * Boots the real server against a throwaway SQLite file and talks to it over
 * HTTP. Slower than a unit test, but these are the paths that broke in ways
 * unit tests would not have caught: the SQLite shim returning a different shape
 * from pg, and auth gates that only exist in middleware.
 */
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ADMIN_EMAIL = "admin@kwba-agency.com";
const ADMIN_PASSWORD = "test-password-not-a-secret";

let server, base, workdir, token;

function waitForExit(child) {
  return new Promise(resolve => child.on("exit", resolve));
}

before(async () => {
  workdir = fs.mkdtempSync(path.join(os.tmpdir(), "kwba-test-"));
  const port = 4100 + Math.floor(Math.random() * 800);
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, [path.join(__dirname, "..", "server.js")], {
    cwd: workdir,
    env: { ...process.env, PORT: String(port), ADMIN_PASSWORD, NODE_ENV: "test", DATABASE_URL: "" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  // The server calls listen() before initDb() has finished seeding the admin
  // user, so "port is open" isn't "ready" — poll until the login succeeds.
  const deadline = Date.now() + 30000;
  for (;;) {
    if (Date.now() > deadline) throw new Error("server never became ready");
    try {
      const res = await fetch(`${base}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD })
      });
      if (res.ok) { token = (await res.json()).token; break; }
    } catch { /* not listening yet */ }
    await new Promise(r => setTimeout(r, 200));
  }
});

after(async () => {
  if (server) { server.kill("SIGKILL"); await waitForExit(server); }
  if (workdir) fs.rmSync(workdir, { recursive: true, force: true });
});

const auth = () => ({ Authorization: `Bearer ${token}`, "Content-Type": "application/json" });
const post = (p, body, headers = { "Content-Type": "application/json" }) =>
  fetch(base + p, { method: "POST", headers, body: JSON.stringify(body) });

test("seeded admin can log in", () => {
  assert.ok(token, "expected a JWT from /login");
});

test("login rejects a wrong password and a missing body", async () => {
  assert.strictEqual((await post("/login", { email: ADMIN_EMAIL, password: "nope" })).status, 401);
  assert.strictEqual((await post("/login", {})).status, 400);
});

test("protected routes reject a missing or forged token", async () => {
  assert.strictEqual((await fetch(`${base}/briefs`)).status, 403);
  const forged = { Authorization: "Bearer not.a.real.token", "Content-Type": "application/json" };
  assert.strictEqual((await fetch(`${base}/briefs`, { headers: forged })).status, 403);
});

// This is the regression the SQLite shim fix was for: RETURNING id came back
// empty in dev, so every create route threw on result.rows[0].
test("creating a brief returns its new id and it appears in the list", async () => {
  const created = await (await post("/public-brief", { bizName: "Test Plumbing", contactEmail: "a@b.co.uk" })).json();
  assert.ok(Number.isInteger(created.id), `expected an id, got ${JSON.stringify(created)}`);
  const briefs = await (await fetch(`${base}/briefs`, { headers: auth() })).json();
  assert.ok(briefs.some(b => b.id === created.id && b.bizName === "Test Plumbing"));
});

test("public brief validates the field the form actually sends", async () => {
  assert.strictEqual((await post("/public-brief", { bizName: "X", contactEmail: "not-an-email" })).status, 400);
  assert.strictEqual((await post("/public-brief", { bizName: "X", contactPhone: "abc" })).status, 400);
  assert.strictEqual((await post("/public-brief", { bizName: "X", contactEmail: "ok@ok.com" })).status, 200);
});

test("public brief rejects an oversized body", async () => {
  assert.strictEqual((await post("/public-brief", { bizName: "X", notes: "a".repeat(25000) })).status, 413);
});

// Chatbot routes read through getChatbotBySlug, which returned undefined in dev
// before the shim fix — every one of these 404'd on a developer's machine.
test("a created chatbot is readable by slug and listed", async () => {
  const created = await (await post("/api/chatbots", { business_name: "Test Co", city: "Milton Keynes" }, auth())).json();
  assert.ok(created.slug, JSON.stringify(created));

  const publicView = await (await fetch(`${base}/api/chatbot/${created.slug}`)).json();
  assert.strictEqual(publicView.business_name, "Test Co");
  assert.strictEqual(publicView.system_prompt, undefined, "public config must not leak the system prompt");
  assert.strictEqual(publicView.knowledge_base, undefined, "public config must not leak the knowledge base");

  const list = await (await fetch(`${base}/api/chatbots`, { headers: auth() })).json();
  assert.ok(list.some(c => c.slug === created.slug));
});

test("unknown chatbot slug is a 404, not a 500", async () => {
  assert.strictEqual((await fetch(`${base}/api/chatbot/does-not-exist`)).status, 404);
});

test("chat rejects malformed message arrays", async () => {
  for (const body of [{ sessionId: "s1" }, { sessionId: "s1", messages: [] },
                      { sessionId: "s1", messages: [{ role: "system", text: "x" }] },
                      { sessionId: "s1", messages: [{ role: "user" }] }]) {
    const res = await post("/api/chatbot/anything/chat", body);
    assert.strictEqual(res.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test("KPI and document create/list round-trip", async () => {
  const kpi = await (await post("/api/kpis", { name: "Leads", target: 10 }, auth())).json();
  assert.ok(Number.isInteger(kpi.id), JSON.stringify(kpi));
  const doc = await (await post("/api/documents", { title: "Proposal" }, auth())).json();
  assert.ok(Number.isInteger(doc.id), JSON.stringify(doc));
  const docs = await (await fetch(`${base}/api/documents`, { headers: auth() })).json();
  assert.ok(docs.some(d => d.id === doc.id));
});

test("site scan refuses internal targets", async () => {
  for (const url of ["http://169.254.169.254/", "http://127.0.0.1/", "http://[::1]/", "http://10.0.0.1/"]) {
    const res = await post("/public-site-scan", { url });
    assert.strictEqual(res.status, 400, `expected ${url} to be refused`);
  }
});

test("security headers are set on static responses", async () => {
  const res = await fetch(`${base}/`);
  assert.strictEqual(res.headers.get("x-content-type-options"), "nosniff");
  assert.strictEqual(res.headers.get("x-frame-options"), "SAMEORIGIN");
});
