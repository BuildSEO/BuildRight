/**
 * Snapshot comparison logic (pure — no DB). Diffs two snapshots of the same site by URL into
 * three reports: Disappeared, Changed, and Redirect suggestions (token-overlap similarity).
 */

export interface ComparePage {
  url: string;
  httpStatus: number | null;
  title: string | null;
  h1: string | null;
  metaRobots: string | null;
  canonical: string | null;
  internalLinks: string[];
  schemaTypes: string[];
}

export interface FieldChange {
  field: "title" | "h1" | "metaRobots" | "canonical";
  from: string | null;
  to: string | null;
}

export interface DisappearedRow {
  url: string;
  reason: "missing" | "error";
  httpStatusInB: number | null;
}

export interface ChangedRow {
  url: string;
  changes: FieldChange[];
  removedInternalLinks: number;
  removedSchemaTypes: number;
}

export interface RedirectRow {
  from: string;
  to: string | null;
  score: number;
}

export interface CompareResult {
  disappeared: DisappearedRow[];
  changed: ChangedRow[];
  redirects: RedirectRow[];
}

const REDIRECT_MIN_SCORE = 0.1;
const COMPARED_FIELDS: ReadonlyArray<FieldChange["field"]> = ["title", "h1", "metaRobots", "canonical"];

/** A page "survives" in B if it was captured with a non-error status. */
function isOk(page: ComparePage): boolean {
  return page.httpStatus !== null && page.httpStatus < 400;
}

export function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const x of a) if (b.has(x)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/** Extract internal link hrefs from a parsed `links` JSON value. */
export function internalLinksFrom(links: unknown): string[] {
  if (!Array.isArray(links)) return [];
  const out: string[] = [];
  for (const l of links) {
    if (l && typeof l === "object") {
      const rec = l as Record<string, unknown>;
      if (rec.internal === true && typeof rec.href === "string") out.push(rec.href);
    }
  }
  return out;
}

/** Extract the set of JSON-LD @type values from a parsed `schema` JSON value. */
export function schemaTypesFrom(schema: unknown): string[] {
  if (!Array.isArray(schema)) return [];
  const types = new Set<string>();
  for (const block of schema) {
    if (block && typeof block === "object") {
      const t = (block as Record<string, unknown>)["@type"];
      if (typeof t === "string") types.add(t);
      else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") types.add(x);
    }
  }
  return [...types];
}

export function compareSnapshots(from: ComparePage[], to: ComparePage[]): CompareResult {
  const fromByUrl = new Map(from.map((p) => [p.url, p]));
  const toByUrl = new Map(to.map((p) => [p.url, p]));
  const survivingB = to.filter(isOk);

  const disappeared: DisappearedRow[] = [];
  for (const a of from) {
    const b = toByUrl.get(a.url);
    if (!b) disappeared.push({ url: a.url, reason: "missing", httpStatusInB: null });
    else if (!isOk(b)) disappeared.push({ url: a.url, reason: "error", httpStatusInB: b.httpStatus });
  }

  const changed: ChangedRow[] = [];
  for (const a of from) {
    const b = toByUrl.get(a.url);
    if (!b || !isOk(b)) continue; // disappeared, handled above
    const changes: FieldChange[] = [];
    for (const field of COMPARED_FIELDS) {
      const av = a[field] ?? null;
      const bv = b[field] ?? null;
      if (av !== bv) changes.push({ field, from: av, to: bv });
    }
    const bLinks = new Set(b.internalLinks);
    const removedInternalLinks = a.internalLinks.filter((l) => !bLinks.has(l)).length;
    const bTypes = new Set(b.schemaTypes);
    const removedSchemaTypes = a.schemaTypes.filter((t) => !bTypes.has(t)).length;
    if (changes.length > 0 || removedInternalLinks > 0 || removedSchemaTypes > 0) {
      changed.push({ url: a.url, changes, removedInternalLinks, removedSchemaTypes });
    }
  }

  const redirects: RedirectRow[] = disappeared.map((d) => {
    const a = fromByUrl.get(d.url);
    const aTokens = tokenize(`${a?.title ?? ""} ${a?.h1 ?? ""}`);
    let best: { url: string; score: number } | null = null;
    for (const cand of survivingB) {
      const score = jaccard(aTokens, tokenize(`${cand.title ?? ""} ${cand.h1 ?? ""}`));
      if (!best || score > best.score) best = { url: cand.url, score };
    }
    return {
      from: d.url,
      to: best && best.score >= REDIRECT_MIN_SCORE ? best.url : null,
      score: best ? Math.round(best.score * 100) / 100 : 0,
    };
  });

  return { disappeared, changed, redirects };
}
