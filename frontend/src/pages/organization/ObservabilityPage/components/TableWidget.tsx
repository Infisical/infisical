import { useCallback, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Lock,
  LockOpen,
  Pencil,
  RotateCw
} from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Tooltip } from "@app/components/v2";

import type { DataRow, WidgetTemplate } from "../mock-data";
import { DATA, PAGE_SIZE, queryRows } from "../mock-data";
import { StatusPill } from "./StatusPill";
import { WidgetIcon } from "./WidgetIcon";

function parseScope(scope: string): { type: string; name: string } {
  const dash = scope.indexOf(" - ");
  if (dash === -1) return { type: "org", name: scope };
  return { type: scope.slice(0, dash).toLowerCase().trim(), name: scope.slice(dash + 3).trim() };
}

const SCOPE_DOT_COLORS: Record<string, string> = {
  project: "#d29922",
  org: "#58a6ff",
  mi: "#f0883e",
  user: "#bc8cff",
  group: "#39d0d8",
  pam: "#8b949e",
  service_token: "#8b949e"
};

type SortKey = "name" | "status" | "scope" | "date" | "type";
type SortDir = "asc" | "desc";

function sortRows(rows: DataRow[], key: SortKey, dir: SortDir): DataRow[] {
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let va = "";
    let vb = "";
    switch (key) {
      case "name":
        va = a.name;
        vb = b.name;
        break;
      case "status":
        va = a.status;
        vb = b.status;
        break;
      case "scope":
        va = a.scope;
        vb = b.scope;
        break;
      case "date":
        va = a.date;
        vb = b.date;
        break;
      case "type":
        va = a.resource ?? "";
        vb = b.resource ?? "";
        break;
      default:
        break;
    }
    return dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
  });
  return sorted;
}

