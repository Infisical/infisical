import {
  useAddAllSecretScanningResources,
  useAddSecretScanningResource,
  useDeleteSecretScanningDataSource,
  useRemoveSecretScanningResource,
  useTriggerSecretScanningDataSource,
  useUpdateMultipleSecretScanningFinding,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2/mutations";
import {
  useGetSecretScanningDataSource,
  useGetSecretScanningInstanceState,
  useGetSecretScanningProjectId,
  useGetSecretScanningUnresolvedFindingCount,
  useListSecretScanningAvailableResources,
  useListSecretScanningBasicDataSources,
  useListSecretScanningBasicResources,
  useListSecretScanningDataSources,
  useListSecretScanningFindings,
  useListSecretScanningResources,
  useListSecretScanningScans
} from "@app/hooks/api/secretScanningV2/queries";

import type { SecretScanningAdapter } from "./contract";

export const secretScanningLive: SecretScanningAdapter = {
  useProjectId: useGetSecretScanningProjectId,
  useInstanceState: (orgId) => useGetSecretScanningInstanceState(orgId),
  useFindings: useListSecretScanningFindings,
  useUnresolvedFindingCount: useGetSecretScanningUnresolvedFindingCount,
  useDataSources: useListSecretScanningBasicDataSources,
  useDashboardDataSources: useListSecretScanningDataSources,
  useDataSource: useGetSecretScanningDataSource,
  useUpdateDataSource: useUpdateSecretScanningDataSource,
  useDeleteDataSource: useDeleteSecretScanningDataSource,
  useTriggerScan: useTriggerSecretScanningDataSource,
  useResources: useListSecretScanningBasicResources,
  useResourcesWithDetails: useListSecretScanningResources,
  useAvailableResources: useListSecretScanningAvailableResources,
  useAddResource: useAddSecretScanningResource,
  useAddAllResources: useAddAllSecretScanningResources,
  useRemoveResource: useRemoveSecretScanningResource,
  useScans: useListSecretScanningScans,
  useUpdateFindings: useUpdateMultipleSecretScanningFinding
};
