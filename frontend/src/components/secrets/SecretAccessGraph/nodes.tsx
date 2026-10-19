import { Handle, NodeProps, Position } from "@xyflow/react";

import { SecretExposureBadge } from "@app/components/secrets/SecretExposureScore";
import { formatReadDay } from "@app/components/secrets/SecretReadStatusBadge";
import { cn } from "@app/components/v3/utils";

import {
  TAccessGraphActorType,
  TBandLabelNodeData,
  TGhostNodeData,
  TGroupNodeData,
  TReaderNodeData,
  TSecretNodeData
} from "./buildAccessGraph";

const TYPE_LABEL: Record<TAccessGraphActorType, string> = {
  user: "user",
  identity: "machine identity"
};

const hiddenHandle = "!opacity-0";

export const ReaderNode = ({ data }: NodeProps & { data: TReaderNodeData }) => {
  const { reader, groupNames, hasReadActivity, windowDays } = data;
  const hasReads = Boolean(reader.lastReadAt);

  let status: string | undefined;
  if (hasReadActivity) {
    status = reader.lastReadAt
      ? `Read ${formatReadDay(reader.lastReadAt).toLowerCase()}`
      : `No reads in ${windowDays} days`;
  }

  return (
    <div
      className={cn(
        "flex h-full w-full cursor-pointer flex-col gap-1 rounded-md border px-2.5 py-2",
        hasReads || !hasReadActivity
          ? "border-border bg-card"
          : "border-dashed border-border bg-transparent"
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            "truncate font-mono text-xs",
            hasReads || !hasReadActivity ? "text-foreground" : "text-accent"
          )}
        >
          {reader.name}
        </p>
        <span className="shrink-0 text-xs text-muted">{TYPE_LABEL[reader.type]}</span>
      </div>
      {status && (
        <span className={cn("truncate text-xs", hasReads ? "text-accent" : "text-warning")}>
          {status}
        </span>
      )}
      <span className="mt-auto truncate text-xs text-muted">
        {groupNames.length ? `Via ${groupNames.join(", ")}` : "Direct access"}
      </span>
      <Handle type="source" position={Position.Right} className={hiddenHandle} />
    </div>
  );
};

export const GroupNode = ({ data }: NodeProps & { data: TGroupNodeData }) => {
  const { group } = data;
  return (
    <div className="flex h-full w-full flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate font-mono text-xs text-foreground">{group.name}</p>
        <span className="shrink-0 text-xs text-muted">group</span>
      </div>
      <span className="mt-auto truncate text-xs text-muted">
        {group.memberCount} {group.memberCount === 1 ? "member" : "members"} can read the value
      </span>
      <Handle type="target" position={Position.Left} className={hiddenHandle} />
      <Handle type="source" position={Position.Right} className={hiddenHandle} />
    </div>
  );
};

export const SecretNode = ({ data }: NodeProps & { data: TSecretNodeData }) => {
  const { secret } = data;
  return (
    <div className="flex h-full w-full flex-col gap-1 rounded-md border border-secret/50 bg-secret/10 px-2.5 py-2">
      <span className="text-xs tracking-wide text-accent uppercase">Secret</span>
      <p className="truncate font-mono text-sm text-foreground">{secret.key}</p>
      <p className="truncate font-mono text-xs text-accent">
        {secret.secretPath} · {secret.environment}
      </p>
      {secret.exposure && (
        <div className="mt-auto flex items-center gap-1.5 border-t border-secret/25 pt-1.5 text-xs text-muted">
          Exposure <SecretExposureBadge exposure={secret.exposure} />
        </div>
      )}
      <Handle type="target" position={Position.Left} className={hiddenHandle} />
    </div>
  );
};

// A reader of this value who cannot read it today. No handle on purpose: there is no current path from
// them to the secret, and an edge would say otherwise.
export const GhostNode = ({ data }: NodeProps & { data: TGhostNodeData }) => {
  const { ghost } = data;
  return (
    <div className="flex h-full w-full flex-col gap-1 rounded-md border border-warning/40 bg-warning/5 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p
          className={cn(
            "truncate font-mono text-xs",
            ghost.name ? "text-foreground" : "text-muted italic"
          )}
        >
          {ghost.name ?? `Deleted ${TYPE_LABEL[ghost.type]}`}
        </p>
        <span className="shrink-0 text-xs text-muted">{TYPE_LABEL[ghost.type]}</span>
      </div>
      <span className="truncate text-xs text-warning">
        {ghost.name ? "Access removed" : "Deleted"} · still knows the value
      </span>
      <span className="mt-auto truncate text-xs text-accent">
        Read {formatReadDay(ghost.lastReadAt).toLowerCase()}
      </span>
    </div>
  );
};

// A section heading inside the canvas, so it takes part in the same column math as the nodes it labels.
export const BandLabelNode = ({ data }: NodeProps & { data: TBandLabelNodeData }) => (
  <div className="flex h-full w-full flex-col justify-end gap-0.5 whitespace-nowrap">
    <span
      className={cn(
        "text-xs tracking-wide uppercase",
        data.tone === "warning" ? "text-warning" : "text-accent"
      )}
    >
      {data.label}
    </span>
    <span className="text-xs text-muted">{data.detail}</span>
  </div>
);
