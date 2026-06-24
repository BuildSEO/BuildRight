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
      ? "bg-green-100 text-green-700"
      : code < 400
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <Badge variant="outline" className={cn("border-transparent tabular-nums", cls)}>
      {code}
    </Badge>
  );
}
