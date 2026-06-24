"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api, type ProjectSummary } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NewProjectDialog } from "@/components/new-project-dialog";

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString() : "—";
}

function ProjectCard({ project }: { project: ProjectSummary }) {
  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="h-full shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
        <CardHeader>
          <CardTitle className="truncate">{project.name}</CardTitle>
          <p className="text-muted-foreground truncate text-sm">{project.domain}</p>
        </CardHeader>
        <CardContent className="text-muted-foreground flex justify-between text-sm">
          <span>
            {project.snapshotCount} snapshot{project.snapshotCount === 1 ? "" : "s"}
          </span>
          <span>Last: {formatDate(project.lastSnapshotAt)}</span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api.listProjects(),
  });

  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Projects</h1>
          <p className="text-muted-foreground text-sm">
            Capture and archive a site&apos;s SEO state before a redesign.
          </p>
        </div>
        <NewProjectDialog />
      </div>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">
          {error instanceof Error ? error.message : "Failed to load projects"}
        </p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <p className="font-medium">No projects yet</p>
          <p className="text-muted-foreground mb-4 text-sm">
            Create one to start capturing snapshots.
          </p>
          <NewProjectDialog />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </main>
  );
}
