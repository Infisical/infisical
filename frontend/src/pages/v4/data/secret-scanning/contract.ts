import type { TBitbucketWorkspace } from "@app/hooks/api/appConnections/bitbucket/types";
import type { AppConnection } from "@app/hooks/api/appConnections/enums";
import type { TGitLabGroup } from "@app/hooks/api/appConnections/gitlab/types";
import type { TAvailableAppConnection } from "@app/hooks/api/appConnections/types";
import type { TSecretScanningInstanceState } from "@app/hooks/api/secretScanningV2/queries";
import type {
  TCreateSecretScanningDataSourceDTO,
  TDeleteSecretScanningDataSourceDTO,
  TGetSecretScanningDataSource,
  TListSecretScanningFindingsDTO,
  TListSecretScanningFindingsResponse,
  TSecretScanningConfig,
  TSecretScanningDataSource,
  TSecretScanningDataSourceOption,
  TSecretScanningDataSourceWithDetails,
  TSecretScanningFinding,
  TSecretScanningResource,
  TUpdateSecretScanningDataSourceDTO,
  TUpdateSecretScanningFinding
} from "@app/hooks/api/secretScanningV2/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SecretScanningAdapter = {
  useProjectId: (orgId: string) => V4QueryResult<string>;
  useInstanceState: (orgId: string) => V4QueryResult<TSecretScanningInstanceState>;
  useFindings: (
    dto: TListSecretScanningFindingsDTO
  ) => V4QueryResult<TListSecretScanningFindingsResponse> & { isPlaceholderData: boolean };
  useUnresolvedFindingCount: (projectId: string) => V4QueryResult<number>;
  useDataSources: (projectId: string) => V4QueryResult<TSecretScanningDataSource[]>;
  useDashboardDataSources: (
    projectId: string,
    options?: { refetchInterval?: number }
  ) => V4QueryResult<TSecretScanningDataSourceWithDetails[]>;
  useDataSourceOptions: () => V4QueryResult<TSecretScanningDataSourceOption[]>;
  useAvailableConnections: (
    app: AppConnection,
    projectId: string
  ) => V4QueryResult<TAvailableAppConnection[]>;
  useBitbucketWorkspaces: (
    connectionId: string,
    search?: string
  ) => V4QueryResult<TBitbucketWorkspace[]>;
  useGitLabGroups: (connectionId: string, search?: string) => V4QueryResult<TGitLabGroup[]>;
  useCreateDataSource: V4Mutation<TCreateSecretScanningDataSourceDTO, TSecretScanningDataSource>;
  useConfig: (projectId: string) => V4QueryResult<TSecretScanningConfig>;
  useUpdateConfig: V4Mutation<TSecretScanningConfig, TSecretScanningConfig>;
  useUpdateDataSource: V4Mutation<TUpdateSecretScanningDataSourceDTO, TSecretScanningDataSource>;
  useDeleteDataSource: V4Mutation<TDeleteSecretScanningDataSourceDTO, TSecretScanningDataSource>;
  useResources: (dto: TGetSecretScanningDataSource) => V4QueryResult<TSecretScanningResource[]>;
  useUpdateFindings: V4Mutation<TUpdateSecretScanningFinding[], TSecretScanningFinding>;
};
