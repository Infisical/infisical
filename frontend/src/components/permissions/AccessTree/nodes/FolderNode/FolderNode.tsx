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
        className="cursor-pointer! pointer-events-none opacity-0"
        position={Position.Top}
      />
      <div
        className={`flex ${hasMinimalAccess ? "" : "opacity-40"} border-mineshaft bg-mineshaft-800 font-inter h-full w-full flex-col items-center justify-center rounded-md border px-2 py-3 shadow-lg transition-opacity duration-500`}
      >
        <div className="text-mineshaft-100 flex items-center space-x-2 text-xs">
          <FontAwesomeIcon className="text-yellow mb-0.5 font-medium" icon={faFolder} />
          <span>{parentId ? `/${name}` : "/"}</span>
        </div>
        <div className="bg-mineshaft-600 mt-1.5 flex w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-sm px-2 py-1 text-xs">
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
        className="cursor-pointer! pointer-events-none opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
