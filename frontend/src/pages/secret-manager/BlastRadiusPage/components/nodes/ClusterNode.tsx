import { Handle, NodeProps, Position } from "@xyflow/react";
import { LayersIcon } from "lucide-react";

import { Badge } from "@app/components/v3";

import { TClusterNodeData } from "../../utils/buildGraph";

/**
 * A collapsed set of principals, counted in every total above and expandable in place. Distinct from
 * truncation: nothing here is missing from the numbers, it is only folded on the canvas.
 */
export const ClusterNode = ({ data, selected }: NodeProps & { data: TClusterNodeData }) => (
  <div
    className={`flex h-full w-full cursor-pointer flex-col justify-center gap-1 rounded-sm border border-dashed bg-card px-2.5 py-2 ${
      selected ? "border-foreground" : "border-border"
    }`}
  >
    <div className="flex items-center gap-1.5">
      <LayersIcon size={13} className="shrink-0 text-accent" />
      <p className="truncate text-xs font-medium text-foreground">{data.label}</p>
    </div>
    <Badge variant="neutral" className="w-fit">
      cluster
    </Badge>
    <p className="truncate text-xs text-accent">{data.detail}</p>

    <Handle type="source" position={Position.Right} className="!opacity-0" />
  </div>
);
