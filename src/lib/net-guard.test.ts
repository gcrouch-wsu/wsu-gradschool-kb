import { describe, expect, it } from "vitest";
import {
  isBlockedHostname,
  isBlockedIpAddress,
  parseOutboundWebhookUrl,
} from "@/lib/net-guard";

describe("isBlockedIpAddress", () => {
  it("blocks the cloud metadata address and the rest of link-local", () => {
    expect(isBlockedIpAddress("169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("169.254.1.1")).toBe(true);
  });

  it("blocks loopback, RFC1918, CGNAT, and reserved ranges", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "100.64.0.1",
      "0.0.0.0",
      "224.0.0.1",
      "255.255.255.255",
    ]) {
      expect(isBlockedIpAddress(address), address).toBe(true);
    }
  });

  it("allows ordinary public addresses", () => {
    expect(isBlockedIpAddress("8.8.8.8")).toBe(false);
    expect(isBlockedIpAddress("172.32.0.1")).toBe(false);
    expect(isBlockedIpAddress("2606:4700::1111")).toBe(false);
  });

  it("blocks IPv6 loopback, unique-local, and link-local", () => {
    expect(isBlockedIpAddress("::1")).toBe(true);
    expect(isBlockedIpAddress("fd00::1")).toBe(true);
    expect(isBlockedIpAddress("fe80::1")).toBe(true);
  });

  it("sees through IPv4-mapped IPv6 literals", () => {
    expect(isBlockedIpAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIpAddress("::ffff:169.254.169.254")).toBe(true);
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("rejects anything that is not a parseable address", () => {
    expect(isBlockedIpAddress("not-an-ip")).toBe(true);
    expect(isBlockedIpAddress("")).toBe(true);
  });
});

describe("isBlockedHostname", () => {
  it("blocks loopback and internal-only suffixes", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("api.localhost")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
    expect(isBlockedHostname("db.internal")).toBe(true);
  });

  it("allows a normal public hostname", () => {
    expect(isBlockedHostname("hooks.example.com")).toBe(false);
  });

  it("checks bare IP literals directly", () => {
    expect(isBlockedHostname("169.254.169.254")).toBe(true);
    expect(isBlockedHostname("93.184.216.34")).toBe(false);
  });
});

describe("parseOutboundWebhookUrl", () => {
  it("accepts a plain https URL on a public host", () => {
    expect(parseOutboundWebhookUrl("https://hooks.example.com/kb")?.hostname).toBe(
      "hooks.example.com",
    );
  });

  it("rejects non-https schemes", () => {
    expect(parseOutboundWebhookUrl("http://hooks.example.com/kb")).toBeNull();
    expect(parseOutboundWebhookUrl("file:///etc/passwd")).toBeNull();
  });

  it("rejects embedded credentials", () => {
    expect(parseOutboundWebhookUrl("https://user:pass@hooks.example.com/kb")).toBeNull();
  });

  it("rejects internal targets", () => {
    expect(parseOutboundWebhookUrl("https://localhost/kb")).toBeNull();
    expect(parseOutboundWebhookUrl("https://169.254.169.254/latest/meta-data")).toBeNull();
    expect(parseOutboundWebhookUrl("https://10.0.0.5/kb")).toBeNull();
    expect(parseOutboundWebhookUrl("https://[::1]/kb")).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(parseOutboundWebhookUrl("not a url")).toBeNull();
    expect(parseOutboundWebhookUrl("")).toBeNull();
  });
});
