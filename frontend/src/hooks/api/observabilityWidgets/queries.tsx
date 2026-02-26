import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export interface ObservabilityWidgetListItem {
  id: string;
  name: string;
  description?: string;
  type: string;
  config: unknown;
  icon?: string;
  color?: string;
  refreshInterval: number;
  isBuiltIn?: boolean;
}

export interface ObservabilityWidgetDataItem {
  id: string;
  resourceType: string;
  resourceName: string;
  scope: { type: string; displayName: string };
  status: string;
  statusTooltip?: string;
  eventTimestamp: string;
  resourceLink?: string;
}

export interface ObservabilityWidgetDataResponse {
  widget: ObservabilityWidgetListItem;
  items: ObservabilityWidgetDataItem[];
  totalCount: number;
  summary: {
    failedCount: number;
    pendingCount: number;
    activeCount: number;
    expiredCount: number;
  };
}

export const observabilityWidgetKeys = {
  list: (orgId: string) => [{ orgId }, "observability-widgets"] as const,
  data: (widgetId: string, params?: { limit?: number; offset?: number }) =>
    ["observability-widget-data", widgetId, params] as const
};

export const useListWidgets = (orgId: string) =>
  useQuery({
    queryKey: observabilityWidgetKeys.list(orgId),
    enabled: !!orgId,
    queryFn: () =>
      apiRequest
        .get<{ widgets: ObservabilityWidgetListItem[] }>(`/api/v1/observability-widgets?orgId=${orgId}`)
        .then((r) => r.data.widgets)
  });

export const useGetWidgetData = (
  widgetId: string | undefined,
  params?: { limit?: number; offset?: number }
) =>
  useQuery({
    queryKey: observabilityWidgetKeys.data(widgetId!, params),
    enabled: !!widgetId,
    queryFn: () =>
      apiRequest
        .get<ObservabilityWidgetDataResponse>(`/api/v1/observability-widgets/${widgetId}/data`, {
          params
        })
        .then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as ObservabilityWidgetDataResponse | undefined;
      return data ? data.widget.refreshInterval * 1000 : 30_000;
    }
  });

export interface ObservabilityLogItem {
  id: string;
  timestamp: string;
  level: "error" | "warn" | "info";
  resourceType: string;
  actor: string;
  message: string;
  metadata: {
    eventType: string;
    ipAddress?: string | null;
    userAgent?: string | null;
    userAgentType?: string | null;
    projectId?: string | null;
    projectName?: string | null;
    actorMetadata?: unknown;
    eventMetadata?: unknown;
  };
}

export interface ObservabilityLiveLogsResponse {
  widget: ObservabilityWidgetListItem;
  items: ObservabilityLogItem[];
  totalCount: number;
  infoText: string;
  auditLogLink: string;
}

export const useGetWidgetLiveLogs = (widgetId: string | undefined, params?: { limit?: number }) =>
  useQuery({
    queryKey: ["observability-widget-live-logs", widgetId, params] as const,
    enabled: !!widgetId,
    queryFn: () =>
      apiRequest
        .get<ObservabilityLiveLogsResponse>(`/api/v1/observability-widgets/${widgetId}/live-logs`, {
          params
        })
        .then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as ObservabilityLiveLogsResponse | undefined;
      return data ? data.widget.refreshInterval * 1000 : 5_000;
    }
  });

export interface ObservabilityMetricsResponse {
  widget: ObservabilityWidgetListItem;
  value: number;
  label: string;
  unit?: string;
  link?: string;
}

export const useGetWidgetMetrics = (widgetId: string | undefined) =>
  useQuery({
    queryKey: ["observability-widget-metrics", widgetId] as const,
    enabled: !!widgetId,
    queryFn: () =>
      apiRequest
        .get<ObservabilityMetricsResponse>(`/api/v1/observability-widgets/${widgetId}/metrics`)
        .then((r) => r.data),
    refetchInterval: (query) => {
      const data = query.state.data as ObservabilityMetricsResponse | undefined;
      return data ? data.widget.refreshInterval * 1000 : 30_000;
    }
  });

export interface CreateWidgetDTO {
  name: string;
  description?: string;
  orgId: string;
  subOrgId?: string | null;
  projectId?: string | null;
  type: "events" | "logs" | "metrics" | "pie-chart";
  config: {
    resourceTypes?: string[];
    eventTypes: ("failed" | "pending" | "active" | "expired")[];
    thresholds?: {
      expirationDays?: number;
      inactivityDays?: number;
      heartbeatMinutes?: number;
    };
  };
  refreshInterval?: number;
  icon?: string;
  color?: string;
}

export const useCreateWidget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateWidgetDTO) => {
      const { data } = await apiRequest.post<{ widget: ObservabilityWidgetListItem }>(
        "/api/v1/observability-widgets",
        dto
      );
      return data.widget;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: observabilityWidgetKeys.list(variables.orgId)
      });
    }
  });
};
