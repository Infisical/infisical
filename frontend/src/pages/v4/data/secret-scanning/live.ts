import {
  useDeleteSecretScanningDataSource,
  useUpdateMultipleSecretScanningFinding,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2/mutations";
import {
  useGetSecretScanningInstanceState,
  useGetSecretScanningProjectId,
  useGetSecretScanningUnresolvedFindingCount,
  useListSecretScanningBasicDataSources,
  useListSecretScanningBasicResources,
  useListSecretScanningDataSources,
  useListSecretScanningFindings
} from "@app/hooks/api/secretScanningV2/queries";

import type { SecretScanningAdapter } from "./contract";

export const secretScanningLive: SecretScanningAdapter = {
  useProjectId: useGetSecretScanningProjectId,
  useInstanceState: (orgId) => useGetSecretScanningInstanceState(orgId),
  useFindings: useListSecretScanningFindings,
  useUnresolvedFindingCount: useGetSecretScanningUnresolvedFindingCount,
  useDataSources: useListSecretScanningBasicDataSources,
  useDashboardDataSources: useListSecretScanningDataSources,
  useUpdateDataSource: useUpdateSecretScanningDataSource,
  useDeleteDataSource: useDeleteSecretScanningDataSource,
  useResources: useListSecretScanningBasicResources,
  useUpdateFindings: useUpdateMultipleSecretScanningFinding
};
