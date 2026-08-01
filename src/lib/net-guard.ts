import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Guard for server-side outbound HTTP to operator-supplied URLs (webhook delivery today).
// Without it, anyone who can register a destination can point the server at the cloud
// metadata endpoint or at services reachable only from inside the deployment's network —
// the classic SSRF pivot. The sourced-content importer solves the same problem with a host
// allowlist; webhooks cannot use one because subscribers are arbitrary by design, so this
// blocks the address ranges instead.

const BLOCKED_HOSTNAMES = new Set(["localhost", "ip6-localhost", "ip6-loopback"]);
const BLOCKED_HOSTNAME_SUFFIXES = [".localhost", ".local", ".internal", ".home.arpa"];

function ipv4ToParts(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const numbers = parts.map((part) => Number(part));
  return numbers.every((value) => Number.isInteger(value) && value >= 0 && value <= 255)
    ? numbers
    : null;
}

function isBlockedIpv4(address: string): boolean {
  const parts = ipv4ToParts(address);
  if (!parts) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // "this network"
  if (a === 10) return true; // RFC1918
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local, incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // RFC1918
  if (a === 192 && b === 168) return true; // RFC1918
  if (a === 192 && parts[1] === 0 && parts[2] === 0) return true; // IETF protocol assignments
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedIpv6(address: string): boolean {
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized === "::" || normalized === "::1") {
    return true;
  }
  // IPv4-mapped / IPv4-compatible forms smuggle a v4 address through a v6 literal.
  const mapped = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped) {
    return isBlockedIpv4(mapped[1]);
  }
  const head = normalized.split(":")[0];
  const leading = Number.parseInt(head || "0", 16);
  if (Number.isNaN(leading)) {
    return true;
  }
  if ((leading & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((leading & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((leading & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  return false;
}

export function isBlockedIpAddress(address: string): boolean {
  const version = isIP(address);
  if (version === 4) {
    return isBlockedIpv4(address);
  }
  if (version === 6) {
    return isBlockedIpv6(address);
  }
  return true;
}

export function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) {
    return true;
  }
  if (BLOCKED_HOSTNAMES.has(host)) {
    return true;
  }
  if (BLOCKED_HOSTNAME_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  // A bare IP literal (v6 arrives bracketed from URL.hostname) is checked directly;
  // everything else has to be resolved, which callers do via isPubliclyRoutableUrl.
  const literal = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  if (isIP(literal)) {
    return isBlockedIpAddress(literal);
  }
  return false;
}

/** Syntactic check: https, no credentials, and not an obviously internal host. */
export function parseOutboundWebhookUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    return null;
  }
  if (isBlockedHostname(url.hostname)) {
    return null;
  }
  return url;
}

/**
 * Resolution check: every address the hostname resolves to must be publicly routable.
 * Run this immediately before the request. It does not close the DNS-rebinding window on
 * its own — the OS may re-resolve for the actual connection — but it stops the common case
 * of a hostname that simply points at a private address.
 */
export async function isPubliclyRoutableUrl(url: URL): Promise<boolean> {
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) {
    return !isBlockedIpAddress(hostname);
  }
  try {
    const addresses = await lookup(hostname, { all: true });
    if (addresses.length === 0) {
      return false;
    }
    return addresses.every((entry) => !isBlockedIpAddress(entry.address));
  } catch {
    return false;
  }
}
