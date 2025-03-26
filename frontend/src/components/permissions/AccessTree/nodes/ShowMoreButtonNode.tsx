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
    <>
      <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />

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
    </>
  );
};
