import { NodeProps } from "@xyflow/react";

import { cn } from "@app/components/v3/utils";

export type TBandLabelNodeData = {
  label: string;
  detail: string;
  // Warning is reserved for the ghost band: the colour is the only thing marking it as a finding rather
  // than a section, now that it has no edges to distinguish it.
  tone?: "neutral" | "warning";
};

/**
 * A section heading inside the canvas. A node rather than an overlay so it takes part in the same column
 * math as everything else: positioning it absolutely against a centred stack put it on top of the last
 * principal the first time it was tried.
 */
export const BandLabelNode = ({ data }: NodeProps & { data: TBandLabelNodeData }) => (
  <div className="flex h-full w-full flex-col justify-end gap-0.5 whitespace-nowrap">
    <span
      className={cn(
        "text-xs tracking-wide uppercase",
        data.tone === "warning" ? "text-warning" : "text-accent"
      )}
    >
      {data.label}
    </span>
    <span className="text-xs text-muted">{data.detail}</span>
  </div>
);
