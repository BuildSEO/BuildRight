import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function HttpStatusBadge({ code }: { code: number | null }) {
  if (code == null) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        —
      </Badge>
    );
  }
  const cls =
    code < 300
      ? "bg-green-500/15 text-green-600 dark:text-green-400"
      : code < 400
        ? "bg-amber-500/15 text-amber-600 dark:text-amber-400"
        : "bg-red-500/15 text-red-600 dark:text-red-400";
  return (
    <Badge variant="outline" className={cn("border-transparent tabular-nums", cls)}>
      {code}
    </Badge>
  );
}
