import { createHash } from "node:crypto";
import { parse, type HTMLElement } from "node-html-parser";
import { documentHtmlToBlocks } from "@/lib/page-document";
import type { ContentBlock } from "@/lib/types";

const DEFAULT_ALLOWED_HOSTS = ["gradschool.wsu.edu"];
const FETCH_TIMEOUT_MS = 15_000;
const MAX_SOURCE_BYTES = 5_000_000;
const USER_AGENT = "wsu-gradschool-kb/1.0 (+https://github.com/gcrouch-wsu/wsu-gradschool-kb)";

export interface SourcedSection {
  sourceUrl: string;
  sourceAnchor?: string;
  headingText?: string;
  documentTitle?: string;
  defaultLabel?: string;
  retrievedAt: string;
  contentHash: string;
  blocks: ContentBlock[];
}

export function sourcedDefaultLabel(section: Pick<SourcedSection, "sourceUrl" | "headingText" | "documentTitle">): string {
  const origin = section.documentTitle || safeHostname(section.sourceUrl);
  return section.headingText ? `${origin} — ${section.headingText}` : origin;
}

function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "External source";
  }
}

export type SourcedCheckState = "unchanged" | "changed" | "anchor_missing" | "unreachable";

export function allowedSourceHosts(): string[] {
  const raw = process.env.SOURCED_CONTENT_ALLOWED_HOSTS?.trim();
  if (!raw) {
    return DEFAULT_ALLOWED_HOSTS;
  }
  return raw
    .split(",")
    .map((host) => normalizeHost(host))
    .filter(Boolean);
}

function normalizeHost(host: string): string {
  return host.trim().toLowerCase().replace(/\.$/, "");
}

export function parseAllowedSourceUrl(urlString: string): URL | null {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.port) {
    return null;
  }
  if (!allowedSourceHosts().includes(normalizeHost(url.hostname))) {
    return null;
  }
  return url;
}

function headingLevel(tag: string): number | null {
  const match = /^h([1-6])$/.exec(tag.toLowerCase());
  return match ? Number(match[1]) : null;
}

function sourceAnchorFromUrl(url: URL): string | null | undefined {
  if (!url.hash) {
    return undefined;
  }
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return null;
  }
}

// Content fetched from the source site uses relative and fragment links, and
// plain tables. Normalize so the editor sanitizer keeps the structure: hrefs
// and image sources become absolute against the source page, and tables gain
// the doc-table contract (first-row header when the source used <th>).
function normalizeSourcedFragment(fragmentHtml: string, baseUrl?: URL): string {
  const root = parse(fragmentHtml);
  if (baseUrl) {
    for (const anchor of root.querySelectorAll("a[href]")) {
      const href = anchor.getAttribute("href") ?? "";
      try {
        const nextHref = new URL(href, baseUrl);
        if (!["http:", "https:", "mailto:"].includes(nextHref.protocol)) {
          anchor.removeAttribute("href");
          continue;
        }
        anchor.setAttribute("href", nextHref.toString());
      } catch {
        anchor.removeAttribute("href");
      }
    }
    for (const img of root.querySelectorAll("img[src]")) {
      const src = img.getAttribute("src") ?? "";
      try {
        const nextSrc = new URL(src, baseUrl);
        if (!["http:", "https:"].includes(nextSrc.protocol)) {
          img.remove();
          continue;
        }
        img.setAttribute("src", nextSrc.toString());
      } catch {
        img.remove();
      }
    }
  }
  for (const table of root.querySelectorAll("table")) {
    table.setAttribute("class", "doc-table");
    const hasHeaderRow = Boolean(table.querySelector("thead th, tr:first-child th"));
    table.setAttribute("data-header-row", hasHeaderRow ? "true" : "false");
    table.setAttribute("data-header-column", "false");
  }
  return root.toString();
}

// The P&P manual renders section numbers ("3.1.1") with CSS counters — the
// heading text in the HTML is unnumbered. When the page declares that mode,
// replicate the counters structurally: count h2–h6 among the anchor's content
// siblings (the TOC lives in a separate <nav> parent, so it never counts).
function usesCssCounterNumbering(target: HTMLElement): boolean {
  let current: HTMLElement | null = target.parentNode as HTMLElement | null;
  while (current) {
    if (current.getAttribute?.("data-numbering-mode") === "css-counters") {
      return true;
    }
    current = current.parentNode as HTMLElement | null;
  }
  return false;
}

function sectionNumberFor(target: HTMLElement, level: number): string | null {
  if (!usesCssCounterNumbering(target)) {
    return null;
  }
  const counters = [0, 0, 0, 0, 0];
  const siblings = (target.parentNode as HTMLElement | null)?.childNodes ?? [];
  for (const node of siblings) {
    const siblingLevel = headingLevel((node as HTMLElement).tagName ?? "");
    if (siblingLevel !== null) {
      counters[siblingLevel - 2] += 1;
      for (let deeper = siblingLevel - 1; deeper < counters.length; deeper += 1) {
        counters[deeper] = 0;
      }
    }
    if (node === target) {
      const parts = counters.slice(0, level - 1);
      return parts.every((part) => part > 0) ? parts.join(".") : null;
    }
  }
  return null;
}

function documentTitleFrom(root: HTMLElement): string | undefined {
  const h1 = root.querySelector("h1")?.text.trim();
  if (h1) {
    return h1;
  }
  const title = root.querySelector("title")?.text.split("|")[0].trim();
  return title || undefined;
}

