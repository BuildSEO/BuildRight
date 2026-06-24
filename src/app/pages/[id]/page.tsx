"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HttpStatusBadge } from "@/components/http-status-badge";

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

function formatBytes(n: number | null): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

export default function PageViewer() {
  const params = useParams<{ id: string }>();
  const pageId = params.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => api.getPage(pageId),
    enabled: Boolean(pageId),
  });

  if (isLoading) {
    return <main className="mx-auto max-w-6xl px-6 py-10 text-muted-foreground text-sm">Loading…</main>;
  }
  if (isError || !data) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-10 text-sm text-red-600">
        {error instanceof Error ? error.message : "Page not found"}
      </main>
    );
  }

  const headings = data.headings ?? {};
  const schema = data.schema ?? [];
  const links = data.links ?? [];

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Top bar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={`/snapshots/${data.snapshotId}`}
            className="text-muted-foreground text-sm hover:underline"
          >
            ← Back
          </Link>
          <a
            href={data.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-sm font-medium hover:underline"
          >
            {data.url}
          </a>
        </div>
        <div className="flex items-center gap-2">
          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={api.screenshotUrl(data.id)}
            download
          >
            Download WebP
          </a>
          {data.pdfPath && (
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={api.pdfUrl(data.id)}
              download
            >
              Download PDF
            </a>
          )}
        </div>
      </div>

      {/* Metadata row */}
      <dl className="bg-muted/30 mb-6 grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-4">
        <Meta label="Dimensions">
          {data.width && data.height ? `${data.width}×${data.height}` : "—"}
        </Meta>
        <Meta label="File size">{formatBytes(data.fileSizeBytes)}</Meta>
        <Meta label="Captured">
          {data.capturedAt ? new Date(data.capturedAt).toLocaleString() : "—"}
        </Meta>
        <Meta label="HTTP status">
          <HttpStatusBadge code={data.httpStatus} />
        </Meta>
      </dl>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Full-page screenshot — full width, natural page scroll */}
        <div className="rounded-lg border p-2">
          {data.screenshotPath ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={api.screenshotUrl(data.id)} alt={data.title ?? data.url} className="w-full" />
          ) : (
            <p className="text-muted-foreground p-8 text-center text-sm">
              No screenshot {data.error ? `— ${data.error}` : ""}
            </p>
          )}
        </div>

        {/* Extracted data panel */}
        <aside className="space-y-5 text-sm">
          <section>
            <h2 className="mb-1 font-medium">SEO</h2>
            <dl className="space-y-1.5">
              <Meta label="Title">{data.title ?? "—"}</Meta>
              <Meta label="Meta description">{data.metaDescription ?? "—"}</Meta>
              <Meta label="Canonical">{data.canonical ?? "—"}</Meta>
              <Meta label="Meta robots">{data.metaRobots ?? "—"}</Meta>
              <Meta label="Word count">{data.wordCount ?? "—"}</Meta>
            </dl>
          </section>

          <section>
            <h2 className="mb-1 font-medium">Headings</h2>
            {HEADING_TAGS.some((t) => (headings[t]?.length ?? 0) > 0) ? (
              <div className="space-y-1.5">
                {HEADING_TAGS.map((tag) => {
                  const items = headings[tag] ?? [];
                  if (items.length === 0) return null;
                  return (
                    <div key={tag}>
                      <span className="text-muted-foreground text-xs uppercase">{tag}</span>
                      <ul className="list-disc pl-5">
                        {items.map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
          </section>

          <section>
            <h2 className="mb-1 font-medium">JSON-LD schema ({schema.length})</h2>
            {schema.length === 0 ? (
              <p className="text-muted-foreground">—</p>
            ) : (
              <div className="space-y-2">
                {schema.map((block, i) => (
                  <pre key={i} className="bg-muted overflow-x-auto rounded p-2 text-xs">
                    {JSON.stringify(block, null, 2)}
                  </pre>
                ))}
              </div>
            )}
          </section>

          <section>
            <h2 className="mb-1 font-medium">Links ({links.length})</h2>
            {links.length === 0 ? (
              <p className="text-muted-foreground">—</p>
            ) : (
              <ul className="space-y-1.5">
                {links.map((l, i) => (
                  <li key={i} className="border-b pb-1.5">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="shrink-0">
                        {l.internal ? "internal" : "external"}
                      </Badge>
                      <span className="truncate">{l.anchor || "(no anchor)"}</span>
                    </div>
                    <div className="text-muted-foreground truncate text-xs">{l.href}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
