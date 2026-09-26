import {
  ArrowUpIcon,
  HourglassIcon,
  type LucideIcon,
  PauseIcon,
  TriangleAlertIcon
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Badge, Button, TableCell, TableRow } from "@app/components/v3";
import { AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS } from "@app/hooks/api/agentVault";

export type LiveState = "live" | "reconnecting" | "paused" | "ended";

const LIVE_STATE_PRESENTATION: Record<
  LiveState,
  {
    label: string;
    variant: "success" | "warning" | "neutral";
    icon?: LucideIcon;
    rowClassName: string;
  }
> = {
  live: { label: "Live", variant: "success", rowClassName: "bg-success/5 text-success/80" },
  reconnecting: {
    label: "Reconnecting",
    variant: "warning",
    icon: TriangleAlertIcon,
    rowClassName: "bg-warning/5 text-warning/80"
  },
  paused: {
    label: "Paused",
    variant: "neutral",
    icon: PauseIcon,
    rowClassName: "bg-neutral/5 text-neutral/80"
  },
  ended: {
    label: "Session Ended",
    variant: "neutral",
    icon: HourglassIcon,
    rowClassName: "bg-neutral/5 text-neutral/80"
  }
};

export const LiveDot = ({ className }: { className?: string }) => (
  <span aria-hidden className={twMerge("relative flex size-1.5 shrink-0", className)}>
    <span className="absolute inline-flex size-full rounded-full bg-current opacity-75 motion-safe:animate-ping" />
    <span className="relative inline-flex size-full rounded-full bg-current" />
  </span>
);

export const LiveStateBadge = ({ state }: { state: LiveState }) => {
  const { label, variant, icon: Icon } = LIVE_STATE_PRESENTATION[state];

  return (
    <Badge variant={variant}>
      {Icon ? <Icon /> : <LiveDot />}
      {label}
    </Badge>
  );
};

const liveStateDescription = (state: LiveState, recordCount: number) => {
  if (state === "live") return "New requests show up here within about a minute.";
  if (state === "reconnecting")
    return `Couldn't check for new requests. Trying again every ${AGENT_VAULT_SESSION_LOG_LIVE_POLL_MS / 1000} seconds.`;
  if (state === "paused")
    return `Showing the most recent ${recordCount.toLocaleString()} requests. Pick a time range to see further back.`;
  return "Its last requests can take up to a minute to show up.";
};

type Props = {
  state: LiveState;
  columnCount: number;
  recordCount: number;
  isRetrying?: boolean;
  onRetry?: () => void;
  newRequestCount?: number;
  onShowNewRequests?: () => void;
};

export const LiveStatusRow = ({
  state,
  columnCount,
  recordCount,
  isRetrying,
  onRetry,
  newRequestCount = 0,
  onShowNewRequests
}: Props) => (
  <TableRow>
    {/* A collapsed border scrolls away under a sticky header, so this draws its divider the way the column headers do */}
    <TableCell
      colSpan={columnCount}
      className={twMerge(
        "relative h-8 border-b-0 py-1 shadow-[inset_0_-1px_0_var(--color-border)]",
        LIVE_STATE_PRESENTATION[state].rowClassName
      )}
    >
      <div role="status" className="flex min-w-0 items-center gap-2">
        <LiveStateBadge state={state} />
        <span className="min-w-0 truncate text-xs">{liveStateDescription(state, recordCount)}</span>
        {state === "reconnecting" && onRetry && (
          <Button
            variant="link"
            size="xs"
            className="ml-auto text-xs"
            isPending={isRetrying}
            onClick={onRetry}
          >
            Check Now
          </Button>
        )}
      </div>
      {newRequestCount > 0 && onShowNewRequests && (
        // Hangs off the sticky header, so it stays in view while the rows scroll under it
        <div className="absolute top-full left-1/2 mt-2 -translate-x-1/2 animate-in duration-200 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none">
          <Button
            variant="outline"
            size="xs"
            className="rounded-full bg-popover shadow-floating hover:bg-container-hover in-data-[theme=light]:shadow-floating-light"
            onClick={onShowNewRequests}
          >
            <ArrowUpIcon />
            {newRequestCount.toLocaleString()} New {newRequestCount === 1 ? "Request" : "Requests"}
          </Button>
        </div>
      )}
    </TableCell>
  </TableRow>
);
