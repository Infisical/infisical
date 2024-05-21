import { MutableRefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
import { TCloudIntegration, TIntegration } from "./types";

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
      path?: string;
      region?: string;
      scope?: string;
      metadata?: {
        secretPrefix?: string;
        secretSuffix?: string;
        initialSyncBehavior?: string;
        shouldAutoRedeploy?: boolean;
        secretAWSTag?: {
          key: string;
          value: string;
        }[];
        kmsKeyId?: string;
        shouldDisableDelete?: boolean;
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

  return useMutation<{}, {}, { id: string; workspaceId: string }>({
    mutationFn: ({ id }) => apiRequest.delete(`/api/v1/integration/${id}`),
    onSuccess: (_, { workspaceId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceIntegrations(workspaceId));
      queryClient.invalidateQueries(workspaceKeys.getWorkspaceAuthorization(workspaceId));
    }
  });
};

export const useSyncIntegration = (pollingRef: MutableRefObject<NodeJS.Timeout | null>) => {
  const queryClient = useQueryClient();

  return useMutation<{}, {}, { id: string; workspaceId: string; lastUsed: string }>({
    mutationFn: ({ id }) => apiRequest.post(`/api/v1/integration/${id}/sync`),
    onSuccess: (_, { id, workspaceId, lastUsed }) => {
      // eslint-disable-next-line no-param-reassign
      pollingRef.current = setInterval(() => {
        const integrations: TIntegration[] | undefined = queryClient.getQueryData(
          workspaceKeys.getWorkspaceIntegrations(workspaceId)
        );

        const integration = integrations?.find((entry) => entry.id === id);
        if (!integration || integration.lastUsed !== lastUsed) {
          clearInterval(pollingRef.current as NodeJS.Timeout);
          // eslint-disable-next-line no-param-reassign
          pollingRef.current = null;
          return;
        }
        queryClient.invalidateQueries(workspaceKeys.getWorkspaceIntegrations(workspaceId));
      }, 3500);
    }
  });
};
