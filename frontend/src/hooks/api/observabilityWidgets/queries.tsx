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
  subOrgId?: string | null;
  projectId?: string | null;
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
  scope: {
    type: "org" | "sub-org" | "project";
    displayName: string;
  };
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

export interface EventsWidgetConfig {
  resourceTypes?: string[];
  eventTypes: ("failed" | "pending" | "active" | "expired")[];
  thresholds?: {
    expirationDays?: number;
    inactivityDays?: number;
    heartbeatMinutes?: number;
  };
}

export interface LogsWidgetConfig {
  limit?: number;
  eventCategories?: string[];
}

export const AUDIT_LOG_EVENT_CATEGORIES = [
  { key: "secrets", label: "Secrets", description: "Secret operations (read, create, update, delete)" },
  { key: "integrations", label: "Integrations", description: "Integration sync and auth events" },
  { key: "identities", label: "Identities", description: "Machine identity operations" },
  { key: "pki", label: "PKI", description: "Certificate authority and certificate events" },
  { key: "ssh", label: "SSH", description: "SSH CA and credential events" },
  { key: "kms", label: "KMS", description: "KMS key and encryption events" },
  { key: "auth", label: "Authentication", description: "Login and auth events" },
  { key: "projects", label: "Projects", description: "Project and environment events" },
  { key: "organizations", label: "Organizations", description: "Organization and sub-org events" }
] as const;

export interface CreateWidgetDTO {
  name: string;
  description?: string;
  orgId: string;
  subOrgId?: string | null;
  projectId?: string | null;
  type: "events" | "logs" | "metrics" | "pie-chart";
  config: EventsWidgetConfig | LogsWidgetConfig;
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

export interface UpdateWidgetDTO {
  widgetId: string;
  orgId: string;
  name?: string;
  description?: string;
  config?: EventsWidgetConfig | LogsWidgetConfig;
  refreshInterval?: number;
  icon?: string;
  color?: string;
  subOrgId?: string | null;
  projectId?: string | null;
}

export const useUpdateWidget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ widgetId, orgId, ...dto }: UpdateWidgetDTO) => {
      const { data } = await apiRequest.patch<{ widget: ObservabilityWidgetListItem }>(
        `/api/v1/observability-widgets/${widgetId}`,
        dto
      );
      return { widget: data.widget, orgId };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({
        queryKey: observabilityWidgetKeys.list(result.orgId)
      });
      queryClient.invalidateQueries({
        queryKey: ["observability-widget-live-logs", result.widget.id]
      });
      queryClient.invalidateQueries({
        queryKey: ["observability-widget-data", result.widget.id]
      });
    }
  });
};

export const useDeleteWidget = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ widgetId, orgId }: { widgetId: string; orgId: string }) => {
      await apiRequest.delete(`/api/v1/observability-widgets/${widgetId}`);
      return { widgetId, orgId };
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: observabilityWidgetKeys.list(variables.orgId)
      });
    }
  });
};
