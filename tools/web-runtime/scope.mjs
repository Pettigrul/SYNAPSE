// SecurityAuditor — Web Runtime scope guard (Rule 0 + SSRF/internal-destination guard).
// Allowlist-first authorization, enforced BEFORE the first request and AFTER every
// redirect. No DNS resolution (no real-network dependency this round): hostnames are
// authorized only via the explicit allowlist; IP literals are range-checked directly.

/** @typedef {import('./contracts.d.ts').Scope} Scope */

export class ScopeError extends Error {
  constructor(message, url) { super(message); this.name = "ScopeError"; this.url = url; }
}

const HOSTNAME_INTERNAL = /(^|\.)(localhost|local|internal|lan|intranet|corp|home)$/i;

function parseIpv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some(n => n > 255)) return null;
  return (o[0] << 24 >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}

function ipv4InRange(ip, cidrBase, bits) {
  const base = parseIpv4(cidrBase);
  const mask = bits === 0 ? 0 : (~((1 << (32 - bits)) - 1)) >>> 0;
  return (ip & mask) >>> 0 === (base & mask) >>> 0;
}

/** True if an IPv4 literal is private / loopback / link-local / reserved / metadata. */
function isInternalIpv4(ip) {
  return (
    ipv4InRange(ip, "0.0.0.0", 8) ||
    ipv4InRange(ip, "10.0.0.0", 8) ||
    ipv4InRange(ip, "100.64.0.0", 10) ||
    ipv4InRange(ip, "127.0.0.0", 8) ||
    ipv4InRange(ip, "169.254.0.0", 16) || // link-local, incl. 169.254.169.254 (cloud metadata)
    ipv4InRange(ip, "172.16.0.0", 12) ||
    ipv4InRange(ip, "192.0.0.0", 24) ||
    ipv4InRange(ip, "192.168.0.0", 16) ||
    ipv4InRange(ip, "198.18.0.0", 15) ||
    ipv4InRange(ip, "240.0.0.0", 4)
  );
}

/** Minimal IPv6 internal check (loopback, ULA, link-local, unspecified, v4-mapped). */
function isInternalIpv6(host) {
  let h = host;
  if (h.startsWith("[") && h.endsWith("]")) h = h.slice(1, -1);
  const low = h.toLowerCase();
  if (low === "::1" || low === "::") return true;
  if (low.startsWith("fe8") || low.startsWith("fe9") || low.startsWith("fea") || low.startsWith("feb")) return true; // fe80::/10
  if (low.startsWith("fc") || low.startsWith("fd")) return true; // fc00::/7 ULA
  const mapped = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(low);
  if (mapped) { const ip = parseIpv4(mapped[1]); return ip != null && isInternalIpv4(ip); }
  return false;
}

function hostAllowlisted(host, scope) {
  const h = host.toLowerCase();
  for (const entry of scope.allowHosts || []) {
    const e = entry.toLowerCase();
    if (e.startsWith(".")) { if (h === e.slice(1) || h.endsWith(e)) return true; }
    else if (h === e) return true;
  }
  return false;
}

function isInternalHost(host) {
  const ip4 = parseIpv4(host);
  if (ip4 != null) return isInternalIpv4(ip4);
  if (host.includes(":") || (host.startsWith("[") && host.endsWith("]"))) return isInternalIpv6(host);
  if (!host.includes(".")) return true; // bare hostnames resolve on the internal network
  return HOSTNAME_INTERNAL.test(host);
}

/**
 * Authorize a target URL against the scope. Throws ScopeError when denied.
 * @param {string} urlStr
 * @param {Scope} scope
 * @returns {URL}
 */
export function validateTarget(urlStr, scope) {
  let url;
  try { url = new URL(urlStr); } catch { throw new ScopeError(`malformed URL: ${urlStr}`, urlStr); }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ScopeError(`protocol not allowed: ${url.protocol}`, urlStr);
  }

  const host = url.hostname;
  const internal = isInternalHost(host);

  // SSRF guard: internal destinations are blocked unless explicitly allowed AND allowlisted.
  if (internal && !(scope.allowPrivate && hostAllowlisted(host, scope))) {
    throw new ScopeError(`internal/non-routable destination blocked: ${host}`, urlStr);
  }

  // Allowlist-first: the host (or exact URL) must be in scope.
  const urlInList = (scope.allowUrls || []).some(u => {
    try { const a = new URL(u); return a.origin === url.origin && a.pathname === url.pathname; }
    catch { return false; }
  });
  if (!hostAllowlisted(host, scope) && !urlInList) {
    throw new ScopeError(`out of scope: ${host}`, urlStr);
  }

  return url;
}

export const _internals = { parseIpv4, isInternalIpv4, isInternalIpv6, isInternalHost, hostAllowlisted };
