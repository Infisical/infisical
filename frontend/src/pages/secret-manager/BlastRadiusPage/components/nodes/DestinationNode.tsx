import { Handle, NodeProps, Position } from "@xyflow/react";
import {
  ArrowUpRightIcon,
  CopyIcon,
  FolderInputIcon,
  LinkIcon,
  Share2Icon,
  UploadCloudIcon
} from "lucide-react";

import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { DestinationKind, DestinationStatus } from "@app/hooks/api/blastRadius";

import { TDestinationNodeData } from "../../utils/buildGraph";
import { DESTINATION_STATUS_LABEL, relativeTime } from "../../utils/format";

const KIND_ICON: Record<DestinationKind, typeof UploadCloudIcon> = {
  [DestinationKind.Sync]: UploadCloudIcon,
  [DestinationKind.Import]: FolderInputIcon,
  [DestinationKind.Replication]: CopyIcon,
  [DestinationKind.Reference]: LinkIcon,
  [DestinationKind.FolderGrant]: Share2Icon
};

const STATUS_DOT: Record<DestinationStatus, string> = {
  [DestinationStatus.Healthy]: "bg-success",
  [DestinationStatus.Stale]: "bg-warning",
  [DestinationStatus.Failed]: "bg-danger",
  [DestinationStatus.Unknown]: "bg-neutral"
};

export const DestinationNode = ({ data, selected }: NodeProps & { data: TDestinationNodeData }) => {
  const { destination } = data;
  const Icon = KIND_ICON[destination.kind];

  const statusLine =
    destination.autoSync === false
      ? "auto-sync off"
      : `${DESTINATION_STATUS_LABEL[destination.status].toLowerCase()}${
          destination.lastSyncedAt ? ` ${relativeTime(destination.lastSyncedAt)}` : ""
        }`;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center gap-1 rounded-sm border bg-card px-2.5 py-2",
        selected ? "border-foreground" : "border-border"
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="shrink-0 text-accent" />
        <p className="truncate text-xs font-medium text-foreground">{destination.label}</p>
      </div>

      {destination.target && (
        <p className="truncate font-mono text-xs text-accent">{destination.target}</p>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <span className="flex items-center gap-1 text-xs text-accent">
          <span className={cn("size-1.5 rounded-full", STATUS_DOT[destination.status])} />
          {destination.statusMessage ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default underline decoration-dotted underline-offset-2">
                  {statusLine}
                </span>
              </TooltipTrigger>
              {/* The provider's own error, verbatim: we never invent a diagnosis. */}
              <TooltipContent className="max-w-80">{destination.statusMessage}</TooltipContent>
            </Tooltip>
          ) : (
            statusLine
          )}
        </span>
        {destination.crossProject && (
          <Badge variant="warning">
            <ArrowUpRightIcon />
            cross-project
          </Badge>
        )}
      </div>

      <Handle type="target" position={Position.Left} className="!opacity-0" />
    </div>
  );
};
