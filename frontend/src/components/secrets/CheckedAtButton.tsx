import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { RefreshCwIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

// Keeps "Checked N minutes ago" honest while the page sits open.
const useNow = (intervalMs: number) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
};

// Says how fresh a cached answer is and recomputes it on click, for cards whose result the server
// caches and nothing invalidates when the underlying data changes.
export const CheckedAtButton = ({
  computedAt,
  isRefreshing,
  onRefresh
}: {
  computedAt: string;
  isRefreshing: boolean;
  onRefresh: () => void;
}) => {
  const now = useNow(30_000);
  const computed = new Date(computedAt);
  const label =
    now - computed.getTime() < 60_000
      ? "Checked just now"
      : `Checked ${formatDistanceToNow(computed, { addSuffix: true })}`;

  return (
    <Badge variant="neutral" asChild className="ml-2 font-normal">
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label={`${label}. Check again`}
      >
        <RefreshCwIcon className={cn(isRefreshing && "animate-spin")} />
        {isRefreshing ? "Checking..." : label}
      </button>
    </Badge>
  );
};
