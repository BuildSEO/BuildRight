import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  queued: "border-transparent bg-slate-100 text-slate-700",
  discovering: "border-transparent bg-blue-100 text-blue-700",
  capturing: "border-transparent bg-blue-100 text-blue-700",
  done: "border-transparent bg-green-100 text-green-700",
  failed: "border-transparent bg-red-100 text-red-700",
  stopped: "border-transparent bg-slate-200 text-slate-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}