export function extractSourcedSectionFromHtml(
  pageHtml: string,
  anchor: string,
  baseUrl?: URL,
): { headingText: string; fragmentHtml: string; documentTitle?: string } | null {
  const root = parse(pageHtml);
  const target = root.querySelectorAll("[id]").find((node) => node.getAttribute("id") === anchor);
  if (!target) {
    return null;
  }
  const level = headingLevel(target.tagName ?? "");
  if (level === null) {
    return null;
  }
  const siblings = (target.parentNode as HTMLElement | null)?.childNodes ?? [];
  const collected: string[] = [];
  let started = false;
  for (const node of siblings) {
    if (node === target) {
      started = true;
      continue;
    }
    if (!started) {
      continue;
    }
    const element = node as HTMLElement;
    const tag = element.tagName?.toLowerCase();
    if (tag) {
      const siblingLevel = headingLevel(tag);
      if (siblingLevel !== null && siblingLevel <= level) {
        break;
      }
      collected.push(element.outerHTML);
    } else if (node.text?.trim()) {
      collected.push(node.text);
    }
  }
  const sectionNumber = sectionNumberFor(target, level);
  const text = target.text.trim();
  return {
    headingText: sectionNumber ? `${sectionNumber} ${text}` : text,
    fragmentHtml: normalizeSourcedFragment(collected.join("\n"), baseUrl),
    documentTitle: documentTitleFrom(root),
  };
}

// Hash the section's content, not its serialization accidents: block ids are
// re-minted on every parse, so they are stripped before hashing.
export function hashSourcedBlocks(blocks: ContentBlock[]): string {
  const stripIds = (list: ContentBlock[]): unknown[] =>
    list.map((block) => {
      const { blockId: _blockId, ...rest } = block as ContentBlock & { blockId: string };
      const clone: Record<string, unknown> = { ...rest };
      if ("blocks" in clone && Array.isArray(clone.blocks)) {
        clone.blocks = stripIds(clone.blocks as ContentBlock[]);
      }
      return clone;
    });
  return createHash("sha256").update(JSON.stringify(stripIds(blocks))).digest("hex");
}

export function buildSourcedFromPastedHtml(
  pastedHtml: string,
  sourceUrl: string,
  headingText?: string,
): SourcedSection | null {
  const url = parseAllowedSourceUrl(sourceUrl);
  if (!url || !pastedHtml.trim()) {
    return null;
  }
  const sourceAnchor = sourceAnchorFromUrl(url);
  if (sourceAnchor === null) {
    return null;
  }
  const blocks = documentHtmlToBlocks(normalizeSourcedFragment(pastedHtml, url));
  const section: SourcedSection = {
    sourceUrl: `${url.origin}${url.pathname}`,
    sourceAnchor,
    headingText: headingText?.trim() || undefined,
    retrievedAt: new Date().toISOString(),
    contentHash: hashSourcedBlocks(blocks),
    blocks,
  };
  section.defaultLabel = sourcedDefaultLabel(section);
  return section;
}

async function readTextWithinLimit(response: Response): Promise<string | null> {
  const contentLength = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > MAX_SOURCE_BYTES) {
    return null;
  }
  if (!response.body) {
    const body = await response.text();
    return new TextEncoder().encode(body).byteLength > MAX_SOURCE_BYTES ? null : body;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (!value) {
        continue;
      }
      totalBytes += value.byteLength;
      if (totalBytes > MAX_SOURCE_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(buffer);
}

async function fetchSourcePage(url: URL): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${url.origin}${url.pathname}`, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
      redirect: "manual",
      signal: controller.signal,
    });
    if (!response.ok) {
      return null;
    }
    return await readTextWithinLimit(response);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSourcedSection(urlString: string): Promise<
  | { ok: true; section: SourcedSection }
  | { ok: false; reason: "invalid_url" | "missing_anchor" | "unreachable" | "anchor_missing" }
> {
  const url = parseAllowedSourceUrl(urlString);
  if (!url) {
    return { ok: false, reason: "invalid_url" };
  }
  const anchor = sourceAnchorFromUrl(url);
  if (anchor === null) {
    return { ok: false, reason: "invalid_url" };
  }
  if (!anchor) {
    return { ok: false, reason: "missing_anchor" };
  }
  const pageHtml = await fetchSourcePage(url);
  if (pageHtml === null) {
    return { ok: false, reason: "unreachable" };
  }
  const extracted = extractSourcedSectionFromHtml(pageHtml, anchor, url);
  if (!extracted) {
    return { ok: false, reason: "anchor_missing" };
  }
  const blocks = documentHtmlToBlocks(extracted.fragmentHtml);
  const section: SourcedSection = {
    sourceUrl: `${url.origin}${url.pathname}`,
    sourceAnchor: anchor,
    headingText: extracted.headingText,
    documentTitle: extracted.documentTitle,
    retrievedAt: new Date().toISOString(),
    contentHash: hashSourcedBlocks(blocks),
    blocks,
  };
  section.defaultLabel = sourcedDefaultLabel(section);
  return { ok: true, section };
}

export async function checkSourcedSection(
  sourceUrl: string,
  sourceAnchor: string | undefined,
  storedHash: string | undefined,
): Promise<SourcedCheckState> {
  if (!sourceAnchor || !storedHash) {
    return "changed";
  }
  const withAnchor = `${sourceUrl}#${sourceAnchor}`;
  const result = await fetchSourcedSection(withAnchor);
  if (!result.ok) {
    return result.reason === "anchor_missing" ? "anchor_missing" : "unreachable";
  }
  return result.section.contentHash === storedHash ? "unchanged" : "changed";
}
