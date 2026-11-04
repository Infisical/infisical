import type {
  TGetSecretScanningDataSource,
  TListSecretScanningFindingsDTO,
  TListSecretScanningFindingsResponse,
  TSecretScanningDataSource,
  TSecretScanningFinding,
  TSecretScanningResource,
  TUpdateSecretScanningFinding
} from "@app/hooks/api/secretScanningV2/types";

import type { V4Mutation, V4QueryResult } from "../contract";

export type SecretScanningAdapter = {
  useProjectId: (orgId: string) => V4QueryResult<string>;
  useFindings: (
    dto: TListSecretScanningFindingsDTO
  ) => V4QueryResult<TListSecretScanningFindingsResponse> & { isPlaceholderData: boolean };
  useUnresolvedFindingCount: (projectId: string) => V4QueryResult<number>;
  useDataSources: (projectId: string) => V4QueryResult<TSecretScanningDataSource[]>;
  useResources: (dto: TGetSecretScanningDataSource) => V4QueryResult<TSecretScanningResource[]>;
  useUpdateFindings: V4Mutation<TUpdateSecretScanningFinding[], TSecretScanningFinding>;
};
