"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusBadge } from "@/components/status-badge";
import { NewSnapshotDialog } from "@/components/new-snapshot-dialog";
import { Button, buttonVariants } from "@/components/ui/button";

function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "—";
}

export default function ProjectPage() {
  const params = useParams<{ id: string }>();
  const projectId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => api.getProject(projectId),
    enabled: Boolean(projectId),
  });

  const deleteProject = useMutation({
    mutationFn: () => api.deleteProject(projectId),
    onSuccess: () => {
      toast.success("Project deleted");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      router.push("/");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete project"),
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <Link href="/" className="text-muted-foreground mb-4 inline-block text-sm hover:underline">
        ← Projects
      </Link>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : isError || !data ? (
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Failed to load project"}
        </p>
      ) : (
        <>
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold">{data.name}</h1>
              <p className="text-muted-foreground text-sm">{data.domain}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href={`/projects/${data.id}/compare`}
                className={buttonVariants({ variant: "outline" })}
              >
                Compare
              </Link>
              <NewSnapshotDialog projectId={data.id} />
              <Button
                variant="outline"
                className="text-red-600"
                disabled={deleteProject.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "Delete this project, all its snapshots, and all screenshots? This cannot be undone.",
                    )
                  ) {
                    deleteProject.mutate();
                  }
                }}
              >
                Delete
              </Button>
            </div>
          </div>

          {data.snapshots.length === 0 ? (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <p className="font-medium">No snapshots yet</p>
              <p className="text-muted-foreground mb-4 text-sm">
                Run the first capture of this site.
              </p>
              <NewSnapshotDialog projectId={data.id} />
            </div>
          ) : (
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Discovery</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.snapshots.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer">
                      <TableCell>
                        <Link href={`/snapshots/${s.id}`} className="font-medium hover:underline">
                          {s.label ?? "Untitled"}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground capitalize">{s.discovery}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {s.donePages}/{s.totalPages || s.maxPages}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{formatDateTime(s.createdAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </>
      )}
    </main>
  );
}
