import { useBitbucketConnectionListWorkspaces } from "@app/hooks/api/appConnections/bitbucket/queries";
import { useGitLabConnectionListGroups } from "@app/hooks/api/appConnections/gitlab/queries";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import {
  useCreateSecretScanningDataSource,
  useDeleteSecretScanningDataSource,
  useUpdateMultipleSecretScanningFinding,
  useUpdateSecretScanningConfig,
  useUpdateSecretScanningDataSource
} from "@app/hooks/api/secretScanningV2/mutations";
import {
  useGetSecretScanningConfig,
  useGetSecretScanningInstanceState,
  useGetSecretScanningProjectId,
  useGetSecretScanningUnresolvedFindingCount,
  useListSecretScanningBasicDataSources,
  useListSecretScanningBasicResources,
  useListSecretScanningDataSources,
  useListSecretScanningFindings,
  useSecretScanningDataSourceOptions
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
  useUpdateDataSource: useUpdateSecretScanningDataSource,
  useDeleteDataSource: useDeleteSecretScanningDataSource,
  useResources: useListSecretScanningBasicResources,
  useUpdateFindings: useUpdateMultipleSecretScanningFinding
};
