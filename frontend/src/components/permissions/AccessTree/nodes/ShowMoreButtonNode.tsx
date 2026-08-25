import { Handle, NodeProps, Position } from "@xyflow/react";
import { ChevronRightIcon } from "lucide-react";

import { Button, Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

import { createShowMoreNode } from "../utils/createShowMoreNode";

export const ShowMoreButtonNode = ({
  data: { onClick, remaining }
}: NodeProps & { data: ReturnType<typeof createShowMoreNode>["data"] }) => {
  const tooltipText = `${remaining} ${remaining === 1 ? "folder is" : "folders are"} hidden. Click to show ${remaining > 10 ? "10 more" : ""}`;

  return (
    <div className="flex h-full w-full items-center justify-center rounded-md border border-border bg-card p-2">
      <Handle
        type="target"
        className="pointer-events-none cursor-pointer! opacity-0"
        position={Position.Top}
      />

      <div className="flex items-center justify-center">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="xs" onClick={onClick}>
              Show More
              <ChevronRightIcon />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{tooltipText}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
};
