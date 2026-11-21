import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useGetIntegrationAuthOctopusDeployScopeValues } from "@app/hooks/api/integrationAuth/queries";
import { useGetCloudIntegrations, useGetIntegration } from "@app/hooks/api/integrations/queries";
import { useLoadProjectKmsBackup, useUpdateProjectKms } from "@app/hooks/api/kms/mutations";
import {
  fetchProjectKmsBackup,
  useGetActiveProjectKms,
  useGetExternalKmsList
} from "@app/hooks/api/kms/queries";
import {
  useGetWorkspaceIntegrations,
  useGetWorkspaceWorkflowIntegrationConfig
} from "@app/hooks/api/projects/queries";
import { projectKeys } from "@app/hooks/api/projects/query-keys";
import {
  useCreateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useUpdateWebhook
} from "@app/hooks/api/webhooks/mutation";
import { useGetWebhooks } from "@app/hooks/api/webhooks/query";
import {
  useDeleteProjectWorkflowIntegration,
  useUpdateProjectWorkflowIntegrationConfig
} from "@app/hooks/api/workflowIntegrations/mutation";
import {
  useGetMicrosoftTeamsIntegrations,
  useGetMicrosoftTeamsIntegrationTeams,
  useGetSlackIntegrationChannels,
  useGetWorkflowIntegrations
} from "@app/hooks/api/workflowIntegrations/queries";

import type {
  ProjectIntegrationsAdapter,
  TDeleteNativeIntegrationDTO,
  TSyncNativeIntegrationDTO
} from "./contract";

// Main's useSyncIntegration toasts its own success, which would double the page's toast here.
const useSyncNativeIntegration = () =>
  useMutation({
    mutationFn: ({ id }: TSyncNativeIntegrationDTO) =>
      apiRequest.post(`/api/v1/integration/${id}/sync`)
  });

const useDeleteNativeIntegration = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, shouldDeleteIntegrationSecrets }: TDeleteNativeIntegrationDTO) =>
      apiRequest.delete(`/api/v1/integration/${id}`, {
        params: { shouldDeleteIntegrationSecrets }
      }),
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectIntegrations(projectId) });
      queryClient.invalidateQueries({ queryKey: projectKeys.getProjectAuthorization(projectId) });
    }
  });
};

export const projectIntegrationsLive: ProjectIntegrationsAdapter = {
  useExternalKmsList: useGetExternalKmsList,
  useActiveProjectKms: useGetActiveProjectKms,
  useUpdateProjectKms,
  useLoadProjectKmsBackup,
  fetchProjectKmsBackup,
  useWebhooks: useGetWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWorkflowIntegrationConfig: useGetWorkspaceWorkflowIntegrationConfig,
  useUpdateWorkflowIntegrationConfig: useUpdateProjectWorkflowIntegrationConfig,
  useDeleteWorkflowIntegration: useDeleteProjectWorkflowIntegration,
  useWorkflowIntegrations: useGetWorkflowIntegrations,
  useMicrosoftTeamsIntegrations: useGetMicrosoftTeamsIntegrations,
  useSlackChannels: useGetSlackIntegrationChannels,
  useMicrosoftTeamsTeams: useGetMicrosoftTeamsIntegrationTeams,
  useNativeIntegrations: (projectId) => useGetWorkspaceIntegrations(projectId),
  useNativeIntegration: (integrationId) =>
    useGetIntegration(integrationId, { refetchInterval: 30_000 }),
  useNativeIntegrationOptions: useGetCloudIntegrations,
  useOctopusDeployScopeValues: (params, options) =>
    useGetIntegrationAuthOctopusDeployScopeValues(params, options),
  useSyncNativeIntegration,
  useDeleteNativeIntegration
};
