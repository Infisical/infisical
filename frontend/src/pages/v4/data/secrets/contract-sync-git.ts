import type {
  TBitbucketEnvironment,
  TBitbucketRepo,
  TBitbucketWorkspace
} from "@app/hooks/api/appConnections/bitbucket/types";
import type { TCircleCIOrganization } from "@app/hooks/api/appConnections/circleci/types";
import type { TGitLabGroup, TGitLabProject } from "@app/hooks/api/appConnections/gitlab/types";
import type { TTeamCityProjectWithBuildTypes } from "@app/hooks/api/appConnections/teamcity/types";
import type {
  TTravisCIBranch,
  TTravisCIRepository
} from "@app/hooks/api/appConnections/travis-ci/types";

import type { V4QueryResult } from "../contract";
import type { ConnectionOptions, QueryOptions } from "./contract-options";

export type GitLabListDTO = { connectionId: string; search?: string; limit?: number };
export type BitbucketWorkspacesDTO = { connectionId: string; search?: string };
export type BitbucketRepositoriesDTO = {
  connectionId: string;
  workspaceSlug: string;
  search?: string;
};
export type BitbucketEnvironmentsDTO = {
  connectionId: string;
  workspaceSlug: string;
  repositorySlug: string;
};
export type TravisCIBranchesDTO = { connectionId: string; repositoryId: string };

export type SyncGitLookups = {
  useGitLabProjects: (
    dto: GitLabListDTO,
    options?: QueryOptions
  ) => V4QueryResult<TGitLabProject[]>;
  useGitLabGroups: (dto: GitLabListDTO, options?: QueryOptions) => V4QueryResult<TGitLabGroup[]>;
  useBitbucketWorkspaces: (
    dto: BitbucketWorkspacesDTO,
    options?: QueryOptions
  ) => V4QueryResult<TBitbucketWorkspace[]>;
  useBitbucketRepositories: (
    dto: BitbucketRepositoriesDTO,
    options?: QueryOptions
  ) => V4QueryResult<TBitbucketRepo[]>;
  useBitbucketEnvironments: (
    dto: BitbucketEnvironmentsDTO,
    options?: QueryOptions
  ) => V4QueryResult<TBitbucketEnvironment[]>;
  useCircleCIOrganizations: ConnectionOptions<TCircleCIOrganization>;
  useTravisCIRepositories: ConnectionOptions<TTravisCIRepository>;
  useTravisCIBranches: (
    dto: TravisCIBranchesDTO,
    options?: QueryOptions
  ) => V4QueryResult<TTravisCIBranch[]>;
  useTeamCityProjects: ConnectionOptions<TTeamCityProjectWithBuildTypes>;
};
