"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { CompareResult } from "@/lib/compare";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function SnapshotSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { id: string; label: string }[];
  label: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground text-xs">{label}</span>
      <select
        className="border-input bg-background h-9 rounded-md border px-3 text-sm shadow-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function downloadRedirectCsv(result: CompareResult): void {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["old_url,new_url", ...result.redirects.map((r) => `${esc(r.from)},${esc(r.to ?? "")}`)];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "redirect-map.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function ComparePage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const [fromSel, setFromSel] = useState("");
  const [toSel, setToSel] = useState("");

  const projectQuery = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
    enabled: Boolean(projectId),
  });

  // Default to the two most recent snapshots (older A → newer B), derived — no effect needed.
  const snapshots = projectQuery.data?.snapshots ?? [];
  const from = fromSel || snapshots[1]?.id || "";
  const to = toSel || snapshots[0]?.id || "";

  const compareQuery = useQuery({
    queryKey: ["compare", from, to],
    queryFn: () => api.compareSnapshots(from, to),
    enabled: Boolean(from && to && from !== to),
  });

  const options = snapshots.map((s) => ({
    id: s.id,
    label: `${s.label ?? "Untitled"} · ${new Date(s.createdAt).toLocaleDateString()} · ${s.status}`,
  }));
  const result = compareQuery.data;

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link href={`/projects/${projectId}`} className="text-muted-foreground mb-4 inline-block text-sm hover:underline">
        ← Back to project
      </Link>
      <h1 className="mb-1 text-2xl font-semibold">Compare snapshots</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        Find pages that disappeared, changed, or need a redirect after a redesign.
      </p>

      <div className="mb-8 flex flex-wrap items-end gap-4">
        <SnapshotSelect label="Before (A)" value={from} onChange={setFromSel} options={options} />
        <SnapshotSelect label="After (B)" value={to} onChange={setToSel} options={options} />
      </div>

      {snapshots.length < 2 ? (
        <p className="text-muted-foreground text-sm">Capture at least two snapshots to compare.</p>
      ) : from === to && from ? (
        <p className="text-sm text-amber-600">Pick two different snapshots.</p>
      ) : compareQuery.isLoading ? (
        <p className="text-muted-foreground text-sm">Comparing…</p>
      ) : compareQuery.isError ? (
        <p className="text-sm text-red-600">
          {compareQuery.error instanceof Error ? compareQuery.error.message : "Compare failed"}
        </p>
      ) : result ? (
        <div className="space-y-10">
          {/* Disappeared */}
          <section>
            <h2 className="mb-2 font-medium">Disappeared ({result.disappeared.length})</h2>
            {result.disappeared.length === 0 ? (
              <p className="text-muted-foreground text-sm">None — every page in A still resolves in B. 🎉</p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL (in A)</TableHead>
                      <TableHead className="w-40">Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.disappeared.map((d) => (
                      <TableRow key={d.url}>
                        <TableCell className="font-mono text-xs">{d.url}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="border-transparent bg-red-100 text-red-700">
                            {d.reason === "missing" ? "missing in B" : `HTTP ${d.httpStatusInB} in B`}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Changed */}
          <section>
            <h2 className="mb-2 font-medium">Changed ({result.changed.length})</h2>
            {result.changed.length === 0 ? (
              <p className="text-muted-foreground text-sm">No tracked fields changed.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>URL</TableHead>
                      <TableHead>Changes</TableHead>
                      <TableHead className="w-28">Removed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.changed.map((c) => (
                      <TableRow key={c.url}>
                        <TableCell className="font-mono text-xs">{c.url}</TableCell>
                        <TableCell className="text-sm">
                          {c.changes.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {c.changes.map((ch) => (
                                <li key={ch.field}>
                                  <span className="font-medium">{ch.field}:</span>{" "}
                                  <span className="text-muted-foreground line-through">{ch.from ?? "∅"}</span> →{" "}
                                  {ch.to ?? "∅"}
                                </li>
                              ))}
                            </ul>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {c.removedInternalLinks} links, {c.removedSchemaTypes} schema
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>

          {/* Redirect suggestions */}
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-medium">Redirect suggestions ({result.redirects.length})</h2>
              {result.redirects.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => downloadRedirectCsv(result)}>
                  Download redirect map CSV
                </Button>
              )}
            </div>
            {result.redirects.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing to redirect.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Old (gone)</TableHead>
                      <TableHead>Suggested new</TableHead>
                      <TableHead className="w-20">Score</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {result.redirects.map((r) => (
                      <TableRow key={r.from}>
                        <TableCell className="font-mono text-xs">{r.from}</TableCell>
                        <TableCell className="font-mono text-xs">
                          {r.to ?? <span className="text-muted-foreground">no good match</span>}
                        </TableCell>
                        <TableCell className="text-muted-foreground tabular-nums">{r.score}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </section>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">Select two snapshots to compare.</p>
      )}
    </main>
  );
}
