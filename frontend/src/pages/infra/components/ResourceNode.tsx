import { Handle, type NodeProps, Position } from "@xyflow/react";
import { BoxIcon } from "lucide-react";
import { twMerge } from "tailwind-merge";

export type ResourceNodeData = {
  resourceType: string;
  resourceName: string;
  action?: string; // create | update | delete | replace
  compact?: boolean;
  selected?: boolean;
};

const ACTION_STYLES: Record<string, { border: string; bg: string; text: string }> = {
  create: { border: "border-green-500/60", bg: "bg-green-500/10", text: "text-green-400" },
  update: { border: "border-yellow-500/60", bg: "bg-yellow-500/10", text: "text-yellow-400" },
  replace: { border: "border-yellow-500/60", bg: "bg-yellow-500/10", text: "text-yellow-400" },
  delete: { border: "border-red-500/60", bg: "bg-red-500/10", text: "text-red-400" }
};

const DEFAULT_STYLE = { border: "border-mineshaft-500/60", bg: "bg-mineshaft-800", text: "text-mineshaft-300" };

export const ResourceNode = ({ data }: NodeProps & { data: ResourceNodeData }) => {
  const { resourceType, resourceName, action, compact, selected } = data;
  const style = (action && ACTION_STYLES[action]) || DEFAULT_STYLE;

  return (
    <>
      <Handle
        type="target"
        className="pointer-events-none !opacity-0"
        position={Position.Top}
      />
      <div
        className={twMerge(
          "overflow-hidden rounded-lg border shadow-lg transition-all",
          style.border,
          style.bg,
          compact ? "w-[150px] px-2.5 py-1.5" : "w-[200px] px-3 py-2",
          selected && "border-primary ring-2 ring-primary/30"
        )}
      >
        <div className="flex items-center gap-1.5 overflow-hidden">
          <BoxIcon className={twMerge("shrink-0", style.text, compact ? "size-3" : "size-3.5")} />
          <span
            className={twMerge(
              "truncate font-mono font-medium",
              style.text,
              compact ? "text-[10px]" : "text-xs"
            )}
          >
            {resourceType}
          </span>
        </div>
        <p
          className={twMerge(
            "truncate text-mineshaft-200",
            compact ? "mt-0 text-[10px]" : "mt-0.5 text-[11px]"
          )}
        >
          {resourceName}
        </p>
      </div>
      <Handle
        type="source"
        className="pointer-events-none !opacity-0"
        position={Position.Bottom}
      />
    </>
  );
};
