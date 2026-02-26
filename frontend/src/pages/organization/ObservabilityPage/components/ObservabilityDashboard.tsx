import { useCallback, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { arrayMove, SortableContext, rectSortingStrategy } from "@dnd-kit/sortable";
import { GripVertical, Plus, RotateCw } from "lucide-react";
import { twMerge } from "tailwind-merge";

import type { LayoutItem, PanelItem, SubView, WidgetTemplate } from "../mock-data";
import { DEFAULT_LAYOUT, TEMPLATES } from "../mock-data";
import { AddWidgetPanel } from "./AddWidgetPanel";
import type { CreateTemplateResult, EditingWidget } from "./CreateTemplateForm";
import { SidebarNav } from "./SidebarNav";
import { SortableWidgetCard, WidgetCardOverlay } from "./WidgetCard";

const customCollision: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

function DroppableGrid({ children, isOver }: { children: React.ReactNode; isOver: boolean }) {
  const { setNodeRef } = useDroppable({ id: "grid-drop-zone" });
  return (
    <div
      ref={setNodeRef}
      className={twMerge(
        "grid auto-rows-[200px] grid-cols-12 gap-4 rounded-xl border-2 border-dashed p-1 transition-colors duration-200",
        isOver ? "border-primary/40 bg-primary/[0.03]" : "border-transparent"
      )}
    >
      {children}
    </div>
  );
}

export function ObservabilityDashboard() {
  const [activeView, setActiveView] = useState("org");
  const [subViews, setSubViews] = useState<SubView[]>([]);
  const [layouts, setLayouts] = useState<Record<string, LayoutItem[]>>({
    org: [...DEFAULT_LAYOUT],
    private: []
  });

  const [panelOpen, setPanelOpen] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [isOverGrid, setIsOverGrid] = useState(false);
  const uidCounter = useRef(100);

  const [customTemplates, setCustomTemplates] = useState<Record<string, WidgetTemplate>>({});
  const [customPanelItems, setCustomPanelItems] = useState<PanelItem[]>([]);
  const allTemplates = useMemo(
    () => ({ ...TEMPLATES, ...customTemplates }),
    [customTemplates]
  );

  const [editingWidget, setEditingWidget] = useState<EditingWidget | undefined>(undefined);

  const layout = layouts[activeView] ?? [];
  const setLayout = useCallback(
    (updater: LayoutItem[] | ((prev: LayoutItem[]) => LayoutItem[])) => {
      setLayouts((prev) => ({
        ...prev,
        [activeView]: typeof updater === "function" ? updater(prev[activeView] ?? []) : updater
      }));
    },
    [activeView]
  );

  const handleAddSubView = useCallback((name: string) => {
    const id = `sub_${Date.now()}`;
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
        const uid = `w${++uidCounter.current}`;
        setLayout((prev) => [
          ...prev,
          {
            uid,
            tmpl: result.key,
            cols: result.template.isLogs ? 12 : 6,
            rows: 2,
            order: prev.length
          }
        ]);
      }
      setPanelOpen(false);
    },
    [setLayout, editingWidget]
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const isPanelDrag = activeDragId?.startsWith("panel-");

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragOver = useCallback(
    (event: { over: { id: string | number } | null }) => {
      if (!isPanelDrag) return;
      setIsOverGrid(
        event.over?.id === "grid-drop-zone" ||
          layout.some((i) => i.uid === String(event.over?.id))
      );
    },
    [isPanelDrag, layout]
  );

  const addWidget = useCallback(
    (tmpl: string) => {
      const uid = `w${++uidCounter.current}`;
      const t = allTemplates[tmpl];
      setLayout((prev) => [
        ...prev,
        { uid, tmpl, cols: t?.isLogs ? 12 : 6, rows: 2, order: prev.length }
      ]);
      setPanelOpen(false);
    },
    [allTemplates, setLayout]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDragId(null);
      setIsOverGrid(false);
      const { active, over } = event;
      const data = active.data.current;
      if (data?.type === "panel-item") {
        if (over) addWidget(data.tmpl as string);
        return;
      }
      if (over) {
        const activeId = String(active.id);
        const overId = String(over.id);
        if (activeId !== overId && overId !== "grid-drop-zone") {
          setLayout((prev) => {
            const oldIndex = prev.findIndex((item) => item.uid === activeId);
            const newIndex = prev.findIndex((item) => item.uid === overId);
            if (oldIndex === -1 || newIndex === -1) return prev;
            return arrayMove(prev, oldIndex, newIndex).map((item, i) => ({
              ...item,
              order: i
            }));
          });
        }
      }
    },
    [addWidget, setLayout]
  );

  const removeWidget = useCallback(
    (uid: string) => {
      setLayout((prev) =>
        prev
          .filter((item) => item.uid !== uid)
          .map((item, i) => ({ ...item, order: i }))
      );
    },
    [setLayout]
  );

  const resizeWidget = useCallback(
    (uid: string, cols: number, rows: number) => {
      setLayout((prev) =>
        prev.map((item) => (item.uid === uid ? { ...item, cols, rows } : item))
      );
    },
    [setLayout]
  );

  const activeItem = activeDragId ? layout.find((item) => item.uid === activeDragId) : null;

  const viewLabel =
    activeView === "org"
      ? "Organization"
      : activeView === "private"
        ? "Private"
        : (subViews.find((s) => s.id === activeView)?.name ?? "View");

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={customCollision}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
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
          <div className="flex-1 overflow-auto px-8 pb-8 pt-5">
            {layout.length > 0 ? (
              <SortableContext
                items={layout.map((item) => item.uid)}
                strategy={rectSortingStrategy}
              >
                <DroppableGrid isOver={isOverGrid}>
                  {layout.map((item) => (
                    <SortableWidgetCard
                      key={item.uid}
                      item={item}
                      templates={allTemplates}
                      onRemove={removeWidget}
                      onResize={resizeWidget}
                      onEdit={handleEditWidget}
                    />
                  ))}
                </DroppableGrid>
              </SortableContext>
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
      </div>

      {/* Side Panel */}
      <AddWidgetPanel
        open={panelOpen}
        onClose={() => {
          setPanelOpen(false);
          setEditingWidget(undefined);
        }}
        onAdd={addWidget}
        isDragging={!!activeDragId}
        customPanelItems={customPanelItems}
        onCreateTemplate={handleCreateTemplate}
        editing={editingWidget}
      />

      {/* Drag Overlay */}
      <DragOverlay dropAnimation={null}>
        {activeItem ? (
          <WidgetCardOverlay item={activeItem} templates={allTemplates} />
        ) : isPanelDrag ? (
          <div className="flex items-center gap-2 rounded-lg border-2 border-primary/60 bg-mineshaft-800/95 px-4 py-3 shadow-2xl backdrop-blur-sm">
            <GripVertical size={14} className="text-primary/60" />
            <span className="text-[13px] font-medium text-bunker-100">
              {(() => {
                const tmplId = activeDragId?.replace("panel-", "");
                const tmpl = tmplId ? allTemplates[tmplId] : null;
                return tmpl?.title ?? "Widget";
              })()}
            </span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
