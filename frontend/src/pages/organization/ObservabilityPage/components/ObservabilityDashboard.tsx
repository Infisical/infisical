import { useCallback, useMemo, useRef, useState } from "react";
import type { Layout, LayoutItem as RGLLayoutItem } from "react-grid-layout";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import { GridBackground } from "react-grid-layout/extras";
import { Plus, RotateCw } from "lucide-react";

import type { LayoutItem, PanelItem, SubView, WidgetTemplate } from "../mock-data";
import { DEFAULT_LAYOUT, TEMPLATES } from "../mock-data";
import { AddWidgetPanel } from "./AddWidgetPanel";
import type { CreateTemplateResult, EditingWidget } from "./CreateTemplateForm";
import { SidebarNav } from "./SidebarNav";
import { WidgetCard } from "./WidgetCard";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";

const resizeHandleStyles = `
  /* Custom resize handle styling - diagonal lines icon */
  .react-grid-item > .react-resizable-handle {
    position: absolute;
    width: 26px;
    height: 26px;
    bottom: 2px;
    right: 2px;
    cursor: se-resize;
    background: transparent;
    border-radius: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background-color 0.15s ease;
    z-index: 10;
  }
  .react-grid-item > .react-resizable-handle:hover {
    background-color: rgba(255, 255, 255, 0.05);
  }
  .react-grid-item > .react-resizable-handle::before {
    content: '';
    position: absolute;
    width: 14px;
    height: 14px;
    background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12 2L2 12M12 6L6 12M12 10L10 12' stroke='%239ca3af' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
  }
  .react-grid-item > .react-resizable-handle:hover::before {
    background-image: url("data:image/svg+xml,%3Csvg width='14' height='14' viewBox='0 0 14 14' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M12 2L2 12M12 6L6 12M12 10L10 12' stroke='%23d1d5db' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E");
  }
  .react-grid-item > .react-resizable-handle::after {
    display: none;
  }

  /* Locked widget styles - hide resize handle */
  .react-grid-item.widget-locked > .react-resizable-handle {
    display: none !important;
  }
  .react-grid-item.widget-locked {
    cursor: default;
  }
  .react-grid-item.widget-locked .drag-handle {
    cursor: default !important;
  }

  /* Drag and placeholder styles */
  .react-grid-item.react-draggable-dragging {
    z-index: 100;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.4);
  }
  .react-grid-placeholder {
    background: rgba(99, 102, 241, 0.15) !important;
    border: 2px dashed rgba(99, 102, 241, 0.5) !important;
    border-radius: 10px;
  }
`;

const GRID_COLS = 12;
const ROW_HEIGHT = 200;
const GRID_MARGIN: [number, number] = [16, 16];

