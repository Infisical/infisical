import { Handle, NodeProps, Position } from "@xyflow/react";

import { Badge, Popover, PopoverContent, PopoverTrigger } from "@app/components/v3";
import { cn } from "@app/components/v3/utils";
import { PrincipalType } from "@app/hooks/api/blastRadius";

import { TPrincipalNodeData } from "../../utils/buildGraph";
import { CLIENT_LABEL, describeObserved, PRECISION_LABEL } from "../../utils/format";
import { useIsNodeSelected, usePrincipalActions } from "../../utils/selection";
import { PrincipalPopover } from "../PrincipalPopover";

const TYPE_LABEL: Record<PrincipalType, string> = {
  [PrincipalType.User]: "user",
  [PrincipalType.Identity]: "identity",
  [PrincipalType.Group]: "group"
};

const MAX_VISIBLE_CLIENTS = 2;

export const PrincipalNode = ({ id, data }: NodeProps & { data: TPrincipalNodeData }) => {
  const { principal, windowDays, consumptionAvailable } = data;
  const isSelected = useIsNodeSelected(id);
  const actions = usePrincipalActions();

  const hasReads = (principal.observed?.readCount ?? 0) > 0;
  const clients = principal.observed?.clients ?? [];
  const visibleClients = clients.slice(0, MAX_VISIBLE_CLIENTS);
  const overflowClients = clients.length - visibleClients.length;

  return (
    <Popover open={isSelected}>
      <PopoverTrigger asChild>
        <div
          className={cn(
            "flex h-full w-full cursor-pointer flex-col gap-1.5 rounded-md border px-2.5 py-2",
            hasReads ? "border-border bg-card" : "border-dashed border-border bg-transparent",
            isSelected && "border-foreground"
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
      {/* Anchored to the node it describes, so the reader never loses the row they clicked.
          Mounted only while open, rather than letting Radix unmount it: its exit animation never fires an
          `animationend` here, so Radix's Presence kept a `data-state="closed"` popover on screen forever and
          the close button looked dead. Costs the exit transition, which is worth it. */}
      {isSelected && actions && (
        <PopoverContent
          side="right"
          align="start"
          sideOffset={12}
          className="w-auto p-3"
          // The content is portalled out of the canvas in the DOM, but a React portal still propagates
          // events through the React tree — so a click in here reached React Flow's node handler and
          // re-selected this node in the same tick that the close button cleared it.
          onClick={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
        >
          <PrincipalPopover
            principal={principal}
            windowDays={windowDays}
            consumptionAvailable={consumptionAvailable}
            actions={actions}
            onClose={actions.onClose}
          />
        </PopoverContent>
      )}
    </Popover>
  );
};
