import { BaseEdge, BaseEdgeProps, EdgeProps, getSmoothStepPath } from "@xyflow/react";

export const BasePermissionEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerStart,
  markerEnd,
  style
}: Omit<BaseEdgeProps, "path"> & EdgeProps) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY
  });

  return (
    <BaseEdge
      id={id}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={{
        strokeDasharray: "5",
        strokeWidth: 1,
        stroke: "#707174",
        ...style
      }}
      path={edgePath}
    />
  );
};
