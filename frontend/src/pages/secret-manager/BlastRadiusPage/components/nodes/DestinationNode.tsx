import { Handle, NodeProps, Position } from "@xyflow/react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { DestinationStatus } from "@app/hooks/api/blastRadius";

import { TDestinationNodeData } from "../../utils/buildGraph";
import { DESTINATION_STATUS_LABEL, relativeTime } from "../../utils/format";

const STATUS_TONE: Record<DestinationStatus, string> = {
  [DestinationStatus.Healthy]: "text-success",
  [DestinationStatus.Stale]: "text-warning",
  [DestinationStatus.Failed]: "text-danger",
  [DestinationStatus.Unknown]: "text-muted"
};

export const DestinationNode = ({ data, selected }: NodeProps & { data: TDestinationNodeData }) => {
  const { destination } = data;

  const statusLine =
    destination.autoSync === false
      ? "auto-sync off"
      : `${DESTINATION_STATUS_LABEL[destination.status].toLowerCase()}${
          destination.lastSyncedAt ? ` ${relativeTime(destination.lastSyncedAt)}` : ""
        }`;
  const tone = destination.autoSync === false ? "text-warning" : STATUS_TONE[destination.status];

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center gap-1 rounded-md border bg-card px-2.5 py-2",
        selected ? "border-foreground" : "border-border"
      )}
    >
      <p className="truncate text-xs text-foreground">{destination.label}</p>

      <div className="flex items-baseline justify-between gap-2">
        {destination.statusMessage ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className={cn(
                  "cursor-default truncate text-xs underline decoration-dotted underline-offset-2",
                  tone
                )}
              >
                {statusLine}
              </span>
            </TooltipTrigger>
            {/* The provider's own error, verbatim: we never invent a diagnosis. */}
            <TooltipContent className="max-w-80">{destination.statusMessage}</TooltipContent>
          </Tooltip>
        ) : (
          <span className={cn("truncate text-xs", tone)}>{statusLine}</span>
        )}
        {destination.crossProject && (
          <span className="shrink-0 text-xs text-warning">cross-project</span>
        )}
      </div>

      <Handle type="target" position={Position.Left} className="!opacity-0" />
    </div>
  );
};
