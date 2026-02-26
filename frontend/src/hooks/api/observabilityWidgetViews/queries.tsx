import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export interface WidgetViewItem {
  uid: string;
  tmpl: string;
  cols: number;
  rows: number;
  order: number;
  widgetId?: string;
  config?: unknown;
}

export interface ObservabilityWidgetView {
  id: string;
  name: string;
  orgId: string;
  userId: string;
  items: WidgetViewItem[];
  createdAt: string;
  updatedAt: string;
}

export const observabilityWidgetViewKeys = {
  list: (orgId: string) => [{ orgId }, "observability-widget-views"] as const,
  detail: (viewId: string) => ["observability-widget-view", viewId] as const
};

export const useListWidgetViews = (orgId: string) => {
  return useQuery({
    queryKey: observabilityWidgetViewKeys.list(orgId),
    queryFn: async () => {
      const {
        data: { views }
      } = await apiRequest.get<{ views: ObservabilityWidgetView[] }>("/api/v1/observability-widget-views", {
        params: { orgId }
      });
      return views;
    },
    enabled: Boolean(orgId)
  });
};

export const useCreateWidgetView = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { name: string; orgId: string }) => {
      const {
        data: { view }
      } = await apiRequest.post<{ view: ObservabilityWidgetView }>("/api/v1/observability-widget-views", dto);
      return view;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: observabilityWidgetViewKeys.list(dto.orgId) });
    }
  });
};

export const useUpdateWidgetView = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { viewId: string; orgId: string; name?: string; items?: WidgetViewItem[] }) => {
      const { viewId, ...body } = dto;
      const {
        data: { view }
      } = await apiRequest.patch<{ view: ObservabilityWidgetView }>(
        `/api/v1/observability-widget-views/${viewId}`,
        body
      );
      return view;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: observabilityWidgetViewKeys.list(dto.orgId) });
    }
  });
};

export const useDeleteWidgetView = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (dto: { viewId: string; orgId: string }) => {
      const {
        data: { view }
      } = await apiRequest.delete<{ view: ObservabilityWidgetView }>(
        `/api/v1/observability-widget-views/${dto.viewId}`,
        { params: { orgId: dto.orgId } }
      );
      return view;
    },
    onSuccess(_, dto) {
      queryClient.invalidateQueries({ queryKey: observabilityWidgetViewKeys.list(dto.orgId) });
    }
  });
};
