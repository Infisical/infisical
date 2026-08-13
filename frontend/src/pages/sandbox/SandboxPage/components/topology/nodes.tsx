import { Handle, NodeProps, Position } from "@xyflow/react";
import {
  BotIcon,
  DatabaseIcon,
  GlobeIcon,
  KeyRoundIcon,
  ShieldCheckIcon,
  TerminalIcon
} from "lucide-react";

import { Badge } from "@app/components/v3";

/**
 * Every node is the same card with a different accent, so the diagram reads as one system rather
 * than a collection of shapes. The accent is the only thing that separates what the sandbox is from
 * what it can reach, and the broker sits between them because that is literally where it sits.
 */

export type TTopologyNodeData = {
  label: string;
  sublabel?: string;
  /** Live count of what has flowed through this node, when there is anything to count. */
  count?: number;
  tone: "sandbox" | "broker" | "integration" | "pam" | "blocked";
};

const TONE = {
  sandbox: { ring: "border-info/40", glow: "bg-info/10", text: "text-info", icon: BotIcon },
  broker: {
    ring: "border-project/50",
    glow: "bg-project/10",
    text: "text-project",
    icon: ShieldCheckIcon
  },
  integration: {
    ring: "border-success/40",
    glow: "bg-success/10",
    text: "text-success",
    icon: GlobeIcon
  },
  pam: { ring: "border-info/40", glow: "bg-info/10", text: "text-info", icon: DatabaseIcon },
  blocked: {
    ring: "border-danger/40",
    glow: "bg-danger/10",
    text: "text-danger",
    icon: KeyRoundIcon
  }
};

export const TopologyNode = ({ data }: NodeProps & { data: TTopologyNodeData }) => {
  const tone = TONE[data.tone] ?? TONE.integration;
  const Icon = tone.icon;

  return (
    <div
      className={`flex h-[58px] min-w-[190px] items-center gap-3 rounded-lg border ${tone.ring} bg-card px-3 shadow-lg`}
    >
      {/* Both handles on every node, so an edge can enter or leave without a per-node special case. */}
      <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-border" />

      <span
        className={`flex size-8 shrink-0 items-center justify-center rounded-md ${tone.glow} ${tone.text}`}
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{data.label}</p>
        {data.sublabel && (
          <p className="truncate font-mono text-[10px] text-muted">{data.sublabel}</p>
        )}
      </div>

      {data.count !== undefined && data.count > 0 && (
        <Badge variant="neutral" className={`ml-auto shrink-0 ${tone.text}`}>
          {data.count}
        </Badge>
      )}

      <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border" />
    </div>
  );
};

/**
 * The sandbox itself. Same height as every other node on purpose: handles centre vertically, so a
 * taller node would bend the edge leaving it. It reads as the origin through width and weight.
 */
export const SandboxNode = ({ data }: NodeProps & { data: TTopologyNodeData }) => (
  <div className="flex h-[58px] min-w-[210px] items-center gap-3 rounded-lg border border-info/40 bg-card px-4 shadow-lg">
    <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-info/10 text-info">
      <TerminalIcon className="size-4" />
    </span>
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-foreground">{data.label}</p>
      <p className="truncate text-[10px] text-muted">{data.sublabel}</p>
    </div>
    <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-border" />
  </div>
);

export const NODE_TYPES = { topology: TopologyNode, sandbox: SandboxNode };
