import {
  faCheckCircle,
  faCircleMinus,
  faCircleXmark,
  faFolder
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { Handle, NodeProps, Position } from "@xyflow/react";

import { Tooltip } from "@app/components/v2";

import { PermissionAccess } from "../../types";
import { createFolderNode, formatActionName } from "../../utils";
import { FolderNodeTooltipContent } from "./components";

const AccessMap = {
  [PermissionAccess.Full]: { className: "text-green", icon: faCheckCircle },
  [PermissionAccess.Partial]: { className: "text-yellow", icon: faCircleMinus },
  [PermissionAccess.None]: { className: "text-red", icon: faCircleXmark }
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
        className="pointer-events-none !cursor-pointer opacity-0"
        position={Position.Top}
      />
      <div
        className={`flex ${hasMinimalAccess ? "" : "opacity-40"} h-full w-full flex-col items-center justify-center rounded-md border border-mineshaft bg-mineshaft-800 px-2 py-3 font-inter shadow-lg transition-opacity duration-500`}
      >
        <div className="flex items-center space-x-2 text-xs text-mineshaft-100">
          <FontAwesomeIcon className="mb-0.5 font-medium text-yellow" icon={faFolder} />
          <span>{parentId ? `/${name}` : "/"}</span>
        </div>
        <div className="mt-1.5 flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded bg-mineshaft-600 px-2 py-1 text-xs">
          {Object.entries(actions).map(([action, access]) => {
            const { className, icon } = AccessMap[access];

            return (
              <Tooltip
                key={action}
                className="hidden" // just using the tooltip to trigger node toolbar
                content={
                  <FolderNodeTooltipContent
                    action={action}
                    access={access}
                    subject={subject}
                    actionRuleMap={actionRuleMap}
                  />
                }
              >
                <div className="flex items-center gap-1">
                  <FontAwesomeIcon icon={icon} className={className} size="xs" />
                  <span className="capitalize">{formatActionName(action)}</span>
                </div>
              </Tooltip>
            );
          })}
        </div>
      </div>
      <Handle
        type="source"
        className="pointer-events-none !cursor-pointer opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
