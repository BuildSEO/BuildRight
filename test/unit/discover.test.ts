import { describe, it, expect } from "vitest";
import {
  normalizeOrigin,
  normalizeUrl,
  sameHost,
  isExcluded,
  isBlockedHost,
  parseRobotsSitemaps,
  parseSitemapXml,
  extractLinks,
  finalizeUrls,
} from "@/capture/discover";

const ORIGIN = "https://example.com";

describe("normalizeOrigin", () => {
  it("adds https and lowercases host, drops trailing slash/path", () => {
    expect(normalizeOrigin("example.com")).toBe("https://example.com");
    expect(normalizeOrigin("Example.COM/")).toBe("https://example.com");
    expect(normalizeOrigin("http://Example.com/path")).toBe("http://example.com");
  });
});

describe("normalizeUrl", () => {
  it("resolves relative against base", () => {
    expect(normalizeUrl("/about", ORIGIN)).toBe("https://example.com/about");
  });
  it("strips fragments", () => {
    expect(normalizeUrl("/p#section", ORIGIN)).toBe("https://example.com/p");
  });
  it("strips utm_* / fbclid / gclid but keeps real params (sorted)", () => {
    expect(normalizeUrl("/p?utm_source=x&b=2&a=1&fbclid=z&gclid=q", ORIGIN)).toBe(
      "https://example.com/p?a=1&b=2",
    );
  });
  it("collapses trailing slash but keeps root", () => {
    expect(normalizeUrl("/about/", ORIGIN)).toBe("https://example.com/about");
    expect(normalizeUrl("/", ORIGIN)).toBe("https://example.com/");
  });
  it("lowercases host", () => {
    expect(normalizeUrl("https://EXAMPLE.com/x", ORIGIN)).toBe("https://example.com/x");
  });
  it("returns null for non-http(s) schemes", () => {
    expect(normalizeUrl("mailto:a@b.com", ORIGIN)).toBeNull();
    expect(normalizeUrl("tel:+123", ORIGIN)).toBeNull();
    expect(normalizeUrl("javascript:void(0)", ORIGIN)).toBeNull();
  });
});

describe("sameHost", () => {
  it("matches same hostname, rejects other hosts", () => {
    expect(sameHost("https://example.com/x", ORIGIN)).toBe(true);
    expect(sameHost("https://other.com/x", ORIGIN)).toBe(false);
  });
});

describe("isExcluded", () => {
  it("excludes admin paths and asset extensions", () => {
    expect(isExcluded("https://example.com/wp-admin/edit")).toBe(true);
    expect(isExcluded("https://example.com/logout")).toBe(true);
    expect(isExcluded("https://example.com/file.pdf")).toBe(true);
    expect(isExcluded("https://example.com/img.JPG")).toBe(true);
    expect(isExcluded("https://example.com/about")).toBe(false);
  });
});

describe("isBlockedHost (SSRF guard)", () => {
  it("blocks localhost / loopback / private ranges", () => {
    for (const h of ["localhost", "127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.9", "169.254.1.1", "::1"]) {
      expect(isBlockedHost(h)).toBe(true);
    }
  });
  it("allows public hosts", () => {
    expect(isBlockedHost("example.com")).toBe(false);
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("172.32.0.1")).toBe(false); // just outside private range
  });
});

describe("parseRobotsSitemaps", () => {
  it("extracts Sitemap directives (case-insensitive)", () => {
    const robots = "User-agent: *\nDisallow:\nSitemap: https://example.com/sitemap.xml\nsitemap: https://example.com/news.xml";
    expect(parseRobotsSitemaps(robots)).toEqual([
      "https://example.com/sitemap.xml",
      "https://example.com/news.xml",
    ]);
  });
});

describe("parseSitemapXml", () => {
  it("parses a <urlset>", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://example.com/a</loc></url><url><loc>https://example.com/b</loc></url></urlset>`;
    expect(parseSitemapXml(xml)).toEqual({
      pageUrls: ["https://example.com/a", "https://example.com/b"],
      sitemapUrls: [],
    });
  });
  it("parses a <sitemapindex> (nested sitemaps)", () => {
    const xml = `<?xml version="1.0"?><sitemapindex><sitemap><loc>https://example.com/sm1.xml</loc></sitemap><sitemap><loc>https://example.com/sm2.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemapXml(xml)).toEqual({
      pageUrls: [],
      sitemapUrls: ["https://example.com/sm1.xml", "https://example.com/sm2.xml"],
    });
  });
  it("handles a single-entry urlset (parser returns object, not array)", () => {
    const xml = `<?xml version="1.0"?><urlset><url><loc>https://example.com/only</loc></url></urlset>`;
    expect(parseSitemapXml(xml).pageUrls).toEqual(["https://example.com/only"]);
  });
});

describe("extractLinks", () => {
  it("returns raw href values", () => {
    const html = `<a href="/a">A</a><a href="https://example.com/b">B</a><a>no href</a>`;
    expect(extractLinks(html)).toEqual(["/a", "https://example.com/b"]);
  });
});

describe("finalizeUrls", () => {
  it("normalizes, filters off-host + excluded, dedupes, and caps", () => {
    const raw = [
      "https://example.com/a",
      "https://example.com/a/", // dup after normalization
      "https://example.com/a?utm_source=x", // dup after stripping tracking
      "https://other.com/b", // off-host
      "https://example.com/file.pdf", // excluded asset
      "https://example.com/b",
      "https://example.com/c",
    ];
    expect(finalizeUrls(raw, ORIGIN, 2)).toEqual([
      "https://example.com/a",
      "https://example.com/b",
    ]);
  });
});
