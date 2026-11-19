import {
  BaseEdge,
  Edge,
  EdgeProps,
  getSmoothStepPath,
  Handle,
  NodeProps,
  Position
} from "@xyflow/react";
import { format } from "date-fns";
import { HardDriveIcon, KeyIcon, UserIcon, UsersIcon } from "lucide-react";

import { formatReadDay } from "@app/components/secrets/SecretReadStatusBadge";
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";

import {
  TAccessGraphActorType,
  TBandLabelNodeData,
  TLaneEdgeData,
  TReaderNodeData,
  TSecretNodeData
} from "./buildAccessGraph";

const TYPE_ICON: Record<TAccessGraphActorType, typeof UserIcon> = {
  user: UserIcon,
  identity: HardDriveIcon
};

const TYPE_LABEL: Record<TAccessGraphActorType, string> = {
  user: "user",
  identity: "machine identity"
};

const hiddenHandle = "!opacity-0";

// How the reader has the value, on one line whatever the number of groups: the first group by name, the rest
// as a count that stays visible however long that name is, and every group listed on hover.
const AccessPath = ({ isDirect, groupNames }: { isDirect: boolean; groupNames: string[] }) => {
  // A group whose role uses a placeholder such as {{identity.username}} cannot be named here, so the API's isDirect
  // decides the label.
  if (!groupNames.length) {
    return (
      <span className="truncate text-xs text-muted">
        {isDirect ? "Direct access" : "Through a group"}
      </span>
    );
  }
  const [first, ...rest] = groupNames;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex min-w-0 items-center gap-1 text-xs text-muted">
          <UsersIcon className="size-3 shrink-0 text-accent" aria-label="group" />
          <span className="truncate">
            {isDirect ? "Direct · via" : "Via"} {first}
          </span>
          {rest.length > 0 && <span className="shrink-0">+{rest.length} more</span>}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">
        {isDirect ? "Direct access, and through " : "Through "}
        {groupNames.length === 1 ? "the group" : "the groups"} {groupNames.join(", ")}
      </TooltipContent>
    </Tooltip>
  );
};

export const ReaderNode = ({ data }: NodeProps & { data: TReaderNodeData }) => {
  const { reader, groupNames, hasReadActivity } = data;
  const TypeIcon = TYPE_ICON[reader.type];
  // A reader with no read is drawn dashed, like their line; an admin is never counted, so stays solid.
  const isUnread = hasReadActivity && !reader.lastReadAt && !reader.isAdmin;

  // Read, unused access, or too new to judge; admins are never judged.
  let status: { text: string; tone: string } | undefined;
  if (hasReadActivity) {
    if (reader.lastReadAt) {
      status = {
        text: `Read ${formatReadDay(reader.lastReadAt).toLowerCase()}`,
        tone: "text-accent"
      };
    } else if (reader.isAdmin) {
      status = { text: "No reads, admins are not counted", tone: "text-muted" };
    } else if (reader.unreadSince) {
      status = {
        text: `No reads since ${format(new Date(reader.unreadSince), "MMM d")}`,
        tone: "text-warning"
      };
    } else {
      status = { text: "No reads yet, too new to judge", tone: "text-muted" };
    }
  }

  return (
    <div
      className={cn(
        "flex h-full w-full cursor-pointer flex-col justify-center gap-1 rounded-md border px-3",
        isUnread ? "border-dashed border-border bg-container" : "border-border bg-card"
      )}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <TypeIcon className="size-3.5 shrink-0 text-accent" aria-label={TYPE_LABEL[reader.type]} />
        <p className="truncate text-xs font-medium text-foreground">{reader.name}</p>
        {reader.isAdmin && (
          <Badge variant="neutral" className="ml-auto shrink-0">
            Admin
          </Badge>
        )}
      </div>
      {status && <span className={cn("truncate text-xs", status.tone)}>{status.text}</span>}
      <AccessPath isDirect={reader.isDirect} groupNames={groupNames} />
      <Handle type="source" position={Position.Right} className={hiddenHandle} />
    </div>
  );
};

export const SecretNode = ({ data }: NodeProps & { data: TSecretNodeData }) => {
  const { secret } = data;
  return (
    <div className="flex h-full w-full flex-col justify-center gap-1 rounded-md border border-secret/50 bg-secret/10 px-3">
      <div className="flex min-w-0 items-center gap-1.5">
        <KeyIcon className="size-3.5 shrink-0 text-secret" aria-label="secret" />
        <p className="truncate font-mono text-sm text-foreground">{secret.key}</p>
      </div>
      <p className="truncate text-xs text-muted">
        {secret.environment} · {secret.secretPath}
      </p>
      <Handle type="target" position={Position.Left} className={hiddenHandle} />
    </div>
  );
};

// A section heading inside the canvas, so it takes part in the same column math as the nodes it labels.
export const BandLabelNode = ({ data }: NodeProps & { data: TBandLabelNodeData }) => (
  <div className="flex h-full w-full flex-col justify-end gap-0.5 whitespace-nowrap">
    <span
      className={cn(
        "text-xs font-medium",
        data.tone === "warning" ? "text-warning" : "text-foreground"
      )}
    >
      {data.label}
    </span>
    <span className="text-xs text-muted">{data.detail}</span>
  </div>
);

// A right-angled line whose vertical run sits at the lane the layout gave it, so lines into the same node
// run side by side instead of on top of each other or through the nodes in between.
export const LaneEdge = ({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  data
}: EdgeProps<Edge<TLaneEdgeData>>) => {
  const [path] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    centerX: data?.centerX,
    borderRadius: 8
  });
  return <BaseEdge path={path} style={style} />;
};
