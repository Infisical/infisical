import { useEffect, useRef, useState } from "react";
import { Building2, ChevronRight, Pencil, Plus, Trash2, User } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Input } from "@app/components/v2";

import type { SubView } from "../mock-data";

interface SidebarNavProps {
  activeView: string;
  onChangeView: (id: string) => void;
  orgViews: SubView[];
  privateViews: SubView[];
  onAddOrgView: (name: string) => void;
  onAddPrivateView: (name: string) => void;
  onRenameView: (id: string, name: string) => void;
  onDeleteView: (id: string) => void;
}

export function SidebarNav({
  activeView,
  onChangeView,
  orgViews,
  privateViews,
  onAddOrgView,
  onAddPrivateView,
  onRenameView,
  onDeleteView
}: SidebarNavProps) {
  const [addingOrg, setAddingOrg] = useState(false);
  const [addingPrivate, setAddingPrivate] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [orgExpanded, setOrgExpanded] = useState(true);
  const [privateExpanded, setPrivateExpanded] = useState(true);
  const addOrgInputRef = useRef<HTMLInputElement>(null);
  const addPrivateInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (addingOrg) addOrgInputRef.current?.focus();
  }, [addingOrg]);

  useEffect(() => {
    if (addingPrivate) addPrivateInputRef.current?.focus();
  }, [addingPrivate]);

  useEffect(() => {
    if (editingId) editInputRef.current?.focus();
  }, [editingId]);

  function handleAddOrgSubmit() {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddOrgView(trimmed);
      setNewName("");
    }
    setAddingOrg(false);
  }

  function handleAddPrivateSubmit() {
    const trimmed = newName.trim();
    if (trimmed) {
      onAddPrivateView(trimmed);
      setNewName("");
    }
    setAddingPrivate(false);
  }

  function handleEditSubmit(id: string) {
    const trimmed = editName.trim();
    if (trimmed) {
      onRenameView(id, trimmed);
    }
    setEditingId(null);
  }

  const isOrgSectionActive = orgViews.some((v) => v.id === activeView);
  const isPrivateSectionActive = privateViews.some((v) => v.id === activeView);

  const renderSubView = (sv: SubView) => (
    <div
      key={sv.id}
      className={twMerge(
        "group/sub relative -ml-3 flex items-center border-l pl-3",
        activeView === sv.id
          ? "border-org-v1"
          : "border-transparent hover:border-mineshaft-400"
      )}
    >
      {editingId === sv.id ? (
        <Input
          ref={editInputRef}
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleEditSubmit(sv.id);
            if (e.key === "Escape") setEditingId(null);
          }}
          onBlur={() => handleEditSubmit(sv.id)}
          className="h-6 text-xs"
        />
      ) : (
        <button
          type="button"
          onClick={() => onChangeView(sv.id)}
          className={twMerge(
            "flex flex-1 items-center truncate text-left text-sm transition-colors",
            activeView === sv.id ? "text-white" : "text-mineshaft-300/75 hover:text-mineshaft-200"
          )}
        >
          <span className="truncate">{sv.name}</span>
        </button>
      )}
      {editingId !== sv.id && (
        <div className="absolute right-0 flex items-center gap-1 opacity-0 transition-opacity group-hover/sub:opacity-100">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setEditingId(sv.id);
              setEditName(sv.name);
            }}
            className="rounded p-0.5 text-mineshaft-400 hover:text-white"
            title="Rename"
          >
            <Pencil size={12} />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteView(sv.id);
            }}
            className="rounded p-0.5 text-mineshaft-400 hover:text-red-400"
            title="Delete"
          >
            <Trash2 size={12} />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <nav className="flex shrink-0 flex-col gap-y-4">
      {/* Organization section */}
      <div>
        <button
          type="button"
          onClick={() => setOrgExpanded(!orgExpanded)}
          className={twMerge(
            "group relative flex h-5 w-full items-center gap-2 border-l px-3 text-sm transition-colors",
            isOrgSectionActive
              ? "border-org-v1 text-white"
              : "border-transparent text-mineshaft-300/75 hover:border-mineshaft-400 hover:text-mineshaft-200"
          )}
        >
          <ChevronRight
            size={14}
            className={twMerge("shrink-0 transition-transform", orgExpanded && "rotate-90")}
          />
          <Building2 size={14} className={isOrgSectionActive ? "text-org" : ""} />
          <span>Organization</span>
        </button>

        {orgExpanded && (
          <div className="ml-6 mt-3 flex flex-col gap-y-2 border-l border-mineshaft-600 pl-3">
            {orgViews.map(renderSubView)}

            {addingOrg ? (
              <Input
                ref={addOrgInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddOrgSubmit();
                  if (e.key === "Escape") {
                    setAddingOrg(false);
                    setNewName("");
                  }
                }}
                onBlur={handleAddOrgSubmit}
                placeholder="View name..."
                className="h-6 text-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingOrg(true)}
                className="flex items-center gap-1.5 text-sm text-mineshaft-400 transition-colors hover:text-mineshaft-200"
              >
                <Plus size={14} />
                <span>New View</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Private section */}
      <div>
        <button
          type="button"
          onClick={() => setPrivateExpanded(!privateExpanded)}
          className={twMerge(
            "group relative flex h-5 w-full items-center gap-2 border-l px-3 text-sm transition-colors",
            isPrivateSectionActive
              ? "border-org-v1 text-white"
              : "border-transparent text-mineshaft-300/75 hover:border-mineshaft-400 hover:text-mineshaft-200"
          )}
        >
          <ChevronRight
            size={14}
            className={twMerge("shrink-0 transition-transform", privateExpanded && "rotate-90")}
          />
          <User size={14} className={isPrivateSectionActive ? "text-org" : ""} />
          <span>Private</span>
        </button>

        {privateExpanded && (
          <div className="ml-6 mt-3 flex flex-col gap-y-2 border-l border-mineshaft-600 pl-3">
            {privateViews.map(renderSubView)}

            {addingPrivate ? (
              <Input
                ref={addPrivateInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAddPrivateSubmit();
                  if (e.key === "Escape") {
                    setAddingPrivate(false);
                    setNewName("");
                  }
                }}
                onBlur={handleAddPrivateSubmit}
                placeholder="View name..."
                className="h-6 text-xs"
              />
            ) : (
              <button
                type="button"
                onClick={() => setAddingPrivate(true)}
                className="flex items-center gap-1.5 text-sm text-mineshaft-400 transition-colors hover:text-mineshaft-200"
              >
                <Plus size={14} />
                <span>New View</span>
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
