"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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

export function NewProjectDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => api.createProject({ name, domain }),
    onSuccess: () => {
      toast.success("Project created");
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
      setOpen(false);
      setName("");
      setDomain("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to create project"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>New project</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="project-name">
              Name
            </label>
            <Input
              id="project-name"
              placeholder="Acme Corp"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="project-domain">
              Domain
            </label>
            <Input
              id="project-domain"
              placeholder="https://example.com"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending || !name.trim() || !domain.trim()}>
              {mutation.isPending ? "Creating…" : "Create project"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
