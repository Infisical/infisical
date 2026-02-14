import { useMutation, useQuery, useQueryClient, UseQueryOptions } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";

import { projectKeys } from "../projects";
import {
  IntegrationMetadataSyncMode,
  TCloudIntegration,
  TIntegrationWithEnv,
  TOctopusDeployScopeValues
} from "./types";

export const integrationQueryKeys = {
  getIntegrations: () => ["integrations"] as const,
  getIntegration: (id: string) => ["integration", id] as const
};

const fetchIntegrations = async () => {
  const { data } = await apiRequest.get<{ integrationOptions: TCloudIntegration[] }>(
    "/api/v1/integration-auth/integration-options"
  );

  return data.integrationOptions;
};

const fetchIntegration = async (id: string) => {
  const { data } = await apiRequest.get<{ integration: TIntegrationWithEnv }>(
    `/api/v1/integration/${id}`
  );

  return data.integration;
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
        githubVisibility?: string;
        githubVisibilityRepoIds?: string[];
        kmsKeyId?: string;
        shouldDisableDelete?: boolean;
        shouldMaskSecrets?: boolean;
        shouldProtectSecrets?: boolean;
        shouldEnableDelete?: boolean;
        octopusDeployScopeValues?: TOctopusDeployScopeValues;
        metadataSyncMode?: IntegrationMetadataSyncMode;
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
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIntegrations(res.workspace)
      });
    }
  });
};

export const useDeleteIntegration = () => {
  const queryClient = useQueryClient();

  return useMutation<
    object,
    object,
    { id: string; workspaceId: string; shouldDeleteIntegrationSecrets: boolean }
  >({
    mutationFn: ({ id, shouldDeleteIntegrationSecrets }) =>
      apiRequest.delete(
        `/api/v1/integration/${id}?shouldDeleteIntegrationSecrets=${shouldDeleteIntegrationSecrets}`
      ),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectIntegrations(workspaceId)
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.getProjectAuthorization(workspaceId)
      });
    }
  });
};

export const useGetIntegration = (
  integrationId: string,
  options?: Omit<
    UseQueryOptions<
      TIntegrationWithEnv,
      unknown,
      TIntegrationWithEnv,
      ReturnType<typeof integrationQueryKeys.getIntegration>
    >,
    "queryFn" | "queryKey"
  >
) => {
  return useQuery({
    ...options,
    enabled: Boolean(integrationId && options?.enabled === undefined ? true : options?.enabled),
    queryKey: integrationQueryKeys.getIntegration(integrationId),
    queryFn: () => fetchIntegration(integrationId)
  });
};

export const useSyncIntegration = () => {
  return useMutation<object, object, { id: string; workspaceId: string; lastUsed: string }>({
    mutationFn: ({ id }) => apiRequest.post(`/api/v1/integration/${id}/sync`, {}),
    onSuccess: () => {
      createNotification({
        text: "Successfully triggered manual sync",
        type: "success"
      });
    }
  });
};
