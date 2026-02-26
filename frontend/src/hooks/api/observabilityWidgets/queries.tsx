import { useQuery } from "@tanstack/react-query";

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
  data: (widgetId: string) => ["observability-widget-data", widgetId] as const
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
    queryKey: observabilityWidgetKeys.data(widgetId!),
    enabled: !!widgetId,
    queryFn: () =>
      apiRequest
        .get<ObservabilityWidgetDataResponse>(`/api/v1/observability-widgets/${widgetId}/data`, {
          params
        })
        .then((r) => r.data),
    refetchInterval: 30_000
  });
