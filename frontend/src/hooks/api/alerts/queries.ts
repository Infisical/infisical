import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import {
  TAlert,
  TAlertSlackChannel,
  TAlertSlackIntegration,
  TAlertSlackScope,
  TListAlertsDTO
} from "./types";

export const alertKeys = {
  all: ["alerts"] as const,
  list: (filters: TListAlertsDTO) => [...alertKeys.all, "list", filters] as const,
  slackIntegrations: (scope: TAlertSlackScope) =>
    [...alertKeys.all, "slack-integrations", scope] as const,
  slackChannels: (workflowIntegrationId: string, scope: TAlertSlackScope) =>
    [...alertKeys.all, "slack-integrations", workflowIntegrationId, "channels", scope] as const
};

const toScopeParams = ({ resourceType, resourceId, projectId }: TAlertSlackScope) => ({
  resourceType,
  ...(resourceId ? { resourceId } : {}),
  ...(projectId ? { projectId } : {})
});

export const useListAlertSlackIntegrations = (scope: TAlertSlackScope) =>
  useQuery({
    queryKey: alertKeys.slackIntegrations(scope),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ slackIntegrations: TAlertSlackIntegration[] }>(
        "/api/v1/alerts/slack-integrations",
        { params: toScopeParams(scope) }
      );
      return data.slackIntegrations;
    }
  });

export const useListAlertSlackChannels = (
  workflowIntegrationId: string | undefined,
  scope: TAlertSlackScope
) =>
  useQuery({
    queryKey: alertKeys.slackChannels(workflowIntegrationId ?? "", scope),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ channels: TAlertSlackChannel[] }>(
        `/api/v1/alerts/slack-integrations/${workflowIntegrationId}/channels`,
        { params: toScopeParams(scope) }
      );
      return data.channels;
    },
    enabled: Boolean(workflowIntegrationId)
  });

const fetchAlerts = async (filters: TListAlertsDTO) => {
  const { data } = await apiRequest.get<{ alerts: TAlert[] }>("/api/v1/alerts", {
    params: filters
  });
  return data.alerts;
};

export const useListAlerts = (
  filters: TListAlertsDTO,
  options?: Omit<
    UseQueryOptions<TAlert[], unknown, TAlert[], ReturnType<typeof alertKeys.list>>,
    "queryKey" | "queryFn"
  >
) =>
  useQuery({
    queryKey: alertKeys.list(filters),
    queryFn: () => fetchAlerts(filters),
    ...options
  });
