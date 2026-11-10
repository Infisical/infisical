import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TAvailableAppConnection } from "../appConnections/types";
import { TAnthropicModel, TOrgAiConfig } from "./types";

export const aiQueryKeys = {
  all: ["ai"] as const,
  orgConfig: () => [...aiQueryKeys.all, "org-config"] as const,
  anthropicModels: (connectionId: string) =>
    [...aiQueryKeys.all, "anthropic-models", connectionId] as const,
  orgAnthropicConnections: () => [...aiQueryKeys.all, "org-anthropic-connections"] as const
};

export const useGetOrgAiConfig = (options?: { enabled?: boolean }) =>
  useQuery({
    queryKey: aiQueryKeys.orgConfig(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ aiConfig: TOrgAiConfig | null }>(
        "/api/v1/organization/ai-config"
      );
      return data.aiConfig;
    },
    ...options
  });

export const useListAnthropicModels = (connectionId: string) =>
  useQuery({
    queryKey: aiQueryKeys.anthropicModels(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ models: TAnthropicModel[] }>(
        `/api/v1/app-connections/anthropic/${connectionId}/models`
      );
      return data.models;
    },
    enabled: Boolean(connectionId),
    retry: false
  });

export const useListOrgAnthropicConnections = () =>
  useQuery({
    queryKey: aiQueryKeys.orgAnthropicConnections(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ appConnections: TAvailableAppConnection[] }>(
        "/api/v1/app-connections/anthropic/available"
      );
      return data.appConnections.filter((connection) => !connection.projectId);
    }
  });
