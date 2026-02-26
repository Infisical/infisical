import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronRight,
  LayoutDashboard,
  Pencil,
  Plus,
  Trash2,
  User
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import type { SubView } from "../mock-data";

interface SidebarNavProps {
  activeView: string;
  onChangeView: (id: string) => void;
  subViews: SubView[];
  onAddSubView: (name: string) => void;
  onRenameSubView: (id: string, name: string) => void;
  onDeleteSubView: (id: string) => void;
}

export function SidebarNav({
  activeView,
  onChangeView,
  subViews,
  onAddSubView,
  onRenameSubView,
  onDeleteSubView
}: SidebarNavProps) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [privateExpanded, setPrivateExpanded] = useState(true);
  const addInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (adding) addInputRef.current?.focus();
  }, [adding]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  function handleAddSubmit() {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddSubView(trimmed);
      setNewName("");
    }
    setAdding(false);
  }

  function handleEditSubmit(id: string) {
    const trimmed = editName.trim();
    if (trimmed) {
      onRenameSubView(id, trimmed);
    }
    setEditingId(null);
  }

  const isPrivateActive = activeView === "private" || subViews.some((s) => s.id === activeView);

  return (
    <aside className="flex w-[220px] shrink-0 flex-col border-r border-mineshaft-600 bg-bunker-800">
      <div className="flex items-center gap-2 px-4 pb-4 pt-5">
        <LayoutDashboard size={16} className="text-mineshaft-300" />
        <span className="text-[13px] font-semibold text-bunker-100">Views</span>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 px-2">
        {/* Organization view */}
        <button
          type="button"
          onClick={() => onChangeView("org")}
          className={twMerge(
            "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
            activeView === "org"
              ? "bg-mineshaft-600 text-white"
              : "text-mineshaft-300 hover:bg-mineshaft-700 hover:text-white"
          )}
        >
          {activeView === "org" && (
            <span className="absolute left-0 h-5 w-[3px] rounded-r bg-primary" />
          )}
          <Building2 size={15} className={activeView === "org" ? "text-primary" : ""} />
          <span className="flex-1 text-left">Organization</span>
          <span className="rounded-full border border-[#6e1a1a] bg-[#2b0d0d] px-1.5 py-px text-[9px] font-bold text-red-400">
            7
          </span>
        </button>

        {/* Private section */}
        <div>
          <button
            type="button"
            onClick={() => {
              setPrivateExpanded(!privateExpanded);
              onChangeView("private");
            }}
            className={twMerge(
              "group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-[13px] transition-colors",
              activeView === "private"
                ? "bg-mineshaft-600 text-white"
                : "text-mineshaft-300 hover:bg-mineshaft-700 hover:text-white"
            )}
          >
            {activeView === "private" && (
              <span className="absolute left-0 h-5 w-[3px] rounded-r bg-primary" />
            )}
            <ChevronRight
              size={13}
              className={twMerge(
                "shrink-0 transition-transform",
                privateExpanded && "rotate-90",
                isPrivateActive ? "text-primary" : ""
              )}
            />
            <User
              size={15}
              className={isPrivateActive && activeView === "private" ? "text-primary" : ""}
            />
            <span className="flex-1 text-left">Private</span>
          </button>

          {privateExpanded && (
            <div className="ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-mineshaft-600 pl-2">
              {subViews.map((sv) => (
                <div key={sv.id} className="group/sub relative flex items-center">
                  {editingId === sv.id ? (
                    <input
                      ref={editInputRef}
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleEditSubmit(sv.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      onBlur={() => handleEditSubmit(sv.id)}
                      className="w-full rounded-md border border-primary bg-mineshaft-700 px-2 py-1 text-[12px] text-white outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => onChangeView(sv.id)}
                      className={twMerge(
                        "flex flex-1 items-center truncate rounded-md px-2 py-1.5 text-left text-[12px] transition-colors",
                        activeView === sv.id
                          ? "bg-mineshaft-600 text-white"
                          : "text-mineshaft-300 hover:bg-mineshaft-700 hover:text-white"
                      )}
                    >
                      {activeView === sv.id && (
                        <span className="absolute -left-2 h-4 w-[2px] rounded-r bg-primary" />
                      )}
                      <span className="truncate">{sv.name}</span>
                    </button>
                  )}
                  {editingId !== sv.id && (
                    <div className="absolute right-0 flex items-center gap-0.5 opacity-0 transition-opacity group-hover/sub:opacity-100">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(sv.id);
                          setEditName(sv.name);
                        }}
                        className="rounded p-0.5 text-mineshaft-300 hover:text-white"
                        title="Rename"
                      >
                        <Pencil size={10} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteSubView(sv.id);
                        }}
                        className="rounded p-0.5 text-mineshaft-300 hover:text-red-400"
                        title="Delete"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  )}
                </div>
              ))}

              {adding ? (
                <input
                  ref={addInputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddSubmit();
                    if (e.key === "Escape") {
                      setAdding(false);
                      setNewName("");
                    }
                  }}
                  onBlur={handleAddSubmit}
                  placeholder="View name..."
                  className="rounded-md border border-primary bg-mineshaft-700 px-2 py-1 text-[12px] text-white outline-none placeholder:text-mineshaft-400"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] text-mineshaft-400 transition-colors hover:bg-mineshaft-700 hover:text-mineshaft-200"
                >
                  <Plus size={11} />
                  <span>New View</span>
                </button>
              )}
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
}
