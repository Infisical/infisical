import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { observabilityWidgetKeys } from "./queries";
import type { ObservabilityWidgetListItem } from "./queries";

export interface CreateWidgetDto {
  name: string;
  description?: string;
  orgId: string;
  subOrgId?: string | null;
  projectId?: string | null;
  type: string;
  config: unknown;
  refreshInterval?: number;
  icon?: string;
  color?: string;
}

export const useCreateWidget = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (dto: CreateWidgetDto) =>
      apiRequest
        .post<{ widget: ObservabilityWidgetListItem }>("/api/v1/observability-widgets", dto)
        .then((r) => r.data.widget),
    onSuccess: (_, { orgId }) => {
      void queryClient.invalidateQueries({ queryKey: observabilityWidgetKeys.list(orgId) });
    }
  });
};

export const useDeleteWidget = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ widgetId, orgId }: { widgetId: string; orgId: string }) =>
      apiRequest
        .delete(`/api/v1/observability-widgets/${widgetId}`)
        .then(() => ({ widgetId, orgId })),
    onSuccess: (_, { orgId }) => {
      void queryClient.invalidateQueries({ queryKey: observabilityWidgetKeys.list(orgId) });
    }
  });
};
