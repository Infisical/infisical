import { Handle, NodeProps, Position } from "@xyflow/react";

import { createRoleNode } from "../utils";

export const RoleNode = ({
  data: { subject, environment }
}: NodeProps & { data: ReturnType<typeof createRoleNode>["data"] }) => {
  return (
    <>
      <Handle
        type="target"
        className="pointer-events-none !cursor-pointer opacity-0"
        position={Position.Top}
      />
      <div className="flex h-full w-full flex-col items-center justify-center rounded-md border border-mineshaft bg-mineshaft-800 px-3 py-2 font-inter shadow-lg">
        <div className="flex max-w-[14rem] flex-col items-center text-xs text-mineshaft-200">
          <span className="capitalize">{subject.replace("-", " ")} Access</span>
          <div className="max-w-[14rem] whitespace-nowrap text-xs text-mineshaft-300">
            <p className="truncate capitalize">{environment}</p>
          </div>
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
