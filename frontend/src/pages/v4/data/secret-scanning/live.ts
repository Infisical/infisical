import { resolveSecretScanningProjectId } from "@app/helpers/secretScanningActiveProject";
import { useBitbucketConnectionListWorkspaces } from "@app/hooks/api/appConnections/bitbucket/queries";
import { useGitLabConnectionListGroups } from "@app/hooks/api/appConnections/gitlab/queries";
import { useListAvailableAppConnections } from "@app/hooks/api/appConnections/queries";
import { useGetUserProjects } from "@app/hooks/api/projects/queries";
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

// Matches main's Secret Scanning layout: the instance the user last opened (the cookie), while they
// are still a member of it, otherwise the org's active project.
const useResolvedProjectId: SecretScanningAdapter["useProjectId"] = (orgId) => {
  const active = useGetSecretScanningProjectId(orgId);
  const memberProjects = useGetUserProjects();
  const isPending = active.isPending || (memberProjects.isPending && !memberProjects.error);
  if (!active.data || isPending) return { data: undefined, isPending, error: active.error };
  return {
    data:
      resolveSecretScanningProjectId({
        orgId,
        activeProjectId: active.data,
        memberProjectIds: (memberProjects.data ?? []).map((project) => project.id)
      }) ?? active.data,
    isPending: false,
    error: null
  };
};

export const secretScanningLive: SecretScanningAdapter = {
  useProjectId: useResolvedProjectId,
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
