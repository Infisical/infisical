import { X } from "lucide-react";
import { twMerge } from "tailwind-merge";

import type { LayoutItem, WidgetTemplate } from "../widget-config";
import { LogsWidget } from "./LogsWidget";
import { MetricsWidget } from "./MetricsWidget";
import { TableWidget } from "./TableWidget";

interface WidgetCardProps {
  item: LayoutItem;
  templates: Record<string, WidgetTemplate>;
  onRemove: (uid: string) => void;
  onEdit?: (uid: string, tmplKey: string) => void;
  onToggleLock?: (uid: string) => void;
  isBuiltIn?: boolean;
}

export function WidgetCard({
  item,
  templates,
  onRemove,
  onEdit,
  onToggleLock,
  isBuiltIn = false
}: WidgetCardProps) {
  const template = templates[item.tmpl];
  if (!template) return null;

  const isLocked = item.static ?? false;
  const canEdit = !isBuiltIn && !!onEdit;

  return (
    <div
      className={twMerge(
        "widget-card group relative flex h-full flex-col rounded-[10px] border border-mineshaft-600 bg-mineshaft-800",
        "hover:border-mineshaft-500",
        isLocked && "widget-locked"
      )}
      style={{ borderColor: template.borderColor ?? undefined }}
    >
      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(item.uid)}
        className="absolute -right-2 -top-2 z-30 hidden h-5 w-5 items-center justify-center rounded-full border border-[#6e1a1a] bg-[#2b0d0d] text-red-400 shadow-md transition-colors hover:bg-[#3d1010] group-hover:flex"
        aria-label="Remove widget"
      >
        <X size={10} />
      </button>

      <div className="flex flex-1 flex-col overflow-hidden rounded-[10px]">
        {template.isLogs ? (
          <LogsWidget
            isLocked={isLocked}
            onToggleLock={() => onToggleLock?.(item.uid)}
            onEdit={canEdit ? () => onEdit(item.uid, item.tmpl) : undefined}
            widgetId={item.widgetId}
          />
        ) : template.isMetrics ? (
          <MetricsWidget
            isLocked={isLocked}
            onToggleLock={() => onToggleLock?.(item.uid)}
            widgetId={item.widgetId}
          />
        ) : (
          <TableWidget
            template={template}
            onEdit={canEdit ? () => onEdit(item.uid, item.tmpl) : undefined}
            isLocked={isLocked}
            onToggleLock={() => onToggleLock?.(item.uid)}
            widgetId={item.widgetId}
          />
        )}
      </div>
    </div>
  );
}
