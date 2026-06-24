import { describe, it, expect } from "vitest";
import {
  tokenize,
  jaccard,
  internalLinksFrom,
  schemaTypesFrom,
  compareSnapshots,
  type ComparePage,
} from "@/lib/compare";

function page(url: string, over: Partial<ComparePage> = {}): ComparePage {
  return {
    url,
    httpStatus: 200,
    title: null,
    h1: null,
    metaRobots: null,
    canonical: null,
    internalLinks: [],
    schemaTypes: [],
    ...over,
  };
}

describe("tokenize / jaccard", () => {
  it("tokenizes to lowercase words >2 chars", () => {
    expect([...tokenize("The Big Red Fox!")]).toEqual(["the", "big", "red", "fox"]);
  });
  it("computes overlap similarity", () => {
    expect(jaccard(tokenize("blue widget pricing"), tokenize("widget pricing plans"))).toBeCloseTo(2 / 4);
    expect(jaccard(tokenize("abc"), new Set())).toBe(0);
  });
});

describe("internalLinksFrom / schemaTypesFrom", () => {
  it("keeps only internal hrefs", () => {
    expect(
      internalLinksFrom([
        { href: "/a", anchor: "", internal: true },
        { href: "https://x.com", anchor: "", internal: false },
      ]),
    ).toEqual(["/a"]);
    expect(internalLinksFrom(null)).toEqual([]);
  });
  it("extracts @type values (string + array)", () => {
    expect(schemaTypesFrom([{ "@type": "Organization" }, { "@type": ["Article", "BlogPosting"] }])).toEqual([
      "Organization",
      "Article",
      "BlogPosting",
    ]);
  });
});

describe("compareSnapshots", () => {
  const A = [
    page("https://s.com/", { title: "Home", h1: "Welcome", internalLinks: ["/a", "/b"], schemaTypes: ["Organization"] }),
    page("https://s.com/gone", { title: "Old Pricing Plans", h1: "Pricing" }),
    page("https://s.com/changed", { title: "About", h1: "About Us", metaRobots: "index,follow" }),
  ];
  const B = [
    page("https://s.com/", { title: "Home", h1: "Welcome", internalLinks: ["/a"], schemaTypes: [] }),
    page("https://s.com/changed", { title: "About", h1: "About Us", metaRobots: "noindex,follow" }),
    page("https://s.com/pricing", { title: "Pricing Plans", h1: "Pricing" }),
  ];

  const result = compareSnapshots(A, B);

  it("flags disappeared URLs (missing in B)", () => {
    expect(result.disappeared.map((d) => d.url)).toContain("https://s.com/gone");
  });

  it("detects field changes + removed links/schema", () => {
    const home = result.changed.find((c) => c.url === "https://s.com/");
    expect(home?.removedInternalLinks).toBe(1); // /b removed
    expect(home?.removedSchemaTypes).toBe(1); // Organization removed
    const about = result.changed.find((c) => c.url === "https://s.com/changed");
    expect(about?.changes.some((ch) => ch.field === "metaRobots")).toBe(true);
  });

  it("suggests the closest surviving URL for a disappeared page", () => {
    const r = result.redirects.find((x) => x.from === "https://s.com/gone");
    expect(r?.to).toBe("https://s.com/pricing"); // best title/h1 token overlap
  });

  it("treats a 4xx/5xx page in B as disappeared", () => {
    const res = compareSnapshots([page("https://s.com/x", { title: "X" })], [page("https://s.com/x", { httpStatus: 404 })]);
    expect(res.disappeared).toEqual([{ url: "https://s.com/x", reason: "error", httpStatusInB: 404 }]);
  });
});
