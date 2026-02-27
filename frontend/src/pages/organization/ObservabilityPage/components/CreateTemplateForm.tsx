import { useMemo, useRef, useState } from "react";
import { faSearch } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useQuery } from "@tanstack/react-query";
import { Check, ChevronDown, Loader2, Palette, X } from "lucide-react";
import { twMerge } from "tailwind-merge";

import { Button } from "@app/components/v3";
import { useSubscription } from "@app/context";
import { AUDIT_LOG_EVENT_CATEGORIES, useCreateWidget } from "@app/hooks/api/observabilityWidgets";
import { useGetUserProjects } from "@app/hooks/api/projects";
import { subOrganizationsQuery } from "@app/hooks/api/subOrganizations";

import type { PanelItem, WidgetFilter, WidgetTemplate } from "../widget-config";
import { EVENT_TYPES, RESOURCE_TYPES } from "../widget-config";
import { AVAILABLE_ICONS, WidgetIcon } from "./WidgetIcon";

export interface CreateTemplateResult {
  template: WidgetTemplate;
  panelItem: PanelItem;
  key: string;
  widgetId?: string;
}

export interface BackendWidgetData {
  id: string;
  name: string;
  description?: string;
  type: string;
  config: unknown;
  icon?: string;
  color?: string;
  refreshInterval: number;
  subOrgId?: string | null;
  projectId?: string | null;
}

export interface EditingWidget {
  uid: string;
  tmplKey: string;
  template: WidgetTemplate;
  backendWidget?: BackendWidgetData;
}

type WidgetType = "resource_activity" | "stream" | "metrics";
type ScopeMode = "org" | "suborg" | "project";
type MetricTypeKey = "status_count" | "expiring_soon" | "identity_count";
type MetricStatus = "failed" | "pending" | "active" | "expired";
type IdentityTypeKey = "user" | "machine" | "all";

const ORG_ONLY_RESOURCES = new Set(
  RESOURCE_TYPES.filter((r) => r.orgOnly).map((r) => r.key)
);

const ICON_COLORS = [
  "#58a6ff",
  "#3fb950",
  "#f85149",
  "#d29922",
  "#bc8cff",
  "#f0883e",
  "#39d0d8",
  "#8b949e"
];

function toggleSet(set: Set<string>, key: string): Set<string> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

function parseRefreshSeconds(str: string): number {
  if (str === "Off") return 3600;
  if (str.endsWith("m")) return parseInt(str, 10) * 60;
  return parseInt(str, 10);
}

