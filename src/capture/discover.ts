/**
 * URL discovery for a domain: sitemap-first, crawl fallback.
 *
 * Design (Phase 0): pure functions (parsing, normalization, filtering) are split from the
 * network IO so the hard logic is unit-testable without a network. Every fetch is wrapped in
 * try/catch and logged; a sitemap failure degrades to a crawl rather than throwing.
 */

import { gunzipSync } from "node:zlib";
import { XMLParser } from "fast-xml-parser";
import { parse as parseHtml } from "node-html-parser";
import { logger } from "@/lib/logger";

export interface DiscoverOptions {
  mode: "sitemap" | "crawl";
  maxPages: number;
}

const USER_AGENT =
  "BuildRight-SEO-Snapshot/0.1 (+https://github.com/BuildSEO/BuildRight)";
const FETCH_TIMEOUT_MS = 10_000;
const MAX_SITEMAPS = 50; // bound sitemap-index fan-out / recursion
const TRACKING_PARAM_EXACT = new Set(["fbclid", "gclid", "gclsrc", "dclid", "msclkid", "mc_eid"]);

/** Path fragments that never represent archivable content. */
export const DEFAULT_EXCLUDE_PATTERNS: readonly string[] = [
  "/wp-admin",
  "/wp-login",
  "/logout",
  "/cart",
  "/checkout",
];

/** File extensions that are assets, not pages. */
export const DEFAULT_EXCLUDE_EXTENSIONS: readonly string[] = [
  ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".svg", ".webp", ".ico", ".bmp",
  ".css", ".js", ".mjs", ".json", ".xml", ".rss", ".txt",
  ".zip", ".gz", ".tar", ".rar", ".7z",
  ".mp4", ".webm", ".mov", ".mp3", ".wav",
  ".woff", ".woff2", ".ttf", ".eot",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
];

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (unit-tested)
// ─────────────────────────────────────────────────────────────────────────────

function toArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [v];
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function toMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** Normalize a user-supplied domain to a base origin: https://, lowercase host, no trailing slash/path. */
export function normalizeOrigin(domain: string): string {
  const trimmed = domain.trim();
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const u = new URL(withScheme);
  u.hostname = u.hostname.toLowerCase();
  return `${u.protocol}//${u.host}`;
}

/**
 * Canonicalize a URL: resolve relative→absolute, http(s) only, lowercase host, drop #fragment,
 * strip tracking params (utm_*, fbclid, gclid, …), sort remaining params, collapse trailing slash.
 * Returns null for unparseable or non-http(s) URLs (e.g. mailto:, tel:, javascript:).
 */
export function normalizeUrl(raw: string, base: string): string | null {
  let u: URL;
  try {
    u = new URL(raw, base);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;

  u.hash = "";
  u.hostname = u.hostname.toLowerCase();

  const kept: Array<[string, string]> = [];
  for (const [key, value] of u.searchParams.entries()) {
    const k = key.toLowerCase();
    if (k.startsWith("utm_") || TRACKING_PARAM_EXACT.has(k)) continue;
    kept.push([key, value]);
  }
  kept.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  u.search = "";
  for (const [k, v] of kept) u.searchParams.append(k, v);

  if (u.pathname.length > 1 && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.replace(/\/+$/, "");
  }
  return u.toString();
}

/** Same registrable host (ignores scheme/port differences for discovery robustness). */
export function sameHost(url: string, base: string): boolean {
  try {
    return new URL(url).hostname === new URL(base).hostname;
  } catch {
    return false;
  }
}

/** True if the URL is an asset or an obvious non-content path. */
export function isExcluded(
  url: string,
  patterns: readonly string[] = DEFAULT_EXCLUDE_PATTERNS,
  extensions: readonly string[] = DEFAULT_EXCLUDE_EXTENSIONS,
): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  const path = u.pathname.toLowerCase();
  if (patterns.some((p) => path.includes(p))) return true;
  if (extensions.some((ext) => path.endsWith(ext))) return true;
  return false;
}

/** SSRF guard: block localhost, loopback, link-local and private IP ranges (http(s) public only). */
export function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
  }
  return false;
}

/** Extract Sitemap: directives from robots.txt. */
export function parseRobotsSitemaps(robotsTxt: string): string[] {
  const out: string[] = [];
  for (const line of robotsTxt.split(/\r?\n/)) {
    const m = line.match(/^\s*sitemap:\s*(\S+)\s*$/i);
    if (m && m[1]) out.push(m[1]);
  }
  return out;
}

function locOf(entry: unknown): string | null {
  if (typeof entry === "string") return entry.trim() || null;
  const rec = asRecord(entry);
  const loc = rec?.["loc"];
  if (typeof loc === "string") return loc.trim() || null;
  if (typeof loc === "number") return String(loc);
  return null;
}

/** Parse a sitemap. Detects <urlset> (page URLs) vs <sitemapindex> (nested sitemap URLs). */
export function parseSitemapXml(xml: string): { pageUrls: string[]; sitemapUrls: string[] } {
  const parser = new XMLParser({ ignoreAttributes: true, trimValues: true });
  const doc = asRecord(parser.parse(xml));
  const pageUrls: string[] = [];
  const sitemapUrls: string[] = [];

  const urlset = asRecord(doc?.["urlset"]);
  if (urlset && urlset["url"] !== undefined) {
    for (const u of toArray(urlset["url"])) {
      const loc = locOf(u);
      if (loc) pageUrls.push(loc);
    }
  }
  const index = asRecord(doc?.["sitemapindex"]);
  if (index && index["sitemap"] !== undefined) {
    for (const s of toArray(index["sitemap"])) {
      const loc = locOf(s);
      if (loc) sitemapUrls.push(loc);
    }
  }
  return { pageUrls, sitemapUrls };
}

