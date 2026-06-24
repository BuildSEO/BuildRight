import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  queued: "border-transparent bg-slate-500/15 text-slate-600 dark:text-slate-300",
  discovering: "border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400",
  capturing: "border-transparent bg-blue-500/15 text-blue-600 dark:text-blue-400",
  done: "border-transparent bg-green-500/15 text-green-600 dark:text-green-400",
  failed: "border-transparent bg-red-500/15 text-red-600 dark:text-red-400",
  stopped: "border-transparent bg-amber-500/15 text-amber-600 dark:text-amber-400",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", STATUS_STYLES[status])}>
      {status}
    </Badge>
  );
}
