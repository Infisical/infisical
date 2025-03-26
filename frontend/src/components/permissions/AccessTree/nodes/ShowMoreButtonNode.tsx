import { faChevronRight, faFolderClosed } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Handle, NodeProps, Position } from "@xyflow/react";

import { Tooltip } from "@app/components/v2";

import { createShowMoreNode } from "../utils/createShowMoreNode";

export const ShowMoreButtonNode = ({
  data: { onClick, remaining }
}: NodeProps & { data: ReturnType<typeof createShowMoreNode>["data"] }) => {
  return (
    <>
      <Handle type="target" position={Position.Top} style={{ visibility: "hidden" }} />

      <Tooltip position="right" content="Click to show 10 more folders">
        <button
          type="button"
          onClick={onClick}
          className="group relative flex items-center justify-between gap-3 rounded-md border border-mineshaft-600 bg-mineshaft-800/90 px-4 py-3 text-sm font-medium text-mineshaft-200 shadow-sm transition-all duration-200 hover:border-primary/50 hover:bg-mineshaft-700 hover:text-white hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/30"
          aria-label={`Show ${remaining} more folders`}
        >
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faFolderClosed} className="h-3.5 w-3.5 text-primary/70" />
            <span>
              {remaining} hidden folder{remaining !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center justify-center rounded-full bg-mineshaft-700/80 p-1 group-hover:bg-primary/20">
            <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3" />
          </div>
        </button>
      </Tooltip>
    </>
  );
};
