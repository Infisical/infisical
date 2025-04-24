import { MarkerType } from "@xyflow/react";

import { PermissionAccess, PermissionEdge } from "../types";

export const createBaseEdge = ({
  source,
  target,
  access,
  hideEdge = false
}: {
  source: string;
  target: string;
  access: PermissionAccess;
  hideEdge?: boolean;
}) => {
  const color = access === PermissionAccess.None ? "#707174" : "#ccccce";
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: PermissionEdge.Base,
    markerEnd: hideEdge
      ? undefined
      : {
          type: MarkerType.ArrowClosed,
          color
        },
    style: { stroke: hideEdge ? "transparent" : color }
  };
};
