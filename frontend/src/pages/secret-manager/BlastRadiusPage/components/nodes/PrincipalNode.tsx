import { Handle, NodeProps, Position } from "@xyflow/react";
import { KeyIcon, UserIcon, UsersIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { PrincipalType, ReadPrecision } from "@app/hooks/api/blastRadius";

import { TPrincipalNodeData } from "../../utils/buildGraph";
import {
  CLIENT_LABEL,
  describeObserved,
  PRECISION_LABEL,
  strongestActionLabel
} from "../../utils/format";

const PRINCIPAL_ICON: Record<PrincipalType, typeof UserIcon> = {
  [PrincipalType.User]: UserIcon,
  [PrincipalType.Identity]: KeyIcon,
  [PrincipalType.Group]: UsersIcon
};

const MAX_VISIBLE_CLIENTS = 2;

export const PrincipalNode = ({ data, selected }: NodeProps & { data: TPrincipalNodeData }) => {
  const { principal, windowDays, consumptionAvailable } = data;
  const Icon = PRINCIPAL_ICON[principal.type];

  const readsValue = strongestActionLabel(principal.actions) === "Read Value";
  const hasReads = (principal.observed?.readCount ?? 0) > 0;
  const viaGroup = principal.grantPaths.some((path) =>
    path.via.some((step) => step.kind === "group")
  );
  const temporary = principal.grantPaths
    .flatMap((path) => path.via)
    .find((step) => step.kind !== "group" && step.isTemporary && step.expiresAt);

  const clients = principal.observed?.clients ?? [];
  const visibleClients = clients.slice(0, MAX_VISIBLE_CLIENTS);
  const overflowClients = clients.length - visibleClients.length;

  return (
    <div
      className={cn(
        "flex h-full w-full flex-col justify-center gap-1 rounded-sm border bg-card px-2.5 py-2",
        selected ? "border-foreground" : "border-border"
      )}
    >
      <div className="flex items-center gap-1.5">
        <Icon size={13} className="shrink-0 text-accent" />
        <p className="truncate text-xs font-medium text-foreground">{principal.name}</p>
        {principal.type === PrincipalType.Group && (
          <span className="shrink-0 text-muted">· {principal.memberCount ?? 0}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1">
        <Badge variant={readsValue ? "danger" : "neutral"}>
          {strongestActionLabel(principal.actions)}
        </Badge>
        {viaGroup && (
          <Badge variant="ghost" className="text-accent">
            via group
          </Badge>
        )}
        {temporary?.kind === "role" || temporary?.kind === "additionalPrivilege" ? (
          <Badge variant="warning">expires</Badge>
        ) : null}
      </div>

      <span
        className={cn(
          "truncate text-xs text-accent",
          !hasReads && consumptionAvailable && "text-muted"
        )}
      >
        {describeObserved(principal.observed, windowDays, consumptionAvailable)}
      </span>

      <div className="flex items-center gap-1">
        {principal.observed?.precision === ReadPrecision.Folder && (
          <Badge variant="ghost" className="shrink-0 text-muted">
            {PRECISION_LABEL[ReadPrecision.Folder]}
          </Badge>
        )}

        {visibleClients.map((client) => (
          <Badge
            key={client}
            // A person reading a production credential in a browser is the interesting event, so
            // `web` is tinted while machine clients stay neutral.
            variant={client === "web" ? "info" : "ghost"}
            className="font-mono"
          >
            {CLIENT_LABEL[client] ?? client}
          </Badge>
        ))}
        {overflowClients > 0 && <span className="text-xs text-muted">+{overflowClients}</span>}
      </div>

      <Handle type="source" position={Position.Right} className="!opacity-0" />
    </div>
  );
};
