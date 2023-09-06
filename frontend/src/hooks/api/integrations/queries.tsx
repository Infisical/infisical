import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { TCloudIntegration } from "./types";

export const integrationQueryKeys = {
  getIntegrations: () => ["integrations"] as const
};

const fetchIntegrations = async () => {
  const { data } = await apiRequest.get<{ integrationOptions: TCloudIntegration[] }>(
    "/api/v1/integration-auth/integration-options"
  );

  return data.integrationOptions;
};

export const useGetCloudIntegrations = () =>
  useQuery({
    queryKey: integrationQueryKeys.getIntegrations(),
    queryFn: () => fetchIntegrations()
  });

export const useCreateIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      integrationAuthId,
      isActive,
      app,
      appId,
      sourceEnvironment,
      targetEnvironment,
      targetEnvironmentId,
      targetService,
      targetServiceId,
      owner,
      path,
      region,
      secretPath,
      metadata
    }: {
      integrationAuthId: string;
      isActive: boolean;
      secretPath: string;
      app?: string;
      appId?: string;
      sourceEnvironment: string;
      targetEnvironment: string | null;
      targetEnvironmentId: string | null;
      targetService: string | null;
      targetServiceId: string | null;
      owner: string | null;
      path: string | null;
      region: string | null;
      metadata?: {
        secretSuffix?: string;
      }
    }) => {
      const { data: { integration } } = await apiRequest.post("/api/v1/integration", {
        integrationAuthId,
        isActive,
        app,
        appId,
        sourceEnvironment,
        targetEnvironment,
        targetEnvironmentId,
        targetService,
        targetServiceId,
        owner,
        path,
        region,
        secretPath,
        metadata
      });

      return integration;
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIntegrations(res.workspace));
    }
  });
};

export const useDeleteIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, { id: string; workspaceId: string }>({
    mutationFn: ({ id }) => apiRequest.delete(`/api/v1/integration/${id}`),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIntegrations(workspaceId));
    }
  });
};