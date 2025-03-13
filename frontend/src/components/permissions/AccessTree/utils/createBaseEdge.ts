import { MarkerType } from "@xyflow/react";

import { PermissionAccess, PermissionEdge } from "../types";

export const createBaseEdge = ({
  source,
  target,
  access
}: {
  source: string;
  target: string;
  access: PermissionAccess;
}) => {
  const color = access === PermissionAccess.None ? "#707174" : "#ccccce";
  return {
    id: `e-${source}-${target}`,
    source,
    target,
    type: PermissionEdge.Base,
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color
    },
    style: { stroke: color }
  };
};
