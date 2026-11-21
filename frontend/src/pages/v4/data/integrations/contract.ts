import type {
  TAppConnection,
  TCreateAppConnectionDTO,
  TDeleteAppConnectionDTO,
  TRotateAppConnectionCredentialsDTO,
  TUpdateAppConnectionDTO
} from "@app/hooks/api/appConnections/types";
import type { TAppConnectionOption } from "@app/hooks/api/appConnections/types/app-options";
import type { TGatewayV2 } from "@app/hooks/api/gateways-v2/types";
import type { TGitHubApp } from "@app/hooks/api/gitHubApps/types";
import type { ExternalMigrationProviders } from "@app/hooks/api/migration/types";
import type { ProjectType } from "@app/hooks/api/projects/types";
import type {
  fetchSlackInstallUrl,
  fetchSlackReinstallUrl
} from "@app/hooks/api/workflowIntegrations/queries";
import type {
  MicrosoftTeamsIntegration,
  SlackIntegration,
  TCheckMicrosoftTeamsIntegrationInstallationStatusDTO,
  TCreateMicrosoftTeamsIntegrationDTO,
  TDeleteMicrosoftTeamsIntegrationDTO,
  TDeleteSlackIntegrationDTO,
  TUpdateMicrosoftTeamsIntegrationDTO,
  TUpdateSlackIntegrationDTO,
  WorkflowIntegration
} from "@app/hooks/api/workflowIntegrations/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type TImportEnvKeyDTO = { file: File; decryptionKey: string };

export type TImportVaultDTO = {
  vaultAccessToken: string;
  vaultNamespace?: string;
  vaultUrl: string;
  mappingType: string;
  gatewayId?: string;
};

export type IntegrationsAdapter = {
  useConnections: (projectId?: string) => V4QueryResult<TAppConnection[]>;
  useConnectionOptions: (projectType?: ProjectType) => V4QueryResult<TAppConnectionOption[]>;
  useCreateConnection: V4Mutation<TCreateAppConnectionDTO, TAppConnection>;
  useUpdateConnection: V4Mutation<TUpdateAppConnectionDTO, TAppConnection>;
  useRotateCredentials: V4Mutation<TRotateAppConnectionCredentialsDTO, TAppConnection>;
  useDeleteConnection: V4Mutation<TDeleteAppConnectionDTO, TAppConnection>;
  useGitHubApps: (orgId?: string, projectId?: string | null) => V4QueryResult<TGitHubApp[]>;
  useWorkflowIntegrations: (orgId?: string) => V4QueryResult<WorkflowIntegration[]>;
  useSlackIntegration: (id?: string) => V4QueryResult<SlackIntegration>;
  useMicrosoftTeamsIntegration: (id?: string) => V4QueryResult<MicrosoftTeamsIntegration>;
  useMicrosoftTeamsClientId: () => V4QueryResult<{ clientId: string }>;
  fetchSlackInstallUrl: typeof fetchSlackInstallUrl;
  fetchSlackReinstallUrl: typeof fetchSlackReinstallUrl;
  useUpdateSlackIntegration: V4Mutation<TUpdateSlackIntegrationDTO>;
  useUpdateMicrosoftTeamsIntegration: V4Mutation<TUpdateMicrosoftTeamsIntegrationDTO>;
  useCreateMicrosoftTeamsIntegration: V4Mutation<TCreateMicrosoftTeamsIntegrationDTO>;
  useDeleteSlackIntegration: V4Mutation<TDeleteSlackIntegrationDTO>;
  useDeleteMicrosoftTeamsIntegration: V4Mutation<TDeleteMicrosoftTeamsIntegrationDTO>;
  useCheckMicrosoftTeamsInstallation: V4Mutation<TCheckMicrosoftTeamsIntegrationInstallationStatusDTO>;
  useIsOrgAdmin: (orgId: string) => V4QueryResult<boolean>;
  useMigrationGateways: () => V4QueryResult<TGatewayV2[]>;
  useCustomMigrationAvailable: (
    provider: ExternalMigrationProviders
  ) => V4QueryResult<{ data: { enabled: boolean } }>;
  useImportEnvKey: V4Mutation<TImportEnvKeyDTO>;
  useImportVault: V4Mutation<TImportVaultDTO>;
};
