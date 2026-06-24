"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/** Polls /api/health and warns in the header when the capture worker isn't running. */
export function WorkerStatus() {
  const { data } = useQuery({
    queryKey: ["health"],
    queryFn: () => api.getHealth(),
    refetchInterval: 10_000,
  });

  if (!data || data.workerAlive) return null;
  return (
    <span className="ml-auto rounded-md bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
      ⚠ Worker not running — start it with{" "}
      <code className="font-mono">npm run worker</code>
    </span>
  );
}
