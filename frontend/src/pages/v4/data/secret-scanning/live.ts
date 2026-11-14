import { useBitbucketConnectionListWorkspaces } from "@app/hooks/api/appConnections/bitbucket/queries";
import { useGitLabConnectionListGroups } from "@app/hooks/api/appConnections/gitlab/queries";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useCreateSecretScanningDataSource,
  useAddAllSecretScanningResources,
  useAddSecretScanningResource,
  useDeleteSecretScanningDataSource,
  useRemoveSecretScanningResource,
  useTriggerSecretScanningDataSource,
  useUpdateMultipleSecretScanningFinding,
  useUpdateSecretScanningConfig,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2/mutations";
import {
  useGetSecretScanningConfig,
  useGetSecretScanningDataSource,
  useGetSecretScanningInstanceState,
  useGetSecretScanningProjectId,
  useGetSecretScanningUnresolvedFindingCount,
  useListSecretScanningAvailableResources,
  useListSecretScanningBasicDataSources,
  useListSecretScanningBasicResources,
  useListSecretScanningDataSources,
  useListSecretScanningFindings,
  useSecretScanningDataSourceOptions,
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
  useDataSourceOptions: () => useSecretScanningDataSourceOptions(),
  useAvailableConnections: (app, projectId) => useListAvailableAppConnections(app, projectId),
  useBitbucketWorkspaces: (connectionId, search) =>
    useBitbucketConnectionListWorkspaces(connectionId, search, { enabled: Boolean(connectionId) }),
  useGitLabGroups: (connectionId, search) =>
    useGitLabConnectionListGroups(connectionId, search, 20, { enabled: Boolean(connectionId) }),
  useCreateDataSource: useCreateSecretScanningDataSource,
  useConfig: (projectId) => useGetSecretScanningConfig(projectId),
  useUpdateConfig: useUpdateSecretScanningConfig,
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