export function TableWidget({
  template,
  onEdit,
  isLocked = false,
  onToggleLock
}: {
  template: WidgetTemplate;
  onEdit?: () => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
}) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const rawRows: DataRow[] = useMemo(() => {
    if (template.filter) return queryRows(template.filter);
    return DATA[template.dataKey]?.[template.firstStatus] ?? [];
  }, [template]);

  const rows = useMemo(() => sortRows(rawRows, sortKey, sortDir), [rawRows, sortKey, sortDir]);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const start = page * PAGE_SIZE;
  const slice = rows.slice(start, start + PAGE_SIZE);

  const goPage = useCallback(
    (dir: number) => {
      setPage((p) => Math.max(0, Math.min(p + dir, totalPages - 1)));
    },
    [totalPages]
  );

  const handleSort = useCallback((key: SortKey) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setSortDir("asc");
      return key;
    });
    setPage(0);
  }, []);

  const SortHeader = ({ label, colKey }: { label: string; colKey: SortKey }) => (
    <th
      className="sticky top-0 z-[1] cursor-pointer select-none bg-bunker-800 px-3.5 py-1.5 text-left text-[11px] font-medium text-mineshaft-300 transition-colors hover:text-white"
      onClick={() => handleSort(colKey)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {sortKey === colKey ? (
          sortDir === "asc" ? (
            <ArrowUp size={10} className="text-primary" />
          ) : (
            <ArrowDown size={10} className="text-primary" />
          )
        ) : (
          <ArrowDown size={10} className="opacity-0" />
        )}
      </span>
    </th>
  );

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
              style={{ background: template.iconBg }}
            >
              <WidgetIcon name={template.icon} size={12} className="text-inherit" />
            </div>
            <div className="min-w-0">
              <span className="text-[13px] font-medium text-bunker-100">{template.title}</span>
              {template.description && (
                <p className="truncate text-[11px] text-mineshaft-400">{template.description}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded border border-mineshaft-600 bg-bunker-800 px-1.5 py-0.5 text-[10px] text-mineshaft-300">
              {template.refresh}
            </span>
            <button
              type="button"
              className="flex h-[22px] w-[22px] items-center justify-center rounded text-mineshaft-300 transition-colors hover:bg-mineshaft-600 hover:text-white"
            >
              <RotateCw size={12} />
            </button>
            {onEdit && (
              <button
                type="button"
                onClick={onEdit}
                className="flex h-[22px] w-[22px] items-center justify-center rounded text-mineshaft-300 transition-colors hover:bg-mineshaft-600 hover:text-primary"
                aria-label="Edit widget"
                title="Edit widget"
              >
                <Pencil size={11} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col className="w-[22%]" />
            <col className="w-[130px]" />
            <col className="w-[90px]" />
            <col className="w-[22%]" />
            <col className="w-[100px]" />
            <col className="w-[60px]" />
          </colgroup>
          <thead>
            <tr>
              <SortHeader label="Name" colKey="name" />
              <SortHeader label="Type" colKey="type" />
              <SortHeader label="Status" colKey="status" />
              <SortHeader label="Scope" colKey="scope" />
              <SortHeader label="Event Date" colKey="date" />
              <th className="sticky top-0 z-[1] bg-bunker-800 px-3.5 py-1.5 text-left text-[11px] font-medium text-mineshaft-300" />
            </tr>
          </thead>
          <tbody>
            {slice.length > 0 ? (
              slice.map((row, idx) => {
                const scope = parseScope(row.scope);
                const resourceLabel = (row.resource ?? "").replace(/_/g, " ");
                return (
                  <tr
                    key={`${row.name}-${idx}`}
                    className="group transition-colors hover:bg-mineshaft-700"
                  >
                    <td className="max-w-0 px-3.5 py-2 text-[12px]">
                      <span
                        className="block truncate font-medium text-bunker-100"
                        title={row.name}
                      >
                        {row.name}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-[11px]">
                      <span
                        className="inline-block max-w-full truncate rounded bg-mineshaft-600 px-1.5 py-0.5 text-[10px] capitalize text-mineshaft-300"
                        title={resourceLabel}
                      >
                        {resourceLabel}
                      </span>
                    </td>
                    <td className="px-3.5 py-2 text-[12px]">
                      <StatusPill status={row.status} tooltip={row.desc} />
                    </td>
                    <td className="max-w-0 px-3.5 py-2 text-[11px]">
                      <Tooltip
                        content={<p className="text-[11px]">{row.scope}</p>}
                        position="top"
                      >
                        <span className="flex items-center gap-1.5">
                          <span
                            className="inline-block h-2 w-2 shrink-0 rounded-full"
                            style={{
                              background: SCOPE_DOT_COLORS[scope.type] ?? "#8b949e"
                            }}
                          />
                          <span className="truncate text-mineshaft-300">{scope.name}</span>
                        </span>
                      </Tooltip>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2 text-[11px] text-mineshaft-300">
                      {row.date}
                    </td>
                    <td className="px-3.5 py-2 text-center">
                      <a
                        href="#"
                        className="inline-flex items-center justify-center text-mineshaft-300 transition-colors hover:text-primary"
                        aria-label="View details"
                      >
                        <ChevronRight size={14} />
                      </a>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td
                  colSpan={6}
                  className="px-3.5 py-5 text-center text-[12px] text-mineshaft-300"
                >
                  No issues found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-mineshaft-600 bg-bunker-800 py-1.5 pl-3.5 pr-10">
        <div className="flex items-center gap-3">
          {template.stats.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 text-[11px]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
              <span className="text-mineshaft-300">{s.label}</span>
              <span className="font-semibold" style={{ color: s.color }}>
                {s.count}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {rows.length > 0 && (
            <span className="text-[11px] text-mineshaft-300">
              {start + 1}&ndash;{Math.min(start + PAGE_SIZE, rows.length)} of {rows.length}
            </span>
          )}
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={page === 0}
                onClick={() => goPage(-1)}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[5px] border border-mineshaft-500 bg-mineshaft-600 text-mineshaft-300 transition-colors hover:bg-mineshaft-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronLeft size={12} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  type="button"
                  key={`page-${i}`}
                  onClick={() => setPage(i)}
                  className={twMerge(
                    "flex h-[26px] w-[26px] items-center justify-center rounded-[5px] text-[11px] font-medium transition-colors",
                    i === page
                      ? "border border-primary bg-[#1c2a3a] text-primary"
                      : "text-mineshaft-300 hover:bg-mineshaft-600 hover:text-white"
                  )}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={page >= totalPages - 1}
                onClick={() => goPage(1)}
                className="flex h-[26px] w-[26px] items-center justify-center rounded-[5px] border border-mineshaft-500 bg-mineshaft-600 text-mineshaft-300 transition-colors hover:bg-mineshaft-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"
              >
                <ChevronRight size={12} />
              </button>
            </div>
          )}

          {/* Separator */}
          <div className="mx-1 h-4 w-px bg-mineshaft-600" />

          {/* Lock button */}
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
    </div>
  );
}
