"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function NewSnapshotDialog({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [discovery, setDiscovery] = useState<"single" | "sitemap" | "crawl">("sitemap");
  const [maxPages, setMaxPages] = useState(200);

  const mutation = useMutation({
    mutationFn: () =>
      api.createSnapshot(projectId, {
        label: label.trim() || undefined,
        discovery,
        maxPages,
      }),
    onSuccess: (snapshot) => {
      toast.success("Snapshot queued");
      setOpen(false);
      router.push(`/snapshots/${snapshot.id}`);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to start snapshot"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New snapshot</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New snapshot</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="snapshot-label">
              Label <span className="text-muted-foreground">(optional)</span>
            </label>
            <Input
              id="snapshot-label"
              placeholder="pre-redesign"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="snapshot-discovery">
              Discovery
            </label>
            <select
              id="snapshot-discovery"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm shadow-sm"
              value={discovery}
              onChange={(e) => setDiscovery(e.target.value as "single" | "sitemap" | "crawl")}
            >
              <option value="sitemap">Whole site — sitemap (fast)</option>
              <option value="crawl">Whole site — full crawl (most pages)</option>
              <option value="single">Single page only (just this URL)</option>
            </select>
          </div>
          {discovery !== "single" && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium" htmlFor="snapshot-maxpages">
                Max pages
              </label>
              <Input
                id="snapshot-maxpages"
                type="number"
                min={1}
                max={1000}
                value={maxPages}
                onChange={(e) => setMaxPages(Math.max(1, Math.min(1000, Number(e.target.value) || 1)))}
              />
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Starting…" : "Start snapshot"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
