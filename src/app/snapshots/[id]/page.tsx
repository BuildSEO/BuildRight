"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { api, type PageRow } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { StatusBadge } from "@/components/status-badge";
import { HttpStatusBadge } from "@/components/http-status-badge";

type LinkItem = { href: string; anchor: string; internal: boolean };
type LinksSheetState = { open: boolean; url: string; links: LinkItem[] };

function schemaType(block: unknown): string {
  if (block && typeof block === "object") {
    const t = (block as Record<string, unknown>)["@type"];
    if (Array.isArray(t)) return t.map(String).join(", ");
    if (typeof t === "string") return t;
  }
  return "schema";
}

function formatTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString() : "—";
}

function PageExpand({
  pageId,
  onViewLinks,
}: {
  pageId: string;
  onViewLinks: (url: string, links: LinkItem[]) => void;
}) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["page", pageId],
    queryFn: () => api.getPage(pageId),
  });

  if (isLoading) return <div className="text-muted-foreground p-4 text-sm">Loading details…</div>;
  if (isError || !data) return <div className="p-4 text-sm text-red-600">Failed to load details</div>;

  const links = data.links ?? [];
  const schema = data.schema ?? [];

  return (
    <div className="bg-muted/30 space-y-3 p-4 text-sm">
      <div>
        <span className="font-medium">Title:</span> {data.title ?? "—"}
      </div>
      <div>
        <span className="font-medium">H1:</span> {data.h1 ?? "—"}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="font-medium">Schema:</span>{" "}
        {schema.length === 0 ? (
          "—"
        ) : (
          schema.map((s, i) => (
            <Badge key={i} variant="outline">
              {schemaType(s)}
            </Badge>
          ))
        )}
      </div>
      <div>
        <span className="font-medium">Links ({links.length}):</span>
        <ul className="text-muted-foreground mt-1 space-y-0.5">
          {links.slice(0, 5).map((l, i) => (
            <li key={i} className="truncate">
              {l.internal ? "↳" : "↗"} {l.href}
            </li>
          ))}
        </ul>
        {links.length > 5 && (
          <Button variant="link" className="h-auto p-0" onClick={() => onViewLinks(data.url, links)}>
            View all {links.length} links
          </Button>
        )}
      </div>
    </div>
  );
}

