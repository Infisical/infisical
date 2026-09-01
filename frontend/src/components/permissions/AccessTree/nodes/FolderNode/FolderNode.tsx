import { Handle, NodeProps, Position } from "@xyflow/react";
import { CircleCheckIcon, CircleMinusIcon, CircleXIcon, FolderIcon } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { PermissionAccess } from "../../types";
import { createFolderNode, formatActionName } from "../../utils";
import { FolderNodeTooltipContent } from "./components";

const AccessMap = {
  [PermissionAccess.Full]: { className: "text-success", Icon: CircleCheckIcon },
  [PermissionAccess.Partial]: { className: "text-warning", Icon: CircleMinusIcon },
  [PermissionAccess.None]: { className: "text-danger", Icon: CircleXIcon }
};

export const FolderNode = ({
  data
}: NodeProps & { data: ReturnType<typeof createFolderNode>["data"] }) => {
  const { name, actions, actionRuleMap, parentId, subject } = data;

  const hasMinimalAccess = Object.values(actions).some(
    (action) => action === PermissionAccess.Full || action === PermissionAccess.Partial
  );

  return (
    <>
      <Handle
        type="target"
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Top}
      />
      <div
        className={`flex ${hasMinimalAccess ? "" : "opacity-40"} h-full w-full flex-col items-center justify-center rounded-md border border-border bg-card px-2 py-3 transition-opacity duration-300 motion-reduce:transition-none`}
      >
        <div className="flex items-center gap-2 text-xs text-foreground">
          <FolderIcon className="size-3.5 text-folder" />
          <span>{parentId ? `/${name}` : "/"}</span>
        </div>
        <div className="mt-1.5 flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-sm bg-container px-2 py-1 text-xs text-foreground">
          {Object.entries(actions).map(([action, access]) => {
            const { className, Icon } = AccessMap[access];

            return (
              <Tooltip key={action}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className="flex items-center gap-1 rounded-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`${formatActionName(action)} access details`}
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Icon className={`size-3 ${className}`} />
                    <span className="capitalize">{formatActionName(action)}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent className="hidden">
                  <FolderNodeTooltipContent
                    action={action}
                    access={access}
                    subject={subject}
                    actionRuleMap={actionRuleMap}
                  />
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </div>
      <Handle
        type="source"
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
