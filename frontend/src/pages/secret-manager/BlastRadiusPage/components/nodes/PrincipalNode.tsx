import { Handle, NodeProps, Position } from "@xyflow/react";

import { Badge, Popover, PopoverContent, PopoverTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { PrincipalType } from "@app/hooks/api/blastRadius";

import { TPrincipalNodeData } from "../../utils/buildGraph";
import { CLIENT_LABEL, describeObserved, PRECISION_LABEL } from "../../utils/format";
import { PrincipalPopover } from "../PrincipalPopover";

const TYPE_LABEL: Record<PrincipalType, string> = {
  [PrincipalType.User]: "user",
  [PrincipalType.Identity]: "identity",
  [PrincipalType.Group]: "group"
};

const MAX_VISIBLE_CLIENTS = 2;

export const PrincipalNode = ({ data, selected }: NodeProps & { data: TPrincipalNodeData }) => {
  const { principal, windowDays, consumptionAvailable } = data;

  const hasReads = (principal.observed?.readCount ?? 0) > 0;
  const clients = principal.observed?.clients ?? [];
  const visibleClients = clients.slice(0, MAX_VISIBLE_CLIENTS);
  const overflowClients = clients.length - visibleClients.length;

  return (
    <Popover open={Boolean(selected)}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "flex h-full w-full cursor-pointer flex-col gap-1.5 rounded-md border px-2.5 py-2",
            hasReads ? "border-border bg-card" : "border-dashed border-border bg-transparent",
            selected && "border-foreground"
          )}
        >
          <div className="flex items-baseline justify-between gap-2">
            <p
              className={cn(
                "truncate font-mono text-xs",
                hasReads ? "text-foreground" : "text-accent"
              )}
            >
              {principal.name}
            </p>
            <span className="shrink-0 text-xs text-muted">
              {TYPE_LABEL[principal.type]}
              {principal.type === PrincipalType.Group && ` · ${principal.memberCount ?? 0}`}
            </span>
          </div>

          <span className={cn("truncate text-xs", hasReads ? "text-accent" : "text-muted")}>
            {describeObserved(principal.observed, windowDays, consumptionAvailable)}
          </span>

          {(principal.observed?.precision || Boolean(visibleClients.length)) && (
            <div className="mt-auto flex items-center gap-1">
              {principal.observed?.precision && (
                <Badge variant="ghost" className="text-muted italic">
                  {PRECISION_LABEL[principal.observed.precision]}
                </Badge>
              )}
              {visibleClients.map((client) => (
                <Badge
                  key={client}
                  // A person reading a production credential in a browser is the interesting event, so
                  // `web` is tinted while machine clients stay neutral.
                  variant={client === "web" ? "info" : "neutral"}
                  className="font-mono"
                >
                  {CLIENT_LABEL[client] ?? client}
                </Badge>
              ))}
              {overflowClients > 0 && (
                <span className="text-xs text-muted">+{overflowClients}</span>
              )}
            </div>
          )}

          <Handle type="source" position={Position.Right} className="!opacity-0" />
        </div>
      </PopoverTrigger>
      {/* Anchored to the node it describes, so the reader never loses the row they clicked. */}
      <PopoverContent side="right" align="start" sideOffset={12} className="w-auto p-3">
        <PrincipalPopover
          principal={principal}
          windowDays={windowDays}
          consumptionAvailable={consumptionAvailable}
          actions={data.popover}
          onClose={data.popover.onClose}
        />
      </PopoverContent>
    </Popover>
  );
};