export function ObservabilityDashboard() {
  const { width, containerRef, mounted } = useContainerWidth();

  const [activeView, setActiveView] = useState("org");
  const [subViews, setSubViews] = useState<SubView[]>([]);
  const [layouts, setLayouts] = useState<Record<string, LayoutItem[]>>({
    org: [...DEFAULT_LAYOUT],
    private: []
  });

  const [panelOpen, setPanelOpen] = useState(false);
  const [isExternalDragging, setIsExternalDragging] = useState(false);
  const uidCounter = useRef(100);

  const [customTemplates, setCustomTemplates] = useState<Record<string, WidgetTemplate>>({});
  const [customPanelItems, setCustomPanelItems] = useState<PanelItem[]>([]);
  const allTemplates = useMemo(() => ({ ...TEMPLATES, ...customTemplates }), [customTemplates]);

  const [editingWidget, setEditingWidget] = useState<EditingWidget | undefined>(undefined);

  const layout = Array.isArray(layouts[activeView]) ? (layouts[activeView] as LayoutItem[]) : [];
  const setLayout = useCallback(
    (updater: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => {
      setLayouts((prev) => {
        const currentLayout = Array.isArray(prev[activeView])
          ? (prev[activeView] as LayoutItem[])
          : [];
        return {
          ...prev,
          [activeView]: typeof updater === "function" ? updater(currentLayout) : updater
        };
      });
    },
    [activeView]
  );

  const handleAddSubView = useCallback((name: string) => {
    const id = `view-${Date.now()}`;
    setSubViews((prev) => [...prev, { id, name }]);
    setLayouts((prev) => ({ ...prev, [id]: [] }));
    setActiveView(id);
  }, []);

  const handleRenameSubView = useCallback((id: string, name: string) => {
    setSubViews((prev) => prev.map((sv) => (sv.id === id ? { ...sv, name } : sv)));
  }, []);

  const handleDeleteSubView = useCallback(
    (id: string) => {
      setSubViews((prev) => prev.filter((sv) => sv.id !== id));
      setLayouts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      if (activeView === id) setActiveView("private");
    },
    [activeView]
  );

  const handleEditWidget = useCallback(
    (uid: string, tmplKey: string) => {
      const template = allTemplates[tmplKey];
      if (!template) return;
      setEditingWidget({ uid, tmplKey, template });
      setPanelOpen(true);
    },
    [allTemplates]
  );

  const handleCreateTemplate = useCallback(
    (result: CreateTemplateResult) => {
      setCustomTemplates((prev) => ({ ...prev, [result.key]: result.template }));

      if (editingWidget) {
        setCustomPanelItems((prev) => {
          const exists = prev.some((p) => p.id === result.key);
          if (exists) return prev.map((p) => (p.id === result.key ? result.panelItem : p));
          return [...prev, result.panelItem];
        });
        setEditingWidget(undefined);
      } else {
        setCustomPanelItems((prev) => [...prev, result.panelItem]);
        uidCounter.current += 1;
        const uid = `w${uidCounter.current}`;
        const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
        setLayout((prev) => [
          ...prev,
          {
            uid,
            tmpl: result.key,
            x: 0,
            y: maxY,
            w: result.template.isLogs ? 12 : 6,
            h: 2
          }
        ]);
      }
      setPanelOpen(false);
    },
    [setLayout, editingWidget, layout]
  );

  const addWidget = useCallback(
    (tmpl: string) => {
      uidCounter.current += 1;
      const uid = `w${uidCounter.current}`;
      const t = allTemplates[tmpl];
      const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
      setLayout((prev) => [
        ...prev,
        {
          uid,
          tmpl,
          x: 0,
          y: maxY,
          w: t?.isLogs ? 12 : 6,
          h: 2
        }
      ]);
      setPanelOpen(false);
    },
    [allTemplates, setLayout, layout]
  );

  const removeWidget = useCallback(
    (uid: string) => {
      setLayout((prev) => prev.filter((item) => item.uid !== uid));
    },
    [setLayout]
  );

  const toggleWidgetLock = useCallback(
    (uid: string) => {
      setLayout((prev) =>
        prev.map((item) => (item.uid === uid ? { ...item, static: !item.static } : item))
      );
    },
    [setLayout]
  );

  const handleLayoutChange = useCallback(
    (newLayout: Layout) => {
      setLayout((prev) =>
        prev.map((item) => {
          const rglItem = newLayout.find((l) => l.i === item.uid);
          if (!rglItem) return item;
          return {
            ...item,
            x: rglItem.x,
            y: rglItem.y,
            w: rglItem.w,
            h: rglItem.h
          };
        })
      );
    },
    [setLayout]
  );

  const handleDrop = useCallback(
    (newLayout: Layout, layoutItem: RGLLayoutItem | undefined, e: Event) => {
      setIsExternalDragging(false);

      if (!layoutItem) return;

      const dragEvent = e as DragEvent;
      if (!dragEvent.dataTransfer) return;

      try {
        const data = JSON.parse(dragEvent.dataTransfer.getData("application/json")) as {
          type: string;
          tmpl: string;
        };
        if (data.type === "panel-item" && data.tmpl) {
          uidCounter.current += 1;
          const uid = `w${uidCounter.current}`;
          const t = allTemplates[data.tmpl];

          // Find the dropping placeholder to get its final position
          const droppingPlaceholder = newLayout.find((item) => item.i === "__dropping-elem__");
          const droppedItemPosition = droppingPlaceholder
            ? { x: droppingPlaceholder.x, y: droppingPlaceholder.y }
            : { x: layoutItem.x, y: layoutItem.y };

          // Update existing items with their new positions from the compacted layout
          const updatedExistingItems: LayoutItem[] = newLayout
            .filter((rglItem) => rglItem.i !== "__dropping-elem__")
            .map((rglItem) => {
              const existingItem = layout.find((item) => item.uid === rglItem.i);
              if (!existingItem) return null;
              return {
                ...existingItem,
                x: rglItem.x,
                y: rglItem.y,
                w: rglItem.w,
                h: rglItem.h
              };
            })
            .filter((item): item is LayoutItem => item !== null);

          // Add the new widget
          setLayout([
            ...updatedExistingItems,
            {
              uid,
              tmpl: data.tmpl,
              x: droppedItemPosition.x,
              y: droppedItemPosition.y,
              w: t?.isLogs ? 12 : 6,
              h: 2
            }
          ]);
        }
      } catch {
        // Invalid drag data
      }
    },
    [allTemplates, setLayout, layout]
  );

  const handleDropDragOver = useCallback(
    (e: React.DragEvent): { w: number; h: number } | false | undefined => {
      if (!e.dataTransfer) return false;

      try {
        const { types } = e.dataTransfer;
        if (types.includes("application/json")) {
          setIsExternalDragging(true);
          return { w: 6, h: 2 };
        }
      } catch {
        // Ignore
      }
      return false;
    },
    []
  );

  const handleExternalDragStart = useCallback(() => {
    setIsExternalDragging(true);
  }, []);

  const handleExternalDragEnd = useCallback(() => {
    setIsExternalDragging(false);
  }, []);

  const rglLayout: Layout = useMemo(
    () =>
      layout.map((item) => ({
        i: item.uid,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        minW: 2,
        maxW: 12,
        minH: 1,
        maxH: 6,
        static: item.static ?? false
      })),
    [layout]
  );

  const getViewLabel = () => {
    if (activeView === "org") return "Organization";
    if (activeView === "private") return "Private";
    return subViews.find((s) => s.id === activeView)?.name ?? "View";
  };
  const viewLabel = getViewLabel();

  const gridRows = Math.max(
    6,
    Math.ceil(layout.reduce((max, item) => Math.max(max, item.y + item.h), 0) + 2)
  );

  return (
    <>
      <style>{resizeHandleStyles}</style>
      <div className="flex min-h-0 flex-1">
        <SidebarNav
          activeView={activeView}
          onChangeView={setActiveView}
          subViews={subViews}
          onAddSubView={handleAddSubView}
          onRenameSubView={handleRenameSubView}
          onDeleteSubView={handleDeleteSubView}
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Page Header */}
          <div className="flex items-start justify-between px-8 pt-7 select-none">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1c2a3a] text-lg text-primary">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </div>
              <div>
                <h1 className="text-[22px] font-semibold text-bunker-100">Observability</h1>
                <p className="mt-0.5 text-[13px] text-mineshaft-300">{viewLabel} view</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 text-[12px] text-mineshaft-300">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-green-500" />
                Live - refreshes every 30s
              </div>
              <button
                type="button"
                onClick={() => setLayout((prev) => [...prev])}
                className="flex items-center justify-center rounded-md border border-mineshaft-600 bg-mineshaft-700 px-2.5 py-1.5 text-mineshaft-300 transition-colors hover:bg-mineshaft-600 hover:text-white"
              >
                <RotateCw size={14} />
              </button>
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="flex items-center gap-1.5 rounded-md bg-[#238636] px-3.5 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-[#2ea043]"
              >
                <Plus size={14} />
                Add Widget
              </button>
            </div>
          </div>

          {/* Grid */}
          <div className="flex-1 overflow-auto px-8 pt-5 pb-8">
            {layout.length > 0 || isExternalDragging ? (
              <div
                ref={containerRef as React.RefObject<HTMLDivElement>}
                style={{ position: "relative" }}
              >
                {mounted && (
                  <>
                    {isExternalDragging && (
                      <GridBackground
                        width={width}
                        cols={GRID_COLS}
                        rowHeight={ROW_HEIGHT}
                        margin={GRID_MARGIN}
                        rows={gridRows}
                        color="rgba(99, 102, 241, 0.12)"
                        borderRadius={8}
                      />
                    )}
                    <GridLayout
                      width={width}
                      layout={rglLayout}
                      gridConfig={{
                        cols: GRID_COLS,
                        rowHeight: ROW_HEIGHT,
                        margin: GRID_MARGIN
                      }}
                      dragConfig={{
                        enabled: true,
                        handle: ".drag-handle"
                      }}
                      resizeConfig={{
                        enabled: true,
                        handles: ["se"]
                      }}
                      dropConfig={{
                        enabled: true,
                        defaultItem: { w: 6, h: 2 }
                      }}
                      onLayoutChange={handleLayoutChange}
                      onDrop={handleDrop}
                      onDropDragOver={handleDropDragOver}
                    >
                      {layout.map((item) => (
                        <div key={item.uid} className={item.static ? "widget-locked" : undefined}>
                          <WidgetCard
                            item={item}
                            templates={allTemplates}
                            onRemove={removeWidget}
                            onEdit={handleEditWidget}
                            onToggleLock={toggleWidgetLock}
                          />
                        </div>
                      ))}
                    </GridLayout>
                  </>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="mb-3 text-[28px] text-mineshaft-500">+</div>
                <p className="mb-1 text-[14px] text-mineshaft-300">No widgets yet</p>
                <button
                  type="button"
                  onClick={() => setPanelOpen(true)}
                  className="text-[13px] font-medium text-primary transition-colors hover:text-primary/80"
                >
                  Add your first widget
                </button>
              </div>
            )}
          </div>
        </main>

        {/* Side Panel */}
        <AddWidgetPanel
          open={panelOpen}
          onClose={() => {
            setPanelOpen(false);
            setEditingWidget(undefined);
          }}
          onAdd={addWidget}
          isDragging={isExternalDragging}
          customPanelItems={customPanelItems}
          onCreateTemplate={handleCreateTemplate}
          editing={editingWidget}
          onExternalDragStart={handleExternalDragStart}
          onExternalDragEnd={handleExternalDragEnd}
        />
      </div>
    </>
  );
}