export function CreateTemplateForm({
  orgId,
  onSubmit,
  onCancel,
  editing
}: {
  orgId: string;
  onSubmit: (result: CreateTemplateResult) => void;
  onCancel: () => void;
  editing?: EditingWidget;
}) {
  const isEditMode = !!editing;
  const createWidget = useCreateWidget();

  const bw = editing?.backendWidget;
  const bwConfig = bw?.config as {
    resourceTypes?: string[];
    eventTypes?: string[];
    eventCategories?: string[];
    metricType?: string;
    status?: string;
    thresholdDays?: number;
    identityType?: string;
  } | undefined;

  const [title, setTitle] = useState(bw?.name ?? editing?.template.title ?? "");
  const [description, setDescription] = useState(bw?.description ?? editing?.template.description ?? "");
  const [widgetType, setWidgetType] = useState<WidgetType>(() => {
    if (bw?.type === "logs") return "stream";
    if (bw?.type === "metrics") return "metrics";
    if (editing?.template.isLogs) return "stream";
    if (editing?.template.isMetrics) return "metrics";
    return "resource_activity";
  });
  const [selectedResources, setSelectedResources] = useState<Set<string>>(() => {
    if (bwConfig?.resourceTypes?.length) return new Set(bwConfig.resourceTypes);
    return new Set(editing?.template.filter?.resources ?? []);
  });
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => {
    if (bwConfig?.eventTypes?.length) return new Set(bwConfig.eventTypes);
    return new Set(editing?.template.filter?.statuses ?? []);
  });
  const [scopeMode, setScopeMode] = useState<ScopeMode>(() => {
    if (bw?.projectId) return "project";
    if (bw?.subOrgId) return "suborg";
    if (editing?.template.filter?.projectId) return "project";
    if (editing?.template.filter?.subOrgIds?.length) return "suborg";
    return editing?.template.filter?.scopeMode ?? "org";
  });
  const [selectedProjectId, setSelectedProjectId] = useState<string>(
    bw?.projectId ?? editing?.template.filter?.projectId ?? ""
  );
  const [selectedSubOrgs, setSelectedSubOrgs] = useState<Set<string>>(() => {
    if (bw?.subOrgId) return new Set([bw.subOrgId]);
    return new Set(editing?.template.filter?.subOrgIds ?? []);
  });
  const [refreshInterval, setRefreshInterval] = useState(() => {
    if (bw?.refreshInterval) return `${bw.refreshInterval}s`;
    return editing?.template.refresh ?? "30s";
  });
  const [selectedEventCategories, setSelectedEventCategories] = useState<Set<string>>(() => {
    if (bwConfig?.eventCategories?.length) return new Set(bwConfig.eventCategories);
    return new Set(editing?.template.filter?.eventCategories ?? []);
  });

  // Metrics state
  const [metricType, setMetricType] = useState<MetricTypeKey>(
    (bwConfig?.metricType as MetricTypeKey) ?? "status_count"
  );
  const [metricStatus, setMetricStatus] = useState<MetricStatus>(
    (bwConfig?.status as MetricStatus) ?? "failed"
  );
  const [metricResourceTypes, setMetricResourceTypes] = useState<Set<string>>(() => {
    if (bwConfig?.resourceTypes?.length) return new Set(bwConfig.resourceTypes);
    return new Set();
  });
  const [thresholdDays, setThresholdDays] = useState(
    String(bwConfig?.thresholdDays ?? 7)
  );
  const [identityType, setIdentityType] = useState<IdentityTypeKey>(
    (bwConfig?.identityType as IdentityTypeKey) ?? "all"
  );

  const [showAppearance, setShowAppearance] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState<string>(bw?.icon ?? editing?.template.icon ?? "");
  const [selectedColor, setSelectedColor] = useState<string>(bw?.color ?? editing?.template.iconBg ?? "");

  const [subOrgSearch, setSubOrgSearch] = useState("");
  const [projectSearch, setProjectSearch] = useState("");
  const [showSubOrgDropdown, setShowSubOrgDropdown] = useState(false);
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const subOrgDropdownRef = useRef<HTMLDivElement>(null);
  const projectDropdownRef = useRef<HTMLDivElement>(null);

  const { subscription } = useSubscription();

  const subOrgQueryOptions = subOrganizationsQuery.list({ limit: 500, isAccessible: true });
  const { data: subOrganizations = [], isLoading: isLoadingSubOrgs } = useQuery({
    ...subOrgQueryOptions,
    enabled: Boolean(subscription?.subOrganization)
  });

  const { data: projects = [], isLoading: isLoadingProjects } = useGetUserProjects();

  const filteredSubOrgs = useMemo(
    () =>
      subOrganizations.filter((s) =>
        s.name.toLowerCase().includes(subOrgSearch.toLowerCase())
      ),
    [subOrgSearch, subOrganizations]
  );

  const filteredProjects = useMemo(
    () =>
      projects.filter((p) =>
        p.name.toLowerCase().includes(projectSearch.toLowerCase())
      ),
    [projectSearch, projects]
  );

  const REFRESH_OPTIONS = ["5s", "10s", "30s", "1m", "5m", "30m", "60m", "Off"];

  const filter: WidgetFilter = useMemo(
    () => ({
      resources: Array.from(selectedResources),
      scopeTypes: [],
      statuses: Array.from(selectedStatuses),
      projectId: scopeMode === "project" ? selectedProjectId : undefined,
      subOrgIds: scopeMode === "suborg" ? Array.from(selectedSubOrgs) : undefined,
      scopeMode,
      eventCategories: Array.from(selectedEventCategories)
    }),
    [selectedResources, selectedStatuses, scopeMode, selectedProjectId, selectedSubOrgs, selectedEventCategories]
  );

  const canSubmit =
    title.trim().length > 0 &&
    (widgetType === "stream" || widgetType === "metrics" || selectedResources.size > 0);

  const isSubmitting = createWidget.isPending;

  async function handleSubmit() {
    if (!canSubmit || isSubmitting) return;

    const key = editing?.tmplKey ?? `custom_${Date.now()}`;

    if (widgetType === "metrics") {
      let widgetId: string | undefined;

      if (!isEditMode) {
        const refreshSecs = parseRefreshSeconds(refreshInterval);
        let config: Record<string, unknown>;

        if (metricType === "status_count") {
          config = {
            metricType: "status_count",
            status: metricStatus,
            ...(metricResourceTypes.size > 0 && { resourceTypes: Array.from(metricResourceTypes) })
          };
        } else if (metricType === "expiring_soon") {
          config = {
            metricType: "expiring_soon",
            thresholdDays: parseInt(thresholdDays, 10) || 7,
            ...(metricResourceTypes.size > 0 && { resourceTypes: Array.from(metricResourceTypes) })
          };
        } else {
          config = { metricType: "identity_count", identityType };
        }

        const widget = await createWidget.mutateAsync({
          name: title.trim(),
          description: description.trim() || undefined,
          orgId,
          type: "metrics",
          config,
          refreshInterval: refreshSecs,
          icon: selectedIcon || "BarChart2",
          color: selectedColor || "#3b82f6"
        });

        widgetId = widget.id;
      }

      const resolvedKey = isEditMode ? key : `custom_${widgetId}`;
      const template: WidgetTemplate = {
        title: title.trim(),
        description: description.trim() || undefined,
        icon: selectedIcon || "BarChart2",
        iconBg: selectedColor || "#1c2a3a",
        refresh: refreshInterval,
        stats: [],
        dataKey: "metrics",
        firstStatus: "",
        isMetrics: true
      };
      const panelItem: PanelItem = {
        id: resolvedKey,
        icon: selectedIcon || "BarChart2",
        bg: selectedColor || "#1c2a3a",
        name: title.trim(),
        desc: description.trim() || "Custom metrics counter.",
        badge: "Custom",
        category: "custom"
      };
      onSubmit({ template, panelItem, key: resolvedKey, widgetId });
      return;
    }

    if (widgetType === "stream") {
      const template: WidgetTemplate = {
        title: title.trim(),
        description: description.trim() || undefined,
        icon: selectedIcon || "Terminal",
        iconBg: selectedColor || "#1c2a3a",
        refresh: "30s",
        stats: [],
        dataKey: "logs",
        firstStatus: "",
        isLogs: true,
        filter
      };
      const panelItem: PanelItem = {
        id: key,
        icon: selectedIcon || "Terminal",
        bg: selectedColor || "#1c2a3a",
        name: title.trim(),
        desc: description.trim() || "Custom live log stream.",
        badge: "Custom",
        category: "custom"
      };
      onSubmit({ template, panelItem, key });
      return;
    }

    const statusArr = Array.from(selectedStatuses);
    const stats = EVENT_TYPES.filter(
      (s) => statusArr.length === 0 || statusArr.includes(s.key)
    ).map((s) => ({
      color: s.color,
      label: s.label,
      key: s.key,
      count: 0
    }));

    const firstResource = RESOURCE_TYPES.find((r) => selectedResources.has(r.key));

    const template: WidgetTemplate = {
      title: title.trim(),
      description: description.trim() || undefined,
      icon: selectedIcon || firstResource?.icon || "Activity",
      iconBg: selectedColor || "#1c2a3a",
      borderColor:
        selectedStatuses.has("failed") || selectedStatuses.size === 0 ? "#6e1a1a" : undefined,
      refresh: refreshInterval,
      stats,
      dataKey: "custom",
      firstStatus: statusArr[0] ?? "",
      filter
    };

    const panelItem: PanelItem = {
      id: key,
      icon: selectedIcon || firstResource?.icon || "Activity",
      bg: selectedColor || "#1c2a3a",
      name: title.trim(),
      desc: description.trim() || `${filter.resources.length} resource(s) tracked.`,
      badge: "Custom",
      category: "custom"
    };

    onSubmit({ template, panelItem, key });
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-mineshaft-600 bg-mineshaft-900 p-4">
      <div className="text-sm font-semibold text-gray-200">
        {isEditMode ? "Edit Widget" : "Create Custom Widget"}
      </div>

      {/* Title */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-mineshaft-300">
          Widget Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Failing Integrations"
          className="w-full rounded-md border border-mineshaft-600 bg-mineshaft-700 px-3 py-2 text-[13px] text-white outline-none placeholder:text-mineshaft-400 focus:border-primary"
        />
        <p className="mt-1 text-[10px] leading-relaxed text-mineshaft-400">
          A short name displayed in the widget header.
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-[11px] font-medium text-mineshaft-300">
          Description <span className="font-normal text-mineshaft-400">(optional)</span>
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Tracks failed syncs and integrations that need immediate action."
          rows={2}
          className="w-full resize-none rounded-md border border-mineshaft-600 bg-mineshaft-700 px-3 py-2 text-[13px] text-white outline-none placeholder:text-mineshaft-400 focus:border-primary"
        />
      </div>

      {/* Widget Type toggle */}
      <div>
        <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
          Widget Type
        </label>
        <div className="flex gap-1 rounded-md border border-mineshaft-600 bg-mineshaft-700 p-0.5">
          {(["resource_activity", "stream", "metrics"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setWidgetType(t)}
              className={twMerge(
                "flex-1 rounded-[5px] py-1.5 text-[12px] font-medium transition-colors",
                widgetType === t
                  ? "bg-mineshaft-600 text-white"
                  : "text-mineshaft-300 hover:text-white"
              )}
            >
              {t === "resource_activity" ? "Activity" : t === "stream" ? "Stream" : "Metrics"}
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-mineshaft-400">
          {widgetType === "resource_activity"
            ? "Displays a filterable table of resource events."
            : widgetType === "stream"
              ? "Shows a real-time scrolling log stream."
              : "Displays a single KPI counter backed by live data."}
        </p>
      </div>

      {/* Refresh Interval - only shown for resource_activity widgets */}
      {widgetType === "resource_activity" && (
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
            Refresh Interval
          </label>
          <div className="flex flex-wrap gap-1.5">
            {REFRESH_OPTIONS.map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setRefreshInterval(opt)}
                className={twMerge(
                  "rounded-md border px-2.5 py-1 text-[11px] font-medium transition-colors",
                  refreshInterval === opt
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-mineshaft-600 bg-mineshaft-700 text-mineshaft-300 hover:border-mineshaft-500 hover:text-white"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Scope - shown for resource_activity and stream widgets */}
      {(widgetType === "resource_activity" || widgetType === "stream") && (
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
            Scope
          </label>
          <div className="flex gap-1 rounded-md border border-mineshaft-600 bg-mineshaft-700 p-0.5">
            {(
              [
                { key: "org", label: "Organization" },
                { key: "suborg", label: "Sub-Org" },
                { key: "project", label: "Project" }
              ] as const
            ).map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => {
                  setScopeMode(s.key);
                  if (s.key === "project" || s.key === "suborg") {
                    setSelectedResources((prev) => {
                      const next = new Set(prev);
                      ORG_ONLY_RESOURCES.forEach((k) => next.delete(k));
                      return next;
                    });
                  }
                }}
                className={twMerge(
                  "flex-1 rounded-[5px] py-1.5 text-[12px] font-medium transition-colors",
                  scopeMode === s.key
                    ? "bg-mineshaft-600 text-white"
                    : "text-mineshaft-300 hover:text-white"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>

          {scopeMode === "suborg" && (
            <div className="relative mt-2" ref={subOrgDropdownRef}>
              {/* Selected Sub-Orgs display */}
              {selectedSubOrgs.size > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {Array.from(selectedSubOrgs).map((subOrgId) => {
                    const subOrg = subOrganizations.find((s) => s.id === subOrgId);
                    return (
                      <span
                        key={subOrgId}
                        className="flex items-center gap-1 rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary"
                      >
                        {subOrg?.name ?? subOrgId}
                        <button
                          type="button"
                          onClick={() => setSelectedSubOrgs(toggleSet(selectedSubOrgs, subOrgId))}
                          className="ml-0.5 text-primary/70 hover:text-primary"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
              {/* Dropdown trigger */}
              <button
                type="button"
                onClick={() => setShowSubOrgDropdown(!showSubOrgDropdown)}
                className="flex w-full items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-700 px-3 py-2 text-[13px] text-mineshaft-300 outline-none transition-colors hover:border-mineshaft-500 focus:border-primary"
              >
                <span>Select sub-organizations...</span>
                {isLoadingSubOrgs ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ChevronDown
                    size={14}
                    className={twMerge("transition-transform", showSubOrgDropdown && "rotate-180")}
                  />
                )}
              </button>
              {/* Dropdown */}
              {showSubOrgDropdown && (
                <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-mineshaft-600 bg-mineshaft-800 shadow-lg">
                  <div className="border-b border-mineshaft-600 p-2">
                    <div className="relative">
                      <FontAwesomeIcon
                        icon={faSearch}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mineshaft-400"
                        size="xs"
                      />
                      <input
                        type="text"
                        value={subOrgSearch}
                        onChange={(e) => setSubOrgSearch(e.target.value)}
                        placeholder="Search sub-organizations..."
                        className="w-full rounded-md border border-mineshaft-600 bg-mineshaft-700 py-1.5 pl-8 pr-3 text-[12px] text-white outline-none placeholder:text-mineshaft-400 focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {isLoadingSubOrgs ? (
                      <div className="flex items-center justify-center px-3 py-4">
                        <Loader2 size={16} className="animate-spin text-mineshaft-400" />
                      </div>
                    ) : filteredSubOrgs.length === 0 ? (
                      <div className="px-3 py-2 text-center text-[12px] text-mineshaft-400">
                        No sub-organizations found
                      </div>
                    ) : (
                      filteredSubOrgs.map((s) => {
                        const sel = selectedSubOrgs.has(s.id);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setSelectedSubOrgs(toggleSet(selectedSubOrgs, s.id))}
                            className={twMerge(
                              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px] transition-colors",
                              sel
                                ? "bg-primary/10 text-primary"
                                : "text-mineshaft-200 hover:bg-mineshaft-700"
                            )}
                          >
                            {s.name}
                            {sel && <Check size={12} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {scopeMode === "project" && (
            <div className="relative mt-2" ref={projectDropdownRef}>
              {/* Dropdown trigger */}
              <button
                type="button"
                onClick={() => setShowProjectDropdown(!showProjectDropdown)}
                className="flex w-full items-center justify-between rounded-md border border-mineshaft-600 bg-mineshaft-700 px-3 py-2 text-[13px] text-white outline-none transition-colors hover:border-mineshaft-500 focus:border-primary"
              >
                <span>
                  {selectedProjectId
                    ? projects.find((p) => p.id === selectedProjectId)?.name ?? "Select a project..."
                    : "Select a project..."}
                </span>
                {isLoadingProjects ? (
                  <Loader2 size={14} className="animate-spin text-mineshaft-300" />
                ) : (
                  <ChevronDown
                    size={14}
                    className={twMerge("text-mineshaft-300 transition-transform", showProjectDropdown && "rotate-180")}
                  />
                )}
              </button>
              {/* Dropdown */}
              {showProjectDropdown && (
                <div className="absolute left-0 right-0 z-50 mt-1 rounded-md border border-mineshaft-600 bg-mineshaft-800 shadow-lg">
                  <div className="border-b border-mineshaft-600 p-2">
                    <div className="relative">
                      <FontAwesomeIcon
                        icon={faSearch}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mineshaft-400"
                        size="xs"
                      />
                      <input
                        type="text"
                        value={projectSearch}
                        onChange={(e) => setProjectSearch(e.target.value)}
                        placeholder="Search projects..."
                        className="w-full rounded-md border border-mineshaft-600 bg-mineshaft-700 py-1.5 pl-8 pr-3 text-[12px] text-white outline-none placeholder:text-mineshaft-400 focus:border-primary"
                      />
                    </div>
                  </div>
                  <div className="max-h-48 overflow-y-auto p-1">
                    {isLoadingProjects ? (
                      <div className="flex items-center justify-center px-3 py-4">
                        <Loader2 size={16} className="animate-spin text-mineshaft-400" />
                      </div>
                    ) : filteredProjects.length === 0 ? (
                      <div className="px-3 py-2 text-center text-[12px] text-mineshaft-400">
                        No projects found
                      </div>
                    ) : (
                      filteredProjects.map((p) => {
                        const sel = selectedProjectId === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => {
                              setSelectedProjectId(p.id);
                              setShowProjectDropdown(false);
                              setProjectSearch("");
                            }}
                            className={twMerge(
                              "flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-[12px] transition-colors",
                              sel
                                ? "bg-primary/10 text-primary"
                                : "text-mineshaft-200 hover:bg-mineshaft-700"
                            )}
                          >
                            {p.name}
                            {sel && <Check size={12} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <p className="mt-1 text-[10px] leading-relaxed text-mineshaft-400">
            {scopeMode === "org"
              ? widgetType === "stream"
                ? "Stream logs from the entire organization."
                : "Monitor events across the entire organization."
              : scopeMode === "suborg"
                ? widgetType === "stream"
                  ? "Stream logs from a specific sub-organization."
                  : "Narrow to a specific sub-organization."
                : widgetType === "stream"
                  ? "Stream logs from a single project."
                  : "Narrow to a single project."}
          </p>
        </div>
      )}

      {/* Event Categories - shown only for stream widgets */}
      {widgetType === "stream" && (
        <div>
          <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
            Event Categories <span className="text-mineshaft-500">(optional)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {AUDIT_LOG_EVENT_CATEGORIES.map((category) => {
              const sel = selectedEventCategories.has(category.key);
              return (
                <button
                  key={category.key}
                  type="button"
                  onClick={() =>
                    setSelectedEventCategories(toggleSet(selectedEventCategories, category.key))
                  }
                  title={category.description}
                  className={twMerge(
                    "rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                    sel
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-mineshaft-600 bg-mineshaft-700 text-mineshaft-300 hover:border-mineshaft-500 hover:text-white"
                  )}
                >
                  {category.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[10px] leading-relaxed text-mineshaft-400">
            {selectedEventCategories.size === 0
              ? "Leave empty to stream all events, or select specific categories to filter."
              : `Streaming ${selectedEventCategories.size} categor${selectedEventCategories.size === 1 ? "y" : "ies"}.`}
          </p>
        </div>
      )}

      {widgetType === "resource_activity" && (
        <>
          {/* Resources */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
              Resources <span className="text-red-400">*</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {RESOURCE_TYPES.map((r) => {
                const sel = selectedResources.has(r.key);
                const disabled =
                  (scopeMode === "project" || scopeMode === "suborg") && r.orgOnly;
                return (
                  <button
                    key={r.key}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      setSelectedResources(toggleSet(selectedResources, r.key))
                    }
                    title={
                      disabled
                        ? "This resource is only available at organization scope"
                        : r.label
                    }
                    className={twMerge(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                      disabled
                        ? "cursor-not-allowed border-mineshaft-700 bg-mineshaft-800 text-mineshaft-500"
                        : sel
                          ? "border-primary/50 bg-primary/10 text-primary"
                          : "border-mineshaft-600 bg-mineshaft-700 text-mineshaft-300 hover:border-mineshaft-500 hover:text-white"
                    )}
                  >
                    <WidgetIcon name={r.icon} size={11} />
                    {r.label}
                    {sel && !disabled && <Check size={10} />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Event Type */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
              Event Type{" "}
              <span className="font-normal text-mineshaft-400">(optional)</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {EVENT_TYPES.map((s) => {
                const sel = selectedStatuses.has(s.key);
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() =>
                      setSelectedStatuses(toggleSet(selectedStatuses, s.key))
                    }
                    className={twMerge(
                      "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                      sel
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-mineshaft-600 bg-mineshaft-700 text-mineshaft-300 hover:border-mineshaft-500 hover:text-white"
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: s.color }}
                    />
                    {s.label}
                    {sel && <Check size={10} />}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      {widgetType === "metrics" && (
        <>
          {/* Metric Type */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
              Metric Type
            </label>
            <div className="flex gap-1 rounded-md border border-mineshaft-600 bg-mineshaft-700 p-0.5">
              {(
                [
                  { key: "status_count", label: "Status Count" },
                  { key: "expiring_soon", label: "Expiring Soon" },
                  { key: "identity_count", label: "Identities" }
                ] as const
              ).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMetricType(m.key)}
                  className={twMerge(
                    "flex-1 rounded-[5px] py-1.5 text-[12px] font-medium transition-colors",
                    metricType === m.key
                      ? "bg-mineshaft-600 text-white"
                      : "text-mineshaft-300 hover:text-white"
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[10px] leading-relaxed text-mineshaft-400">
              {metricType === "status_count"
                ? "Count resources by their current status (failed, pending, etc.)."
                : metricType === "expiring_soon"
                  ? "Count resources expiring within a given number of days."
                  : "Count user or machine identities in the organization."}
            </p>
          </div>

          {/* Status Count options */}
          {metricType === "status_count" && (
            <>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
                  Status
                </label>
                <div className="flex gap-1 rounded-md border border-mineshaft-600 bg-mineshaft-700 p-0.5">
                  {(["failed", "pending", "active", "expired"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setMetricStatus(s)}
                      className={twMerge(
                        "flex-1 rounded-[5px] py-1.5 text-[12px] font-medium capitalize transition-colors",
                        metricStatus === s
                          ? "bg-mineshaft-600 text-white"
                          : "text-mineshaft-300 hover:text-white"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
                  Resources <span className="font-normal text-mineshaft-400">(optional — defaults to all)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {RESOURCE_TYPES.map((r) => {
                    const sel = metricResourceTypes.has(r.key);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setMetricResourceTypes(toggleSet(metricResourceTypes, r.key))}
                        className={twMerge(
                          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                          sel
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-mineshaft-600 bg-mineshaft-700 text-mineshaft-300 hover:border-mineshaft-500 hover:text-white"
                        )}
                      >
                        <WidgetIcon name={r.icon} size={11} />
                        {r.label}
                        {sel && <Check size={10} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Expiring Soon options */}
          {metricType === "expiring_soon" && (
            <>
              <div>
                <label className="mb-1 block text-[11px] font-medium text-mineshaft-300">
                  Threshold Days
                </label>
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={thresholdDays}
                  onChange={(e) => setThresholdDays(e.target.value)}
                  className="w-full rounded-md border border-mineshaft-600 bg-mineshaft-700 px-3 py-2 text-[13px] text-white outline-none placeholder:text-mineshaft-400 focus:border-primary"
                />
                <p className="mt-1 text-[10px] leading-relaxed text-mineshaft-400">
                  Count resources expiring within this many days (1–365).
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
                  Resources <span className="font-normal text-mineshaft-400">(optional — defaults to all)</span>
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {RESOURCE_TYPES.map((r) => {
                    const sel = metricResourceTypes.has(r.key);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onClick={() => setMetricResourceTypes(toggleSet(metricResourceTypes, r.key))}
                        className={twMerge(
                          "flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                          sel
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : "border-mineshaft-600 bg-mineshaft-700 text-mineshaft-300 hover:border-mineshaft-500 hover:text-white"
                        )}
                      >
                        <WidgetIcon name={r.icon} size={11} />
                        {r.label}
                        {sel && <Check size={10} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* Identity Count options */}
          {metricType === "identity_count" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium text-mineshaft-300">
                Identity Type
              </label>
              <div className="flex gap-1 rounded-md border border-mineshaft-600 bg-mineshaft-700 p-0.5">
                {(["user", "machine", "all"] as const).map((it) => (
                  <button
                    key={it}
                    type="button"
                    onClick={() => setIdentityType(it)}
                    className={twMerge(
                      "flex-1 rounded-[5px] py-1.5 text-[12px] font-medium capitalize transition-colors",
                      identityType === it
                        ? "bg-mineshaft-600 text-white"
                        : "text-mineshaft-300 hover:text-white"
                    )}
                  >
                    {it === "all" ? "All" : it === "user" ? "Users" : "Machines"}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Appearance (collapsible) */}
      <div>
        <button
          type="button"
          onClick={() => setShowAppearance(!showAppearance)}
          className="flex w-full cursor-pointer items-center gap-1.5 text-[11px] font-medium text-mineshaft-300 transition-colors hover:text-white"
        >
          <Palette size={12} />
          Appearance
          <span className="font-normal text-mineshaft-400">(optional)</span>
          <ChevronDown
            size={12}
            className={twMerge("ml-auto transition-transform", showAppearance && "rotate-180")}
          />
        </button>

        {showAppearance && (
          <div className="mt-3 flex flex-col gap-3 rounded-md border border-mineshaft-600 bg-mineshaft-800 p-3">
            {/* Icon picker */}
            <div>
              <label className="mb-1.5 block text-[10px] font-medium text-mineshaft-300">
                Icon
              </label>
              <div className="flex flex-wrap gap-1">
                {AVAILABLE_ICONS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setSelectedIcon(selectedIcon === name ? "" : name)}
                    title={name}
                    className={twMerge(
                      "flex h-7 w-7 items-center justify-center rounded-md border transition-colors",
                      selectedIcon === name
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-transparent text-mineshaft-300 hover:bg-mineshaft-600 hover:text-white"
                    )}
                  >
                    <WidgetIcon name={name} size={13} />
                  </button>
                ))}
              </div>
            </div>

            {/* Color picker */}
            <div>
              <label className="mb-1.5 block text-[10px] font-medium text-mineshaft-300">
                Color
              </label>
              <div className="flex flex-wrap gap-1.5">
                {ICON_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setSelectedColor(selectedColor === color ? "" : color)}
                    className={twMerge(
                      "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
                      selectedColor === color
                        ? "scale-110 border-white"
                        : "border-transparent hover:border-mineshaft-400"
                    )}
                  >
                    <span className="h-4 w-4 rounded-full" style={{ background: color }} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          variant="success"
          size="md"
          onClick={handleSubmit}
          isDisabled={!canSubmit || isSubmitting}
          className="flex-1"
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <Loader2 size={13} className="animate-spin" />
              Creating...
            </span>
          ) : isEditMode ? (
            "Save Changes"
          ) : (
            "Create Widget"
          )}
        </Button>
        <Button variant="neutral" size="md" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
