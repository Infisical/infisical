import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
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
      url,
      scope,
      secretPath,
      metadata
    }: {
      integrationAuthId: string;
      isActive: boolean;
      secretPath: string;
      app?: string;
      appId?: string;
      sourceEnvironment: string;
      targetEnvironment?: string;
      targetEnvironmentId?: string;
      targetService?: string;
      targetServiceId?: string;
      owner?: string;
      url?: string;
      path?: string;
      region?: string;
      scope?: string;
      metadata?: {
        secretPrefix?: string;
        secretSuffix?: string;
        initialSyncBehavior?: string;
        shouldAutoRedeploy?: boolean;
        mappingBehavior?: string;
        secretAWSTag?: {
          key: string;
          value: string;
        }[];
        kmsKeyId?: string;
        shouldDisableDelete?: boolean;
        shouldMaskSecrets?: boolean;
        shouldProtectSecrets?: boolean;
        shouldEnableDelete?: boolean;
      };
    }) => {
      const {
        data: { integration }
      } = await apiRequest.post("/api/v1/integration", {
        integrationAuthId,
        isActive,
        app,
        appId,
        sourceEnvironment,
        targetEnvironment,
        targetEnvironmentId,
        targetService,
        targetServiceId,
        url,
        owner,
        path,
        scope,
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

  return useMutation<
    {},
    {},
    { id: string; workspaceId: string; shouldDeleteIntegrationSecrets: boolean }
  >({
    mutationFn: ({ id, shouldDeleteIntegrationSecrets }) =>
      apiRequest.delete(
        `/api/v1/integration/${id}?shouldDeleteIntegrationSecrets=${shouldDeleteIntegrationSecrets}`
      ),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIntegrations(workspaceId));
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceAuthorization(workspaceId));
    }
  });
};

export const useSyncIntegration = () => {
  return useMutation<{}, {}, { id: string; workspaceId: string; lastUsed: string }>({
    mutationFn: ({ id }) => apiRequest.post(`/api/v1/integration/${id}/sync`),
    onSuccess: () => {
      createNotification({
        text: "Successfully triggered manual sync",
        type: "success"
      });
    }
  });
};
