import type {
  DashboardProjectSecretsOverview,
  DashboardSecretValue,
  TGetDashboardProjectSecretsOverviewDTO,
  TGetSecretKeyExistsDTO,
  TGetSecretValueDTO
} from "@app/hooks/api/dashboard/types";
import type { CreateEnvironmentDTO, Project, ProjectEnv } from "@app/hooks/api/projects/types";
import type {
  TCreateFolderDTO,
  TDeleteFolderDTO,
  TUpdateFolderDTO
} from "@app/hooks/api/secretFolders/types";
import type {
  TCreateSecretsV3DTO,
  TDeleteSecretBatchDTO,
  TDeleteSecretsV3DTO,
  TGetExpandedSecretValueDTO,
  TGetSecretReferencesDTO,
  TGetSecretReferenceTreeDTO,
  TSecretDependencyTreeNode,
  TSecretReferenceTraceNode,
  TUpdateSecretsV3DTO
} from "@app/hooks/api/secrets/types";
import type { CreateTagDTO, UserWsTags, WsTag } from "@app/hooks/api/tags/types";

import type { V4Mutation, V4QueryResult } from "../contract";
import type { SecretsAccessInsightsAdapter } from "./contract-access-insights";
import type { SecretsActivationAdapter } from "./contract-activation";
import type { SecretsChangeRequestsAdapter } from "./contract-change-requests";
import type { SecretsExternalImportAdapter } from "./contract-external-import";
import type { SecretsFlowsAdapter } from "./contract-flows";
import type { SecretsPlanAdapter } from "./contract-plan";
import type { SecretsQuickSearchAdapter } from "./contract-quick-search";
import type { SecretsReminderChannelsAdapter } from "./contract-reminder-channels";
import type { SecretsUpgradeAdapter } from "./contract-upgrade";

export type ImportedSecretGroup = {
  importId?: string;
  environment: string;
  secretPath: string;
  secrets: {
    id: string;
    key: string;
    isEmpty?: boolean;
    secretValueHidden: boolean;
    version: number;
  }[];
};

export type ScopeState = "loading" | "loaded" | "failed";

export type ImportedSecretsAt = { status: ScopeState; groups: ImportedSecretGroup[] };

export type SecretsAdapter = SecretsFlowsAdapter &
  SecretsChangeRequestsAdapter &
  SecretsUpgradeAdapter &
  SecretsAccessInsightsAdapter &
  SecretsReminderChannelsAdapter &
  SecretsQuickSearchAdapter &
  SecretsExternalImportAdapter &
  SecretsPlanAdapter &
  SecretsActivationAdapter & {
    useProject: (projectId: string) => V4QueryResult<Project> & { refetch?: () => unknown };
    useCreateEnvironment: V4Mutation<CreateEnvironmentDTO, ProjectEnv>;
    useTags: (projectId: string) => V4QueryResult<UserWsTags>;
    useCreateTag: V4Mutation<CreateTagDTO, WsTag>;
    useOverview: (
      dto: TGetDashboardProjectSecretsOverviewDTO,
      options?: {
        enabled?: boolean;
        refetchInterval?: (query: {
          state: { data?: { imports?: { isReplicationRunning?: boolean }[] } };
        }) => number | false;
      }
    ) => V4QueryResult<DashboardProjectSecretsOverview> & { refetch: () => unknown };
    useSecretValue: (
      dto: TGetSecretValueDTO,
      options?: { enabled?: boolean }
    ) => V4QueryResult<DashboardSecretValue> & { isFetching?: boolean };
    useImportedSecrets: (dto: {
      projectId: string;
      environments: string[];
      path: string;
    }) => Record<string, ImportedSecretsAt>;
    useSecretKeyCheck: () => (dto: TGetSecretKeyExistsDTO) => Promise<string[]>;
    useSecretReferenceTree: (
      dto: TGetSecretReferenceTreeDTO
    ) => V4QueryResult<{ tree: TSecretReferenceTraceNode; value: string }>;
    useSecretReferences: (
      dto: TGetSecretReferencesDTO
    ) => V4QueryResult<{ tree: TSecretDependencyTreeNode }>;
    useExpandedSecretValue: (
      dto: TGetExpandedSecretValueDTO
    ) => V4QueryResult<{ secretValue: string; secretValueHidden: boolean }>;
    useCreateSecret: V4Mutation<TCreateSecretsV3DTO>;
    useUpdateSecret: V4Mutation<TUpdateSecretsV3DTO>;
    useDeleteSecret: V4Mutation<TDeleteSecretsV3DTO>;
    useDeleteSecretBatch: V4Mutation<TDeleteSecretBatchDTO>;
    useCreateFolder: V4Mutation<TCreateFolderDTO>;
    useUpdateFolder: V4Mutation<TUpdateFolderDTO>;
    useDeleteFolder: V4Mutation<TDeleteFolderDTO>;
  };
