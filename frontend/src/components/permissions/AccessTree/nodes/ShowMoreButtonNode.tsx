import { faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Handle, NodeProps, Position } from "@xyflow/react";

import { Button, Tooltip } from "@app/components/v2";

import { createShowMoreNode } from "../utils/createShowMoreNode";

export const ShowMoreButtonNode = ({
  data: { onClick, remaining }
}: NodeProps & { data: ReturnType<typeof createShowMoreNode>["data"] }) => {
  const tooltipText = `${remaining} ${remaining === 1 ? "folder is" : "folders are"} hidden. Click to show ${remaining > 10 ? "10 more" : ""}`;

  return (
    <div className="flex h-full w-full items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-800 p-2">
      <Handle
        type="target"
        className="pointer-events-none !cursor-pointer opacity-0"
        position={Position.Top}
      />

      <div className="flex items-center justify-center">
        <Tooltip position="right" content={tooltipText}>
          <Button
            colorSchema="secondary"
            variant="plain"
            size="xs"
            onClick={onClick}
            rightIcon={<FontAwesomeIcon icon={faChevronRight} className="ml-1" />}
          >
            Show More
          </Button>
        </Tooltip>
      </div>
    </div>
  );
};
