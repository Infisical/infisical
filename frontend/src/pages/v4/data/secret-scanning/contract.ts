import type { TSecretScanningInstanceState } from "@app/hooks/api/secretScanningV2/queries";
import type {
  TAddAllSecretScanningResourcesDTO,
  TAddSecretScanningResourceDTO,
  TDeleteSecretScanningDataSourceDTO,
  TGetSecretScanningDataSource,
  TListSecretScanningFindingsDTO,
  TListSecretScanningFindingsResponse,
  TListSecretScanningResourcesDTO,
  TListSecretScanningResourcesResponse,
  TRemoveSecretScanningResourceDTO,
  TSecretScanningAvailableResource,
  TSecretScanningDataSource,
  TSecretScanningDataSourceWithDetails,
  TSecretScanningFinding,
  TSecretScanningResource,
  TSecretScanningScanWithDetails,
  TTriggerSecretScanningDataSourceDTO,
  TUpdateSecretScanningDataSourceDTO,
  TUpdateSecretScanningFinding
} from "@app/hooks/api/secretScanningV2/types";

import type { V4Mutation, V4QueryResult } from "../contract";

type PollOptions = { enabled?: boolean; refetchInterval?: number };
type AddedResource = { id: string; name: string };

export type SecretScanningAdapter = {
  useProjectId: (orgId: string) => V4QueryResult<string>;
  useInstanceState: (orgId: string) => V4QueryResult<TSecretScanningInstanceState>;
  useFindings: (
    dto: TListSecretScanningFindingsDTO,
    options?: PollOptions
  ) => V4QueryResult<TListSecretScanningFindingsResponse> & { isPlaceholderData: boolean };
  useUnresolvedFindingCount: (projectId: string) => V4QueryResult<number>;
  useDataSources: (projectId: string) => V4QueryResult<TSecretScanningDataSource[]>;
  useDashboardDataSources: (
    projectId: string,
    options?: { refetchInterval?: number }
  ) => V4QueryResult<TSecretScanningDataSourceWithDetails[]>;
  useDataSource: (dto: TGetSecretScanningDataSource) => V4QueryResult<TSecretScanningDataSource>;
  useUpdateDataSource: V4Mutation<TUpdateSecretScanningDataSourceDTO, TSecretScanningDataSource>;
  useDeleteDataSource: V4Mutation<TDeleteSecretScanningDataSourceDTO, TSecretScanningDataSource>;
  useTriggerScan: V4Mutation<TTriggerSecretScanningDataSourceDTO, TSecretScanningDataSource>;
  useResources: (
    dto: TGetSecretScanningDataSource,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TSecretScanningResource[]>;
  useResourcesWithDetails: (
    dto: TListSecretScanningResourcesDTO,
    options?: PollOptions
  ) => V4QueryResult<TListSecretScanningResourcesResponse>;
  useAvailableResources: (
    dto: TGetSecretScanningDataSource,
    options?: { enabled?: boolean }
  ) => V4QueryResult<TSecretScanningAvailableResource[]> & { refetch: () => unknown };
  useAddResource: V4Mutation<TAddSecretScanningResourceDTO, AddedResource[]>;
  useAddAllResources: V4Mutation<TAddAllSecretScanningResourcesDTO, AddedResource[]>;
  useRemoveResource: V4Mutation<TRemoveSecretScanningResourceDTO, AddedResource>;
  useScans: (
    dto: TGetSecretScanningDataSource,
    options?: PollOptions
  ) => V4QueryResult<TSecretScanningScanWithDetails[]>;
  useUpdateFindings: V4Mutation<TUpdateSecretScanningFinding[], TSecretScanningFinding>;
};
