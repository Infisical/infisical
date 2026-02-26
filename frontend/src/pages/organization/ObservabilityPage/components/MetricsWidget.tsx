import { ExternalLink, GripVertical, Lock, LockOpen } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Tooltip } from "@app/components/v2";
import { useGetWidgetMetrics } from "@app/hooks/api/observabilityWidgets";

import { WidgetIcon } from "./WidgetIcon";

export function MetricsWidget({
  isLocked = false,
  onToggleLock,
  widgetId,
  color,
  icon
}: {
  isLocked?: boolean;
  onToggleLock?: () => void;
  widgetId?: string;
  color?: string;
  icon?: string;
}) {
  const { data, isLoading } = useGetWidgetMetrics(widgetId);

  const resolvedColor = data?.widget.color ?? color ?? "#3b82f6";
  const resolvedIcon = data?.widget.icon ?? icon ?? "Activity";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center border-b border-mineshaft-600">
        <div
          className="drag-handle flex cursor-grab items-center self-stretch border-r border-mineshaft-600 px-1.5 text-mineshaft-500 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-300 active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical size={14} />
        </div>
        <div className="flex flex-1 items-center justify-between px-3 py-2.5">
          <div className="flex items-center gap-2">
            <div
              className="flex h-[22px] w-[22px] items-center justify-center rounded-[5px]"
              style={{ background: `${resolvedColor}22` }}
            >
              <WidgetIcon name={resolvedIcon} size={12} style={{ color: resolvedColor }} />
            </div>
            <span className="text-[13px] font-medium text-bunker-100">
              {data?.widget.name ?? "Metrics"}
            </span>
          </div>
          <span className="flex items-center gap-1 rounded border border-mineshaft-600 bg-bunker-800 px-1.5 py-0.5 text-[10px] text-mineshaft-300">
            <span className="inline-block h-[5px] w-[5px] animate-pulse rounded-full bg-blue-500" />
            {data
              ? data.widget.refreshInterval < 60
                ? `${data.widget.refreshInterval}s`
                : `${Math.round(data.widget.refreshInterval / 60)}m`
              : "30s"}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col items-center justify-center gap-1 px-6 py-4">
        {!widgetId ? (
          <span className="text-[11px] text-mineshaft-300">No widget connected</span>
        ) : isLoading && !data ? (
          <span className="text-[11px] text-mineshaft-300">Loading...</span>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span
                className="text-5xl font-bold tabular-nums"
                style={{ color: resolvedColor }}
              >
                {data?.value ?? 0}
              </span>
              {data?.unit && (
                <span className="text-lg text-mineshaft-300">{data.unit}</span>
              )}
            </div>
            <span className="mt-1 text-center text-[12px] text-mineshaft-300">{data?.label}</span>
            {data?.link && (
              <a
                href={data.link}
                className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
              >
                <ExternalLink size={10} />
                View all
              </a>
            )}
          </>
        )}
      </div>

      {/* Footer with lock button */}
      <div className="flex items-center justify-end gap-2 border-t border-mineshaft-600 bg-bunker-800 py-1.5 pl-3.5 pr-10">
        <Tooltip content={isLocked ? "Unlock widget" : "Lock widget"}>
          <button
            type="button"
            onClick={onToggleLock}
            className={twMerge(
              "flex h-[26px] w-[26px] items-center justify-center rounded-[5px] transition-colors",
              isLocked
                ? "bg-amber-900/30 text-amber-400 hover:bg-amber-900/50"
                : "text-mineshaft-400 hover:bg-mineshaft-600 hover:text-mineshaft-200"
            )}
            aria-label={isLocked ? "Unlock widget" : "Lock widget"}
          >
            {isLocked ? <Lock size={14} /> : <LockOpen size={14} />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
