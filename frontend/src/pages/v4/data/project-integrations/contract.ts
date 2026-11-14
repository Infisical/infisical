import type {
  TGetIntegrationAuthOctopusDeployScopeValuesDTO,
  TOctopusDeployVariableSetScopeValues
} from "@app/hooks/api/integrationAuth/types";
import type {
  TCloudIntegration,
  TIntegration,
  TIntegrationWithEnv
} from "@app/hooks/api/integrations/types";
import type { useGetActiveProjectKms } from "@app/hooks/api/kms/queries";
import type { KmsListEntry, KmsType } from "@app/hooks/api/kms/types";
import type {
  TCreateWebhookDto,
  TDeleteWebhookDto,
  TTestWebhookDTO,
  TUpdateWebhookDto,
  TWebhook
} from "@app/hooks/api/webhooks/types";
import type {
  MicrosoftTeamsIntegration,
  MicrosoftTeamsIntegrationTeam,
  ProjectWorkflowIntegrationConfig,
  SlackIntegrationChannel,
  TDeleteProjectWorkflowIntegrationDTO,
  TUpdateProjectWorkflowIntegrationConfigDTO,
  WorkflowIntegration,
  WorkflowIntegrationPlatform
} from "@app/hooks/api/workflowIntegrations/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type ActiveProjectKms = NonNullable<ReturnType<typeof useGetActiveProjectKms>["data"]>;

export type ProjectKmsUpdate =
  | { type: KmsType.Internal }
  | { type: KmsType.External; kmsId: string };

export type TSyncNativeIntegrationDTO = { id: string; projectId: string };

export type TDeleteNativeIntegrationDTO = {
  id: string;
  projectId: string;
  shouldDeleteIntegrationSecrets: boolean;
};

type ProjectMutation<TVariables> = (projectId: string) => ReturnType<V4Mutation<TVariables>>;

export type ProjectIntegrationsAdapter = {
  useExternalKmsList: (orgId: string) => V4QueryResult<KmsListEntry[]>;
  useActiveProjectKms: (projectId: string) => V4QueryResult<ActiveProjectKms>;
  useUpdateProjectKms: ProjectMutation<ProjectKmsUpdate>;
  useLoadProjectKmsBackup: ProjectMutation<string>;
  fetchProjectKmsBackup: (projectId: string) => Promise<{ secretManager: string }>;
  useWebhooks: (projectId: string) => V4QueryResult<TWebhook[]>;
  useCreateWebhook: V4Mutation<TCreateWebhookDto>;
  useUpdateWebhook: V4Mutation<TUpdateWebhookDto>;
  useDeleteWebhook: V4Mutation<TDeleteWebhookDto>;
  useTestWebhook: V4Mutation<TTestWebhookDTO>;
  useWorkflowIntegrationConfig: (args: {
    projectId: string;
    integration: WorkflowIntegrationPlatform;
  }) => V4QueryResult<ProjectWorkflowIntegrationConfig | null>;
  useUpdateWorkflowIntegrationConfig: V4Mutation<TUpdateProjectWorkflowIntegrationConfigDTO>;
  useDeleteWorkflowIntegration: V4Mutation<TDeleteProjectWorkflowIntegrationDTO>;
  useWorkflowIntegrations: (orgId?: string) => V4QueryResult<WorkflowIntegration[]>;
  useMicrosoftTeamsIntegrations: (orgId?: string) => V4QueryResult<MicrosoftTeamsIntegration[]>;
  useSlackChannels: (integrationId?: string) => V4QueryResult<SlackIntegrationChannel[]>;
  useMicrosoftTeamsTeams: (
    integrationId?: string
  ) => V4QueryResult<MicrosoftTeamsIntegrationTeam[]>;
  useNativeIntegrations: (projectId: string) => V4QueryResult<TIntegration[]>;
  useNativeIntegration: (integrationId: string) => V4QueryResult<TIntegrationWithEnv>;
  useNativeIntegrationOptions: () => V4QueryResult<TCloudIntegration[]>;
  useOctopusDeployScopeValues: (
    params: TGetIntegrationAuthOctopusDeployScopeValuesDTO,
    options: { enabled: boolean }
  ) => V4QueryResult<Partial<TOctopusDeployVariableSetScopeValues>>;
  useSyncNativeIntegration: V4Mutation<TSyncNativeIntegrationDTO>;
  useDeleteNativeIntegration: V4Mutation<TDeleteNativeIntegrationDTO>;
};
