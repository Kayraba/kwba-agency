const { test } = require("node:test");
const assert = require("node:assert");
const { scanForPII, scanForBannedPhrases, validateOutput } = require("../agent_v2");

test("flags a UK mobile number the model invented", () => {
  const flags = scanForPII("Call the owner on 07700 900123 to confirm.", "");
  assert.ok(flags.some(f => f.type === "uk_phone"), JSON.stringify(flags));
});

test("does not flag PII the client themselves put in the brief", () => {
  const brief = "Our contact is hello@acme.co.uk and we're at MK9 1AA.";
  const flags = scanForPII("Email hello@acme.co.uk or write to MK9 1AA.", brief);
  assert.deepStrictEqual(flags, []);
});

test("treats card and NI numbers as high severity so they get scrubbed", () => {
  const flags = scanForPII("Card 4111 1111 1111 1111 on file.", "");
  const card = flags.find(f => f.type === "credit_card");
  assert.ok(card);
  assert.strictEqual(card.severity, "high");
});

test("email and postcode are flagged but not auto-scrubbed", () => {
  const flags = scanForPII("Reach us at sales@acme.co.uk.", "");
  assert.strictEqual(flags.find(f => f.type === "email").severity, "medium");
});

test("catches the model breaking character", () => {
  const flags = scanForBannedPhrases("As an AI, I cannot actually visit the site.");
  assert.ok(flags.length >= 2, JSON.stringify(flags));
  assert.ok(flags.every(f => f.type === "banned_phrase"));
});

test("clean copy produces no banned-phrase flags", () => {
  assert.deepStrictEqual(scanForBannedPhrases("We'll confirm that on the call."), []);
});

test("validateOutput reports the sections a draft is missing", () => {
  const result = validateOutput("deal_maker", "Executive summary: we will build the site. Scope: five pages.");
  assert.strictEqual(result.passed, false);
  assert.ok(result.missing.length > 0);
});

test("validateOutput passes a draft with every required section", () => {
  const draft = `Executive summary ... Scope ... Investment options ... Next steps ... Growth package`;
  assert.strictEqual(validateOutput("deal_maker", draft).passed, true);
});

test("an unknown agent slug has no rules and always passes", () => {
  assert.strictEqual(validateOutput("does_not_exist", "anything at all").passed, true);
});
