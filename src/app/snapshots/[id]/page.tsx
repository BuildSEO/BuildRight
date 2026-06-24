"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, RefreshCw, Trash2 } from "lucide-react";
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
  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const refreshAfterChange = () => {
    void queryClient.invalidateQueries({ queryKey: ["snapshot", snapshotId] });
    void queryClient.invalidateQueries({ queryKey: ["snapshot-pages", snapshotId] });
  };

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

  const recaptureMutation = useMutation({
    mutationFn: (pageIds: string[]) => api.recapturePages(snapshotId, pageIds),
    onSuccess: (r) => {
      toast.success(`Re-fetching ${r.requeued} page${r.requeued === 1 ? "" : "s"}…`);
      setSelected(new Set());
      refreshAfterChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to re-fetch"),
  });

  const deletePageMutation = useMutation({
    mutationFn: (pageId: string) => api.deletePage(pageId),
    onSuccess: () => {
      toast.success("Page deleted");
      refreshAfterChange();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete page"),
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
    if (status === "done" || status === "failed" || status === "stopped") void refetchPages();
  }, [status, refetchPages]);

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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
          <div className="mb-3 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="mb-1 flex items-center gap-2">
                <h1 className="truncate text-2xl font-semibold tracking-tight">
                  {snapshot.project?.domain ?? "Snapshot"}
                </h1>
                <StatusBadge status={snapshot.status} />
              </div>
              <p className="text-muted-foreground text-sm">{snapshot.label ?? "Untitled snapshot"}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {isLive && (
                <Button variant="outline" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
                  {stopMutation.isPending ? "Stopping…" : "Stop"}
                </Button>
              )}
              <Button variant="outline" onClick={() => toast.info("Zip export is coming soon")}>
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
            <p className="text-muted-foreground mt-1.5 text-sm">
              {done}/{total} pages
              {snapshot.status === "queued" && " — queued; is the worker running? (npm run worker)"}
              {snapshot.status === "discovering" && " — discovering pages…"}
              {snapshot.status === "stopped" && " — stopped"}
              {snapshot.status === "failed" && snapshot.error && ` — ${snapshot.error}`}
            </p>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <form
              className="flex flex-1 gap-2"
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
            {selected.size > 0 && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm">
                <span className="text-muted-foreground">{selected.size} selected</span>
                <Button
                  size="sm"
                  disabled={recaptureMutation.isPending}
                  onClick={() => recaptureMutation.mutate([...selected])}
                >
                  <RefreshCw className="mr-1 size-3.5" />
                  Re-fetch
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                  Clear
                </Button>
              </div>
            )}
          </div>

          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead className="w-24">Preview</TableHead>
                  <TableHead>URL / Title</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                  <TableHead className="w-28">Captured</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pages.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground py-8 text-center text-sm">
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
                        selected={selected.has(p.id)}
                        onToggleSelect={() => toggleSelect(p.id)}
                        onToggle={() => setExpandedId(expanded ? null : p.id)}
                        onViewLinks={(url, links) => setLinksSheet({ open: true, url, links })}
                        onRefetch={() => recaptureMutation.mutate([p.id])}
                        onDelete={() => {
                          if (window.confirm("Delete this page and its screenshot?")) {
                            deletePageMutation.mutate(p.id);
                          }
                        }}
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
  selected,
  onToggle,
  onToggleSelect,
  onViewLinks,
  onRefetch,
  onDelete,
}: {
  page: PageRow;
  expanded: boolean;
  selected: boolean;
  onToggle: () => void;
  onToggleSelect: () => void;
  onViewLinks: (url: string, links: LinkItem[]) => void;
  onRefetch: () => void;
  onDelete: () => void;
}) {
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  return (
    <>
      <TableRow className="cursor-pointer" onClick={onToggle}>
        <TableCell onClick={stop}>
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            className="size-4 cursor-pointer align-middle"
            aria-label="Select page"
          />
        </TableCell>
        <TableCell>
          {page.screenshotPath ? (
            <Link href={`/pages/${page.id}`} onClick={stop} className="block">
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
        <TableCell onClick={stop} className="text-right">
          <div className="flex items-center justify-end gap-0.5">
            <Button variant="ghost" size="icon-sm" title="Re-fetch this page" onClick={onRefetch}>
              <RefreshCw className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-red-600"
              title="Delete this page"
              onClick={onDelete}
            >
              <Trash2 className="size-4" />
            </Button>
            <Button variant="ghost" size="icon-sm" title="Toggle details" onClick={onToggle}>
              {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </Button>
          </div>
        </TableCell>
      </TableRow>
      {expanded && (
        <TableRow>
          <TableCell colSpan={6} className="p-0">
            <PageExpand pageId={page.id} onViewLinks={onViewLinks} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
