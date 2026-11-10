import { useLoadProjectKmsBackup, useUpdateProjectKms } from "@app/hooks/api/kms/mutations";
import {
  fetchProjectKmsBackup,
  useGetActiveProjectKms,
  useGetExternalKmsList
} from "@app/hooks/api/kms/queries";
import { useGetWorkspaceWorkflowIntegrationConfig } from "@app/hooks/api/projects/queries";
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

import type { ProjectIntegrationsAdapter } from "./contract";

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
  useMicrosoftTeamsTeams: useGetMicrosoftTeamsIntegrationTeams
};