export default function SnapshotPage() {
  const params = useParams<{ id: string }>();
  const snapshotId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linksSheet, setLinksSheet] = useState<LinksSheetState>({ open: false, url: "", links: [] });

  const snapshotQuery = useQuery({
    queryKey: ["snapshot", snapshotId],
    queryFn: () => api.getSnapshot(snapshotId),
    enabled: Boolean(snapshotId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      return s === "done" || s === "failed" || s === "stopped" ? false : 2000;
    },
  });

  const status = snapshotQuery.data?.status;
  const isLive =
    status !== undefined && status !== "done" && status !== "failed" && status !== "stopped";

  const stopMutation = useMutation({
    mutationFn: () => api.stopSnapshot(snapshotId),
    onSuccess: () => {
      toast.success("Snapshot stopped");
      void snapshotQuery.refetch();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to stop"),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.deleteSnapshot(snapshotId),
    onSuccess: () => {
      toast.success("Snapshot deleted");
      const projectId = snapshotQuery.data?.project?.id;
      if (projectId) void queryClient.invalidateQueries({ queryKey: ["project", projectId] });
      router.push(projectId ? `/projects/${projectId}` : "/");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete"),
  });

  const pagesQuery = useQuery({
    queryKey: ["snapshot-pages", snapshotId, search],
    queryFn: () => api.listPages(snapshotId, { search: search || undefined, take: 200 }),
    enabled: Boolean(snapshotId),
    refetchInterval: isLive ? 2000 : false,
  });

  // One final refresh when the run finishes, so the last captured rows show up.
  const refetchPages = pagesQuery.refetch;
  useEffect(() => {
    if (status === "done" || status === "failed") void refetchPages();
  }, [status, refetchPages]);

  const snapshot = snapshotQuery.data;
  const pages = pagesQuery.data?.pages ?? [];
  const total = snapshot?.totalPages ?? 0;
  const done = snapshot?.donePages ?? 0;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-10">
      {snapshot?.project && (
        <Link
          href={`/projects/${snapshot.project.id}`}
          className="text-muted-foreground mb-4 inline-block text-sm hover:underline"
        >
          ← {snapshot.project.name}
        </Link>
      )}

      {snapshotQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : snapshotQuery.isError || !snapshot ? (
        <p className="text-sm text-red-600">Snapshot not found</p>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold">
                {snapshot.project?.domain ?? "Snapshot"}
              </h1>
              <p className="text-muted-foreground text-sm">{snapshot.label ?? "Untitled snapshot"}</p>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={snapshot.status} />
              {isLive && (
                <Button variant="outline" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
                  {stopMutation.isPending ? "Stopping…" : "Stop"}
                </Button>
              )}
              <Button variant="outline" onClick={() => toast.info("Export (zip) coming in a later phase")}>
                Export
              </Button>
              <Button
                variant="outline"
                className="text-red-600"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  if (window.confirm("Delete this snapshot and its screenshots? This cannot be undone.")) {
                    deleteMutation.mutate();
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </div>

          <div className="mb-6">
            <Progress value={pct} />
            <p className="text-muted-foreground mt-1 text-sm">
              {done}/{total} pages
              {snapshot.status === "queued" && " — queued; is the worker running? (npm run worker)"}
              {snapshot.status === "discovering" && " — discovering pages…"}
              {snapshot.status === "failed" && snapshot.error && ` — ${snapshot.error}`}
            </p>
          </div>

          <form
            className="mb-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setSearch(searchInput.trim());
            }}
          >
            <Input
              placeholder="Filter by URL or title…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
            <Button type="submit" variant="outline">
              Search
            </Button>
          </form>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">Preview</TableHead>
                  <TableHead>URL / Title</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead className="w-28">Captured</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-muted-foreground py-8 text-center text-sm">
                      {isLive ? "Waiting for captures…" : "No pages."}
                    </TableCell>
                  </TableRow>
                ) : (
                  pages.map((p: PageRow) => {
                    const expanded = expandedId === p.id;
                    return (
                      <FragmentRow
                        key={p.id}
                        page={p}
                        expanded={expanded}
                        onToggle={() => setExpandedId(expanded ? null : p.id)}
                        onViewLinks={(url, links) => setLinksSheet({ open: true, url, links })}
                      />
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <Sheet open={linksSheet.open} onOpenChange={(open) => setLinksSheet((s) => ({ ...s, open }))}>
        <SheetContent side="right" className="w-full overflow-y-auto p-4 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle className="truncate">Links — {linksSheet.url}</SheetTitle>
          </SheetHeader>
          <ul className="space-y-2 text-sm">
            {linksSheet.links.map((l, i) => (
              <li key={i} className="border-b pb-2">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{l.internal ? "internal" : "external"}</Badge>
                  <span className="truncate font-medium">{l.anchor || "(no anchor)"}</span>
                </div>
                <div className="text-muted-foreground truncate">{l.href}</div>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </main>
  );
}

function FragmentRow({
  page,
  expanded,
  onToggle,
  onViewLinks,
}: {
  page: PageRow;
  expanded: boolean;
  onToggle: () => void;
  onViewLinks: (url: string, links: LinkItem[]) => void;
}) {
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell>
          {page.screenshotPath ? (
            <Link
              href={`/pages/${page.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={api.screenshotUrl(page.id)}
                alt=""
                className="h-10 w-16 rounded border object-cover object-top"
                loading="lazy"
              />
            </Link>
          ) : (
            <div className="bg-muted text-muted-foreground flex h-10 w-16 items-center justify-center rounded border text-[10px]">
              {page.status}
            </div>
          )}
        </TableCell>
        <TableCell className="max-w-0">
          <div className="truncate font-medium">{page.title ?? "—"}</div>
          <div className="text-muted-foreground truncate text-xs">{page.url}</div>
        </TableCell>
        <TableCell>
          <HttpStatusBadge code={page.httpStatus} />
        </TableCell>
        <TableCell className="text-muted-foreground text-sm">{formatTime(page.capturedAt)}</TableCell>
        <TableCell>{expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}</TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={5} className="p-0">
            <PageExpand pageId={page.id} onViewLinks={onViewLinks} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
