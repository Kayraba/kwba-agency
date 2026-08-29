/**
 * Outbound URL guard for the endpoints that fetch a URL somebody else chose:
 * /public-site-scan (anonymous visitors), /api/site-check (Prospector) and the
 * agent's fetch_url tool (the model picks the URL, so a poisoned brief picks it).
 *
 * The guard those endpoints used to do inline was a regex on the hostname. That
 * misses everything that doesn't *look* private: a DNS record pointing at
 * 127.0.0.1, a 302 to the cloud metadata service, an IPv6 literal, or an integer
 * IP. So resolve the host and check the addresses instead of the string, and
 * re-check on every redirect hop rather than handing the chain to fetch().
 */

const dns = require("dns").promises;
const net = require("net");
const fetch = require("node-fetch");

const MAX_REDIRECTS = 4;

// RFC1918 + loopback + link-local (169.254.169.254 is the cloud metadata
// endpoint on AWS/GCP/Azure) + CGNAT + the reserved blocks.
function isPrivateIPv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;      // 192.0.0.0/24, 192.0.2.0/24
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true;                   // multicast + reserved + broadcast
  return false;
}

function isPrivateIPv6(ip) {
  const s = ip.toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fe80")) return true;                 // link-local
  if (/^f[cd]/.test(s)) return true;                     // unique local
  // IPv4-mapped addresses. WHATWG URL parsing normalises ::ffff:127.0.0.1 to
  // the hex form ::ffff:7f00:1, so both spellings have to be unpacked.
  const dotted = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return isPrivateIPv4(dotted[1]);
  const hex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hex) {
    const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return isPrivateIPv4([hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join("."));
  }
  return false;
}

function isPrivateAddress(ip) {
  const family = net.isIP(ip);
  if (family === 4) return isPrivateIPv4(ip);
  if (family === 6) return isPrivateIPv6(ip);
  return true; // not an IP we can reason about — refuse
}

class BlockedUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

/**
 * Throws BlockedUrlError unless `raw` is an http(s) URL whose hostname resolves
 * only to public addresses. Returns the parsed URL.
 *
 * Note the TOCTOU gap: we resolve here and fetch() resolves again, so a DNS
 * record that flips between the two calls still gets through. Closing that
 * needs a pinned-IP agent; for a page-fetcher whose response is HTML we already
 * cap and strip, the residual risk is accepted rather than unnoticed.
 */
async function assertPublicUrl(raw, { resolve = dns.lookup.bind(dns) } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("Invalid URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only http and https URLs are allowed");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");

  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new BlockedUrlError("Blocked host (private address)");
    return url;
  }
  if (/^(localhost|.*\.localhost)$/i.test(host) || /\.(local|internal|home|lan)$/i.test(host)) {
    throw new BlockedUrlError("Blocked host (internal name)");
  }

  let addresses;
  try {
    addresses = await resolve(host, { all: true });
  } catch {
    throw new BlockedUrlError("Host does not resolve");
  }
  if (!addresses.length) throw new BlockedUrlError("Host does not resolve");
  for (const { address } of addresses) {
    if (isPrivateAddress(address)) throw new BlockedUrlError("Blocked host (resolves to a private address)");
  }
  return url;
}

/**
 * fetch() with the guard applied to the initial URL and to every redirect.
 * node-fetch's own redirect:'follow' would re-point at a private address
 * without telling us, so follow the chain by hand.
 */
async function safeFetch(raw, opts = {}) {
  let current = String(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublicUrl(current);
    const res = await fetch(current, { ...opts, redirect: "manual" });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location"), current).toString();
      if (typeof res.body?.resume === "function") res.body.resume(); // drain
      continue;
    }
    // node-fetch keeps the requested URL on res.url with redirect:'manual';
    // callers want the URL the body actually came from.
    Object.defineProperty(res, "resolvedUrl", { value: current, enumerable: true });
    return res;
  }
  throw new BlockedUrlError(`Too many redirects (>${MAX_REDIRECTS})`);
}

module.exports = { assertPublicUrl, safeFetch, isPrivateAddress, BlockedUrlError, MAX_REDIRECTS };
