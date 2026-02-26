import { useMemo, useState } from "react";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { GripVertical, Plus, Search, Sparkles, X } from "lucide-react";
import { twMerge } from "tailwind-merge";
import type { ObservabilityWidgetListItem } from "@app/hooks/api/observabilityWidgets";

import type { PanelItem } from "../mock-data";
import { PANEL_ITEMS } from "../mock-data";
import { CreateTemplateForm } from "./CreateTemplateForm";
import type { CreateTemplateResult, EditingWidget } from "./CreateTemplateForm";
import { WidgetIcon } from "./WidgetIcon";

function DraggablePanelCard({
  item,
  onAdd,
  onDragStart,
  onDragEnd
}: {
  item: PanelItem;
  onAdd: (id: string, widgetId?: string) => void;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const tmplKey = item.tmpl ?? item.id;

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    onDragStart?.();
    e.dataTransfer.setData(
      "application/json",
      JSON.stringify({ type: "panel-item", tmpl: tmplKey, widgetId: item.widgetId })
    );
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.();
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      className={twMerge(
        "group/card flex items-center gap-2.5 rounded-lg border border-mineshaft-600 bg-mineshaft-800 p-3 transition-all",
        isDragging
          ? "border-primary bg-[#0d1e2e] opacity-40"
          : "hover:border-mineshaft-500 hover:bg-mineshaft-700"
      )}
    >
      <div className="flex cursor-grab items-center self-stretch text-mineshaft-500 transition-colors hover:text-mineshaft-300 active:cursor-grabbing">
        <GripVertical size={14} />
      </div>

      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md"
        style={{ background: item.bg }}
      >
        <WidgetIcon name={item.icon} size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-bunker-100">{item.name}</div>
        <div className="mt-0.5 text-[11px] leading-snug text-mineshaft-300">{item.desc}</div>
        <span
          className={twMerge(
            "mt-1 inline-block rounded-sm px-1.5 py-px text-[9px] font-bold",
            item.badge === "Custom"
              ? "bg-[#2a1f0d] text-[#d29922]"
              : item.category === "inf"
                ? "bg-[#1c2a3a] text-primary"
                : "bg-[#1f1c2a] text-[#bc8cff]"
          )}
        >
          {item.badge}
        </span>
      </div>

      <button
        type="button"
        onClick={() => onAdd(tmplKey, item.widgetId)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-mineshaft-600 text-mineshaft-400 opacity-0 transition-all hover:border-primary hover:bg-primary/10 hover:text-primary group-hover/card:opacity-100"
        title="Click to add"
      >
        <FontAwesomeIcon icon={faPlus} size="xs" />
      </button>
    </div>
  );
}

export function AddWidgetPanel({
  open,
  onClose,
  onAdd,
  isDragging = false,
  customPanelItems = [],
  onCreateTemplate,
  editing,
  onExternalDragStart,
  onExternalDragEnd,
  backendWidgets = []
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (tmpl: string, widgetId?: string) => void;
  isDragging?: boolean;
  customPanelItems?: PanelItem[];
  onCreateTemplate?: (result: CreateTemplateResult) => void;
  editing?: EditingWidget;
  onExternalDragStart?: () => void;
  onExternalDragEnd?: () => void;
  backendWidgets?: ObservabilityWidgetListItem[];
}) {
  const [search, setSearch] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);

  const isEditMode = !!editing;

  const backendPanelItems: PanelItem[] = useMemo(
    () =>
      backendWidgets
        .filter((w) => w.type === "events")
        .map((w) => ({
          id: w.id,
          tmpl: "_backend_events",
          icon: w.icon ?? "Activity",
          bg: w.color ?? "#1c2a3a",
          name: w.name,
          desc: w.description ?? "",
          badge: "Infisical",
          category: "inf" as const,
          widgetId: w.id
        })),
    [backendWidgets]
  );

  const allItems = useMemo(
    () => [...PANEL_ITEMS, ...backendPanelItems, ...customPanelItems],
    [backendPanelItems, customPanelItems]
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return allItems.filter(
      (p) => !q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q)
    );
  }, [search, allItems]);

  const builtIn = filtered.filter((p) => p.category === "inf");
  const org = filtered.filter((p) => p.category === "org");
  const custom = filtered.filter((p) => p.category === "custom");

  return (
    <>
      {/* Overlay - uses pointer-events-none during drag to allow drops through */}
      {open && (
        <div
          className={twMerge(
            "fixed inset-0 z-[299] bg-black/35 transition-opacity",
            isDragging ? "pointer-events-none opacity-20" : "opacity-100"
          )}
          role="presentation"
          onClick={onClose}
        />
      )}

      {/* Panel */}
      <div
        className={twMerge(
          "fixed bottom-0 right-0 top-0 z-[300] flex w-[380px] flex-col border-l border-mineshaft-600 bg-bunker-800 font-inter text-gray-200 shadow-[-8px_0_30px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out",
          open ? "translate-x-0" : "translate-x-full",
          isDragging && "opacity-50"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-mineshaft-600 px-5 py-4">
          <h2 className="text-base font-semibold text-bunker-100">
            {isEditMode ? "Edit Widget" : "Add Widget"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-mineshaft-400 transition-colors hover:bg-mineshaft-700 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        {!isEditMode && (
          <div className="border-b border-mineshaft-600 px-5 py-3">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-mineshaft-300"
              />
              <input
                type="text"
                placeholder="Search widgets..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-mineshaft-600 bg-mineshaft-700 py-2 pl-9 pr-3 text-[13px] text-white outline-none focus:border-primary"
              />
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-5 py-4">

          {isEditMode ? (
            <CreateTemplateForm
              key={editing.uid}
              editing={editing}
              onSubmit={(result) => {
                onCreateTemplate?.(result);
              }}
              onCancel={onClose}
            />
          ) : (
            <>
              <p className="mb-3 text-[11px] text-mineshaft-300">
                Drag a widget onto the dashboard, or click{" "}
                <Plus size={10} className="mx-0.5 inline" /> to add it instantly.
              </p>

              {builtIn.length > 0 && (
                <>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-mineshaft-300">
                    Infisical Built-in
                  </div>
                  <div className="mb-4 flex flex-col gap-1.5">
                    {builtIn.map((p) => (
                      <DraggablePanelCard
                        key={p.id}
                        item={p}
                        onAdd={onAdd}
                        onDragStart={onExternalDragStart}
                        onDragEnd={onExternalDragEnd}
                      />
                    ))}
                  </div>
                </>
              )}

              {org.length > 0 && (
                <>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-mineshaft-300">
                    Organization
                  </div>
                  <div className="mb-4 flex flex-col gap-1.5">
                    {org.map((p) => (
                      <DraggablePanelCard
                        key={p.id}
                        item={p}
                        onAdd={onAdd}
                        onDragStart={onExternalDragStart}
                        onDragEnd={onExternalDragEnd}
                      />
                    ))}
                  </div>
                </>
              )}

              {custom.length > 0 && (
                <>
                  <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-mineshaft-300">
                    Custom
                  </div>
                  <div className="mb-4 flex flex-col gap-1.5">
                    {custom.map((p) => (
                      <DraggablePanelCard
                        key={p.id}
                        item={p}
                        onAdd={onAdd}
                        onDragStart={onExternalDragStart}
                        onDragEnd={onExternalDragEnd}
                      />
                    ))}
                  </div>
                </>
              )}

              {showCreateForm ? (
                <CreateTemplateForm
                  onSubmit={(result) => {
                    onCreateTemplate?.(result);
                    setShowCreateForm(false);
                  }}
                  onCancel={() => setShowCreateForm(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowCreateForm(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-mineshaft-600 py-3 text-[13px] font-medium text-mineshaft-300 transition-colors hover:border-primary/50 hover:bg-primary/5 hover:text-primary"
                >
                  <Sparkles size={14} />
                  Create Custom Widget
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
