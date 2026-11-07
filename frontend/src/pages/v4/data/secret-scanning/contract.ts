import type { TSecretScanningInstanceState } from "@app/hooks/api/secretScanningV2/queries";
import type {
  TDeleteSecretScanningDataSourceDTO,
  TGetSecretScanningDataSource,
  TListSecretScanningFindingsDTO,
  TListSecretScanningFindingsResponse,
  TSecretScanningDataSource,
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
  useUpdateDataSource: V4Mutation<TUpdateSecretScanningDataSourceDTO, TSecretScanningDataSource>;
  useDeleteDataSource: V4Mutation<TDeleteSecretScanningDataSourceDTO, TSecretScanningDataSource>;
  useResources: (dto: TGetSecretScanningDataSource) => V4QueryResult<TSecretScanningResource[]>;
  useUpdateFindings: V4Mutation<TUpdateSecretScanningFinding[], TSecretScanningFinding>;
};