/** Extract raw href values from an HTML document. */
export function extractLinks(html: string): string[] {
  const root = parseHtml(html);
  const out: string[] = [];
  for (const a of root.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href");
    if (href) out.push(href);
  }
  return out;
}

/** Pure pipeline: normalize → http(s)+same-host → not-excluded → dedupe → cap. */
export function finalizeUrls(raw: string[], origin: string, maxPages: number): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    const norm = normalizeUrl(r, origin);
    if (!norm) continue;
    if (!sameHost(norm, origin)) continue;
    if (isExcluded(norm)) continue;
    if (seen.has(norm)) continue;
    seen.add(norm);
    out.push(norm);
    if (out.length >= maxPages) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Network IO (thin wrappers, try/catch + logger)
// ─────────────────────────────────────────────────────────────────────────────

async function fetchText(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { "user-agent": USER_AGENT, accept: "*/*" },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    if (url.toLowerCase().endsWith(".gz")) {
      const buf = Buffer.from(await res.arrayBuffer());
      return gunzipSync(buf).toString("utf8");
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function findSitemapEntryPoints(origin: string): Promise<string[]> {
  const entries = new Set<string>();
  try {
    const robots = await fetchText(`${origin}/robots.txt`);
    for (const sm of parseRobotsSitemaps(robots)) entries.add(sm);
  } catch (e) {
    logger.warn("discover: robots.txt fetch failed", { origin, error: toMessage(e) });
  }
  if (entries.size === 0) entries.add(`${origin}/sitemap.xml`);
  return [...entries];
}

async function collectSitemapUrls(origin: string, maxPages: number): Promise<string[]> {
  const queue = await findSitemapEntryPoints(origin);
  const seenSitemaps = new Set<string>();
  const pageUrls: string[] = [];

  while (queue.length > 0 && pageUrls.length < maxPages && seenSitemaps.size < MAX_SITEMAPS) {
    const sitemapUrl = queue.shift();
    if (!sitemapUrl || seenSitemaps.has(sitemapUrl)) continue;
    seenSitemaps.add(sitemapUrl);

    let xml: string;
    try {
      xml = await fetchText(sitemapUrl);
    } catch (e) {
      logger.warn("discover: sitemap fetch failed", { sitemapUrl, error: toMessage(e) });
      continue;
    }
    try {
      const { pageUrls: pages, sitemapUrls: children } = parseSitemapXml(xml);
      pageUrls.push(...pages);
      for (const child of children) {
        if (!seenSitemaps.has(child)) queue.push(child);
      }
    } catch (e) {
      logger.warn("discover: sitemap parse failed", { sitemapUrl, error: toMessage(e) });
    }
  }
  return pageUrls;
}

async function crawl(origin: string, maxPages: number): Promise<string[]> {
  const start = normalizeUrl(`${origin}/`, origin) ?? origin;
  const seen = new Set<string>([start]);
  const queue: string[] = [start];
  const found: string[] = [];
  const maxFetches = Math.max(maxPages * 3, 50); // safety valve against crawl traps
  let fetches = 0;

  while (queue.length > 0 && found.length < maxPages && fetches < maxFetches) {
    const url = queue.shift();
    if (!url) continue;
    found.push(url);

    let html: string;
    try {
      html = await fetchText(url);
      fetches += 1;
    } catch (e) {
      logger.warn("discover: crawl fetch failed", { url, error: toMessage(e) });
      continue;
    }
    for (const href of extractLinks(html)) {
      const norm = normalizeUrl(href, origin);
      if (!norm || seen.has(norm)) continue;
      if (!sameHost(norm, origin) || isExcluded(norm)) continue;
      seen.add(norm);
      queue.push(norm);
    }
  }
  return found;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Discover the page URLs to capture for a domain.
 * Sitemap-first; falls back to a same-origin crawl when sitemap mode yields nothing.
 */
export async function discoverUrls(domain: string, opts: DiscoverOptions): Promise<string[]> {
  const origin = normalizeOrigin(domain);
  const host = new URL(origin).hostname;
  if (isBlockedHost(host)) {
    throw new Error(`Refusing to discover internal/blocked host: ${host}`);
  }

  const { mode, maxPages } = opts;
  let raw: string[] = [];

  if (mode === "sitemap") {
    try {
      raw = await collectSitemapUrls(origin, maxPages);
    } catch (e) {
      logger.warn("discover: sitemap mode failed", { origin, error: toMessage(e) });
      raw = [];
    }
    if (raw.length === 0) {
      logger.warn("discover: sitemap yielded no URLs — falling back to crawl", { origin });
      raw = await crawl(origin, maxPages);
    }
  } else {
    raw = await crawl(origin, maxPages);
  }

  const result = finalizeUrls(raw, origin, maxPages);
  logger.info("discover: complete", { origin, mode, discovered: result.length });
  return result;
}
