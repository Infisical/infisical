import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Layout, LayoutItem as RGLLayoutItem } from "react-grid-layout";
import { GridLayout, useContainerWidth } from "react-grid-layout";
import { GridBackground } from "react-grid-layout/extras";
import { LayoutGrid, Plus } from "lucide-react";

import {
  Button,
  EmptyMedia,
  UnstableEmpty,
  UnstableEmptyDescription,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";

import { useOrganization } from "@app/context";
import { useListWidgets } from "@app/hooks/api/observabilityWidgets";

import type { LayoutItem, PanelItem, SubView, WidgetTemplate } from "../mock-data";
import { TEMPLATES } from "../mock-data";
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

interface ObservabilityDashboardProps {
  panelOpen: boolean;
  onPanelOpenChange: (open: boolean) => void;
}

export function ObservabilityDashboard({
  panelOpen,
  onPanelOpenChange
}: ObservabilityDashboardProps) {
  const { width, containerRef, mounted } = useContainerWidth();
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id ?? "";
  const { data: backendWidgets = [] } = useListWidgets(orgId);

  const [activeView, setActiveView] = useState<string | null>(null);
  const [orgViews, setOrgViews] = useState<SubView[]>([]);
  const [privateViews, setPrivateViews] = useState<SubView[]>([]);
  const [layouts, setLayouts] = useState<Record<string, LayoutItem[]>>({});

  const [isExternalDragging, setIsExternalDragging] = useState(false);
  const uidCounter = useRef(100);

  useEffect(() => {
    if (backendWidgets.length === 0) return;
    setLayouts((prev) => {
      if (prev.org.length > 0) return prev;
      const eventWidgets = backendWidgets.filter((w) => w.type === "events");
      const seeded: LayoutItem[] = eventWidgets.map((w, i) => ({
        uid: `backend-${w.id}`,
        tmpl: "_backend_events",
        widgetId: w.id,
        x: (i % 2) * 6,
        y: Math.floor(i / 2) * 2,
        w: 6,
        h: 2
      }));
      return { ...prev, org: seeded };
    });
  }, [backendWidgets]);

  const [customTemplates, setCustomTemplates] = useState<Record<string, WidgetTemplate>>({});
  const [customPanelItems, setCustomPanelItems] = useState<PanelItem[]>([]);
  const allTemplates = useMemo(() => ({ ...TEMPLATES, ...customTemplates }), [customTemplates]);

  const [editingWidget, setEditingWidget] = useState<EditingWidget | undefined>(undefined);

  const layout = activeView && Array.isArray(layouts[activeView]) ? layouts[activeView] : [];
  const setLayout = useCallback(
    (updater: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => {
      if (!activeView) return;
      setLayouts((prev) => {
        const currentLayout = Array.isArray(prev[activeView]) ? prev[activeView] : [];
        return {
          ...prev,
          [activeView]: typeof updater === "function" ? updater(currentLayout) : updater
        };
      });
    },
    [activeView]
  );

  const handleAddOrgView = useCallback((name: string) => {
    const id = `org-view-${Date.now()}`;
    setOrgViews((prev) => [...prev, { id, name }]);
    setLayouts((prev) => ({ ...prev, [id]: [...DEFAULT_LAYOUT] }));
    setActiveView(id);
  }, []);

  const handleAddPrivateView = useCallback((name: string) => {
    const id = `private-view-${Date.now()}`;
    setPrivateViews((prev) => [...prev, { id, name }]);
    setLayouts((prev) => ({ ...prev, [id]: [] }));
    setActiveView(id);
  }, []);

  const handleRenameView = useCallback((id: string, name: string) => {
    setOrgViews((prev) => prev.map((sv) => (sv.id === id ? { ...sv, name } : sv)));
    setPrivateViews((prev) => prev.map((sv) => (sv.id === id ? { ...sv, name } : sv)));
  }, []);

  const handleDeleteView = useCallback(
    (id: string) => {
      const isOrgView = orgViews.some((v) => v.id === id);
      const isPrivateView = privateViews.some((v) => v.id === id);

      if (isOrgView) {
        setOrgViews((prev) => prev.filter((sv) => sv.id !== id));
      }
      if (isPrivateView) {
        setPrivateViews((prev) => prev.filter((sv) => sv.id !== id));
      }

      setLayouts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });

      if (activeView === id) {
        const remainingOrgViews = orgViews.filter((v) => v.id !== id);
        const remainingPrivateViews = privateViews.filter((v) => v.id !== id);
        if (remainingOrgViews.length > 0) {
          setActiveView(remainingOrgViews[0].id);
        } else if (remainingPrivateViews.length > 0) {
          setActiveView(remainingPrivateViews[0].id);
        } else {
          setActiveView(null);
        }
      }
    },
    [activeView, orgViews, privateViews]
  );

  const handleEditWidget = useCallback(
    (uid: string, tmplKey: string) => {
      const template = allTemplates[tmplKey];
      if (!template) return;
      setEditingWidget({ uid, tmplKey, template });
      onPanelOpenChange(true);
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
      onPanelOpenChange(false);
    },
    [setLayout, editingWidget, layout]
  );

  const addWidget = useCallback(
    (tmpl: string, widgetId?: string) => {
      uidCounter.current += 1;
      const uid = `w${uidCounter.current}`;
      const t = allTemplates[tmpl];
      const maxY = layout.reduce((max, item) => Math.max(max, item.y + item.h), 0);
      setLayout((prev) => [
        ...prev,
        {
          uid,
          tmpl,
          widgetId,
          x: 0,
          y: maxY,
          w: t?.isLogs ? 12 : 6,
          h: 2
        }
      ]);
      onPanelOpenChange(false);
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
          widgetId?: string;
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
              widgetId: data.widgetId,
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

  const gridRows = Math.max(
    6,
    Math.ceil(layout.reduce((max, item) => Math.max(max, item.y + item.h), 0) + 2)
  );

  return (
    <>
      <style>{resizeHandleStyles}</style>
      <div className="flex gap-x-12">
        <SidebarNav
          activeView={activeView ?? ""}
          onChangeView={setActiveView}
          orgViews={orgViews}
          privateViews={privateViews}
          onAddOrgView={handleAddOrgView}
          onAddPrivateView={handleAddPrivateView}
          onRenameView={handleRenameView}
          onDeleteView={handleDeleteView}
        />

        <main className="flex flex-1 flex-col overflow-hidden">
          {/* Grid */}
          <div className="flex-1 overflow-auto pb-8">
            <div
              ref={containerRef as React.RefObject<HTMLDivElement>}
              style={{ position: "relative", minHeight: "400px" }}
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
                  {layout.length === 0 && !isExternalDragging && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <UnstableEmpty className="min-h-[400px] w-full">
                        <UnstableEmptyHeader>
                          <EmptyMedia variant="icon">
                            <LayoutGrid />
                          </EmptyMedia>
                          <UnstableEmptyTitle>No widgets yet</UnstableEmptyTitle>
                          <UnstableEmptyDescription>
                            Add widgets to visualize organization activity, secrets access, and
                            system health.
                          </UnstableEmptyDescription>
                        </UnstableEmptyHeader>
                        <Button variant="org" onClick={() => onPanelOpenChange(true)}>
                          <Plus />
                          Add Widget
                        </Button>
                      </UnstableEmpty>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>

        {/* Side Panel */}
        <AddWidgetPanel
          open={panelOpen}
          onClose={() => {
            onPanelOpenChange(false);
            setEditingWidget(undefined);
          }}
          onAdd={addWidget}
          isDragging={isExternalDragging}
          customPanelItems={customPanelItems}
          onCreateTemplate={handleCreateTemplate}
          editing={editingWidget}
          onExternalDragStart={handleExternalDragStart}
          onExternalDragEnd={handleExternalDragEnd}
          backendWidgets={backendWidgets}
        />
      </div>
    </>
  );
}
