import { useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";
import { BoxIcon, CloudIcon, CodeIcon, CopyIcon, DollarSignIcon, XIcon } from "lucide-react";

import { Badge } from "@app/components/v3";
import { TInfraFile, TInfraResource } from "@app/hooks/api/infra/types";

/** Find the file and line where a resource is defined in HCL source */
const findResourceInFiles = (
  resource: TInfraResource,
  files: TInfraFile[]
): { file: string; line: number } | null => {
  // HCL pattern: resource "type" "name" {
  const pattern = new RegExp(
    `resource\\s+"${resource.type.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s+"${resource.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`
  );

  for (const f of files) {
    const lines = f.content.split("\n");
    for (let i = 0; i < lines.length; i += 1) {
      if (pattern.test(lines[i])) {
        return { file: f.name, line: i + 1 };
      }
    }
  }
  return null;
};

const AttributesPanel = ({ attributes }: { attributes: Record<string, unknown> }) => {
  const entries = Object.entries(attributes).filter(
    ([, v]) => v !== null && v !== undefined && v !== ""
  );

  if (entries.length === 0) {
    return <span className="text-xs text-mineshaft-500">No attributes</span>;
  }

  return (
    <div className="grid min-w-0 grid-cols-[auto_1fr] gap-x-4 gap-y-1 overflow-hidden">
      {entries.map(([key, val]) => (
        <div key={key} className="contents">
          <span className="font-mono text-xs text-mineshaft-400">{key}</span>
          <span className="truncate font-mono text-xs text-mineshaft-200">
            {typeof val === "object" ? JSON.stringify(val) : String(val)}
          </span>
        </div>
      ))}
    </div>
  );
};

export { AttributesPanel };

/** Circular countdown timer SVG */
const CycleTimer = ({
  durationMs,
  nodeKey
}: {
  durationMs: number;
  nodeKey: string; // changes on each cycle to restart animation
}) => {
  const r = 7;
  const circumference = 2 * Math.PI * r;

  return (
    <div className="flex size-5 items-center justify-center" title="Auto-cycling">
      <svg className="size-5 -rotate-90" viewBox="0 0 18 18">
        {/* Track */}
        <circle
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-mineshaft-600"
          strokeWidth="2"
        />
        {/* Animated arc */}
        <circle
          key={nodeKey}
          cx="9"
          cy="9"
          r={r}
          fill="none"
          stroke="currentColor"
          className="text-primary"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference}
          style={{
            animation: `cycle-countdown ${durationMs}ms linear forwards`
          }}
        />
      </svg>
      <style>{`
        @keyframes cycle-countdown {
          from { stroke-dashoffset: ${circumference}; }
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
};

export type CycleTimerProps = {
  durationMs: number;
  active: boolean;
  nodeKey: string;
};

export const ResourceDetailPanel = ({
  resource,
  costMap,
  onClose,
  cycleTimer,
  files
}: {
  resource: TInfraResource;
  costMap: Record<string, string>;
  onClose: () => void;
  cycleTimer?: CycleTimerProps;
  files?: TInfraFile[];
}) => {
  const { orgId, projectId } = useParams({ strict: false }) as {
    orgId: string;
    projectId: string;
  };

  const sourceLocation = useMemo(
    () => (files ? findResourceInFiles(resource, files) : null),
    [resource, files]
  );

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(resource.address);
  };

  const deps = resource.dependsOn ?? [];

  return (
    <div className="flex h-full w-[380px] shrink-0 flex-col rounded-r-lg border border-mineshaft-600 bg-bunker-600">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-mineshaft-600 px-4 py-3">
        <div className="flex items-center gap-2 overflow-hidden">
          {cycleTimer?.active ? (
            <CycleTimer durationMs={cycleTimer.durationMs} nodeKey={cycleTimer.nodeKey} />
          ) : (
            <BoxIcon className="size-4 shrink-0 text-primary" />
          )}
          <span className="truncate text-sm font-medium text-mineshaft-100">{resource.name}</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-mineshaft-400 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-200"
        >
          <XIcon className="size-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-5">
          {/* Type & Provider */}
          <div className="flex flex-col gap-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wider text-mineshaft-500 uppercase">
                Type
              </p>
              <span className="font-mono text-xs text-primary">{resource.type}</span>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wider text-mineshaft-500 uppercase">
                Provider
              </p>
              <Badge variant="neutral">
                <CloudIcon className="size-3" />
                {resource.provider}
              </Badge>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold tracking-wider text-mineshaft-500 uppercase">
                Address
              </p>
              <button
                type="button"
                onClick={handleCopyAddress}
                className="group flex items-center gap-1.5"
              >
                <span className="font-mono text-xs text-mineshaft-300">{resource.address}</span>
                <CopyIcon className="size-3 text-mineshaft-500 opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            </div>
            {sourceLocation && (
              <div>
                <Link
                  to="/organizations/$orgId/projects/infra/$projectId/editor"
                  params={{ orgId, projectId }}
                  search={{ file: sourceLocation.file, line: sourceLocation.line }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-mineshaft-600 bg-mineshaft-700 px-3 py-1.5 text-xs font-medium text-mineshaft-200 transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
                >
                  <CodeIcon className="size-3.5" />
                  Go to code
                  <span className="font-mono text-mineshaft-400">
                    {sourceLocation.file}:{sourceLocation.line}
                  </span>
                </Link>
              </div>
            )}
            {costMap[resource.address] && (
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wider text-mineshaft-500 uppercase">
                  Estimated Cost
                </p>
                <Badge variant="neutral">
                  <DollarSignIcon className="size-3" />
                  {costMap[resource.address]}/mo
                </Badge>
              </div>
            )}
            {deps.length > 0 && (
              <div>
                <p className="mb-1 text-[11px] font-semibold tracking-wider text-mineshaft-500 uppercase">
                  Dependencies
                </p>
                <div className="flex flex-col gap-1">
                  {deps.map((dep) => (
                    <span key={dep} className="font-mono text-xs text-mineshaft-400">
                      {dep}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Attributes */}
          <div>
            <p className="mb-2 text-[11px] font-semibold tracking-wider text-mineshaft-500 uppercase">
              Attributes
            </p>
            <AttributesPanel attributes={resource.attributes ?? {}} />
          </div>
        </div>
      </div>
    </div>
  );
};
