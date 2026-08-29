const { test } = require("node:test");
const assert = require("node:assert");
const { assertPublicUrl, isPrivateAddress, BlockedUrlError } = require("../lib/safe-fetch");

// Pretend DNS, so these tests don't depend on the network or on a real domain
// continuing to resolve the way it does today.
const resolvesTo = (...addresses) => async () => addresses.map(address => ({ address }));

async function blocked(url, opts) {
  await assert.rejects(() => assertPublicUrl(url, opts), BlockedUrlError, `expected ${url} to be blocked`);
}

test("blocks the cloud metadata endpoint", async () => {
  await blocked("http://169.254.169.254/latest/meta-data/");
});

test("blocks loopback, RFC1918 and CGNAT literals", async () => {
  for (const host of ["127.0.0.1", "10.0.0.1", "172.16.5.4", "192.168.1.1", "100.64.0.1", "0.0.0.0"]) {
    await blocked(`http://${host}/`);
  }
});

test("blocks IPv6 loopback, link-local and IPv4-mapped loopback", async () => {
  for (const host of ["[::1]", "[fe80::1]", "[fc00::1]", "[::ffff:127.0.0.1]"]) {
    await blocked(`http://${host}/`);
  }
});

test("blocks non-http schemes", async () => {
  for (const url of ["file:///etc/passwd", "gopher://example.com/", "ftp://example.com/"]) {
    await blocked(url);
  }
});

test("blocks internal-looking names without touching DNS", async () => {
  for (const host of ["localhost", "db.internal", "printer.local", "gateway.lan"]) {
    await blocked(`http://${host}/`);
  }
});

// The regex guard this replaced only looked at the hostname text, so a public
// name pointing at a private address walked straight through.
test("blocks a public hostname that resolves to a private address", async () => {
  await blocked("https://totally-normal.example.com/", { resolve: resolvesTo("127.0.0.1") });
});

test("blocks when any one of several A records is private", async () => {
  await blocked("https://mixed.example.com/", { resolve: resolvesTo("93.184.216.34", "10.1.2.3") });
});

test("blocks a host that does not resolve", async () => {
  await blocked("https://nope.example.com/", { resolve: async () => { throw new Error("ENOTFOUND"); } });
});

test("allows an ordinary public host", async () => {
  const url = await assertPublicUrl("https://example.com/pricing", { resolve: resolvesTo("93.184.216.34") });
  assert.strictEqual(url.hostname, "example.com");
  assert.strictEqual(url.pathname, "/pricing");
});

test("allows a public IP literal", async () => {
  const url = await assertPublicUrl("http://93.184.216.34/");
  assert.strictEqual(url.hostname, "93.184.216.34");
});

test("isPrivateAddress refuses anything that is not an IP", () => {
  assert.strictEqual(isPrivateAddress("not-an-ip"), true);
  assert.strictEqual(isPrivateAddress(""), true);
  assert.strictEqual(isPrivateAddress("93.184.216.34"), false);
});
