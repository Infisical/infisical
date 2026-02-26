import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
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
import { OrgIcon, ProjectIcon, SubOrgIcon } from "@app/components/v3";
import { useGetWidgetData } from "@app/hooks/api/observabilityWidgets";

import type { DataRow, StatItem, WidgetTemplate } from "../widget-config";
import { StatusPill } from "./StatusPill";
import { WidgetIcon } from "./WidgetIcon";

const SERVER_PAGE_SIZE = 10;
const CLIENT_PAGE_SIZE = 5;

function parseScope(scope: string): { type: string; name: string } {
  const dash = scope.indexOf(" - ");
  if (dash === -1) return { type: "org", name: scope };
  return { type: scope.slice(0, dash).toLowerCase().trim(), name: scope.slice(dash + 3).trim() };
}

const SCOPE_ICONS: Record<string, { icon: React.ElementType; color: string } | undefined> = {
  project: { icon: ProjectIcon, color: "#e0ed34" },
  org: { icon: OrgIcon, color: "#30b3ff" },
  "sub-org": { icon: SubOrgIcon, color: "#96ff59" }
};

const SCOPE_DOT_COLORS: Record<string, string> = {
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
  onToggleLock,
  widgetId
}: {
  template: WidgetTemplate;
  onEdit?: () => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  widgetId?: string;
}) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  useEffect(() => {
    setPage(0);
  }, [widgetId]);

  const activePageSize = widgetId ? SERVER_PAGE_SIZE : CLIENT_PAGE_SIZE;
  const serverParams = widgetId ? { limit: SERVER_PAGE_SIZE, offset: page * SERVER_PAGE_SIZE } : undefined;
  const { data: widgetData, isLoading: isWidgetLoading, refetch: refetchWidgetData } = useGetWidgetData(
    widgetId,
    serverParams
  );

  const rawRows: DataRow[] = useMemo(() => {
    if (widgetId) {
      if (!widgetData) return [];
      return widgetData.items.map((item) => ({
        name: item.resourceName,
        status: item.status,
        desc: item.statusTooltip ?? "",
        scope: item.scope.displayName,
        date: (() => {
          const d = new Date(item.eventTimestamp);
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          const yy = String(d.getFullYear()).slice(-2);
          const hh = String(d.getHours()).padStart(2, "0");
          const min = String(d.getMinutes()).padStart(2, "0");
          const ss = String(d.getSeconds()).padStart(2, "0");
          return `${mm}-${dd}-${yy} ${hh}:${min}:${ss}`;
        })(),
        resource: item.resourceType,
        resourceLink: item.resourceLink
      }));
    }
    return [];
  }, [widgetId, widgetData, template]);

  const liveStats: StatItem[] | undefined = useMemo(() => {
    if (!widgetId || !widgetData) return undefined;
    const { failedCount, pendingCount, activeCount, expiredCount } = widgetData.summary;
    const stats: StatItem[] = [];
    if (failedCount > 0 || activeCount > 0 || pendingCount > 0 || expiredCount > 0) {
      if (failedCount > 0) stats.push({ color: "#f85149", label: "Failed", key: "failed", count: failedCount });
      if (expiredCount > 0) stats.push({ color: "#d29922", label: "Expired", key: "expired", count: expiredCount });
      if (pendingCount > 0) stats.push({ color: "#58a6ff", label: "Pending", key: "pending", count: pendingCount });
      if (activeCount > 0) stats.push({ color: "#3fb950", label: "Active", key: "active", count: activeCount });
    }
    return stats;
  }, [widgetId, widgetData]);

  // For server-side: rows are already the current page; total comes from API.
  // For client-side (custom widgets): sort and slice locally.
  const rows = useMemo(
    () => (widgetId ? rawRows : sortRows(rawRows, sortKey, sortDir)),
    [widgetId, rawRows, sortKey, sortDir]
  );

  const totalCount = widgetId ? (widgetData?.totalCount ?? 0) : rows.length;
  const totalPages = Math.ceil(totalCount / activePageSize);
  const start = page * activePageSize;
  const slice = widgetId ? rows : rows.slice(start, start + activePageSize);

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
              <span className="text-[13px] font-medium text-bunker-100">
                {widgetData?.widget.name ?? template.title}
              </span>
              {(widgetData?.widget.description ?? template.description) && (
                <p className="truncate text-[11px] text-mineshaft-400">
                  {widgetData?.widget.description ?? template.description}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="rounded border border-mineshaft-600 bg-bunker-800 px-1.5 py-0.5 text-[10px] text-mineshaft-300">
              {widgetData
                ? widgetData.widget.refreshInterval < 60
                  ? `${widgetData.widget.refreshInterval}s`
                  : `${Math.round(widgetData.widget.refreshInterval / 60)}m`
                : template.refresh}
            </span>
            <button
              type="button"
              onClick={widgetId ? () => refetchWidgetData() : undefined}
              className="flex h-[22px] w-[22px] items-center justify-center rounded text-mineshaft-300 transition-colors hover:bg-mineshaft-600 hover:text-white"
            >
              <RotateCw size={12} className={isWidgetLoading ? "animate-spin" : ""} />
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
        {isWidgetLoading ? (
          <div className="flex h-full items-center justify-center py-8 text-[12px] text-mineshaft-300">
            <RotateCw size={14} className="mr-2 animate-spin" />
            Loading...
          </div>
        ) : (
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
                          {(() => {
                            const scopeIcon = SCOPE_ICONS[scope.type];
                            if (scopeIcon) {
                              return (
                                <scopeIcon.icon
                                  size={12}
                                  className="shrink-0"
                                  style={{ color: scopeIcon.color }}
                                />
                              );
                            }
                            return (
                              <span
                                className="inline-block h-2 w-2 shrink-0 rounded-full"
                                style={{ background: SCOPE_DOT_COLORS[scope.type] ?? "#8b949e" }}
                              />
                            );
                          })()}
                          <span className="truncate text-mineshaft-300">{scope.name}</span>
                        </span>
                      </Tooltip>
                    </td>
                    <td className="whitespace-nowrap px-3.5 py-2 text-[11px] text-mineshaft-300">
                      {row.date}
                    </td>
                    <td className="px-3.5 py-2 text-center">
                      <a
                        href={row.resourceLink ?? "#"}
                        className="inline-flex items-center justify-center text-mineshaft-300 transition-colors hover:text-primary"
                        aria-label="View details"
                      >
                        <ArrowUpRight size={13} />
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
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-mineshaft-600 bg-bunker-800 py-1.5 pl-3.5 pr-10">
        <div className="flex items-center gap-3">
          {(liveStats ?? template.stats).map((s) => (
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
              <span className="min-w-[64px] text-center text-[11px] text-mineshaft-300">
                {page + 1} / {totalPages}
              </span>
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
