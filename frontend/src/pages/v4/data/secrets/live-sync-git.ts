import {
  useBitbucketConnectionListEnvironments,
  useBitbucketConnectionListRepositories,
  useBitbucketConnectionListWorkspaces
} from "@app/hooks/api/appConnections/bitbucket";
import { useCircleCIConnectionListOrganizations } from "@app/hooks/api/appConnections/circleci";
import {
  useGitLabConnectionListGroups,
  useGitLabConnectionListProjects
} from "@app/hooks/api/appConnections/gitlab";
import { useTeamCityConnectionListProjects } from "@app/hooks/api/appConnections/teamcity";
import {
  useTravisCIConnectionListBranches,
  useTravisCIConnectionListRepositories
} from "@app/hooks/api/appConnections/travis-ci";

import type { SyncGitLookups } from "./contract-sync-git";

export const syncGitLive: SyncGitLookups = {
  useGitLabProjects: ({ connectionId, search, limit }, options) =>
    useGitLabConnectionListProjects(connectionId, search, limit, options),
  useGitLabGroups: ({ connectionId, search, limit }, options) =>
    useGitLabConnectionListGroups(connectionId, search, limit, options),
  useBitbucketWorkspaces: ({ connectionId, search }, options) =>
    useBitbucketConnectionListWorkspaces(connectionId, search, options),
  useBitbucketRepositories: ({ connectionId, workspaceSlug, search }, options) =>
    useBitbucketConnectionListRepositories(connectionId, workspaceSlug, search, options),
  useBitbucketEnvironments: ({ connectionId, workspaceSlug, repositorySlug }, options) =>
    useBitbucketConnectionListEnvironments(connectionId, workspaceSlug, repositorySlug, options),
  useCircleCIOrganizations: (connectionId, options) =>
    useCircleCIConnectionListOrganizations(connectionId, options),
  useTravisCIRepositories: (connectionId, options) =>
    useTravisCIConnectionListRepositories(connectionId, options),
  useTravisCIBranches: ({ connectionId, repositoryId }, options) =>
    useTravisCIConnectionListBranches(connectionId, repositoryId, options),
  useTeamCityProjects: (connectionId, options) =>
    useTeamCityConnectionListProjects(connectionId, options)
};
