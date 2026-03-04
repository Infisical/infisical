import { BaseEdge, BaseEdgeProps, EdgeProps, getSmoothStepPath } from "@xyflow/react";

export const SecretReferenceEdge = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  markerStart,
  markerEnd,
  data
}: Omit<BaseEdgeProps, "path"> & EdgeProps) => {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY
  });

  const isCircular = data?.isCircular as boolean | undefined;

  return (
    <BaseEdge
      id={id}
      markerStart={markerStart}
      markerEnd={markerEnd}
      style={{
        strokeDasharray: "5",
        strokeWidth: 1,
        stroke: isCircular ? "#ef4444" : "#707174"
      }}
      path={edgePath}
    />
  );
};
