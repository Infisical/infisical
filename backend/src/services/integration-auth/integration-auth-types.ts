import { TIntegrations } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

export type TGetIntegrationAuthDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TOauthExchangeDTO = {
  integration: string;
  code: string;
  url?: string;
} & TProjectPermission;

export type TSaveIntegrationAccessTokenDTO = {
  integration: string;
  accessId?: string;
  accessToken?: string;
  url?: string;
  namespace?: string;
  refreshToken?: string;
  awsAssumeIamRoleArn?: string;
} & TProjectPermission;

export type TDeleteIntegrationAuthsDTO = TProjectPermission & {
  integration: string;
  projectId: string;
};

export type TIntegrationAuthAppsDTO = {
  id: string;
  teamId?: string;
  azureDevOpsOrgName?: string;
  workspaceSlug?: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthTeamsDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthVercelBranchesDTO = {
  id: string;
  appId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthChecklyGroupsDTO = {
  id: string;
  accountId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthGithubOrgsDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthGithubEnvsDTO = {
  id: string;
  repoName: string;
  repoOwner: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthQoveryOrgsDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthQoveryProjectDTO = {
  id: string;
  orgId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthAwsKmsKeyDTO = {
  id: string;
  region: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthQoveryEnvironmentsDTO = {
  id: string;
} & TProjectPermission;

export type TIntegrationAuthQoveryScopesDTO = {
  id: string;
  environmentId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthHerokuPipelinesDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthRailwayEnvDTO = {
  id: string;
  appId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthRailwayServicesDTO = {
  id: string;
  appId: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthBitbucketWorkspaceDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TIntegrationAuthNorthflankSecretGroupDTO = {
  id: string;
  appId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteIntegrationAuthByIdDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetIntegrationAuthTeamCityBuildConfigDTO = {
  id: string;
  appId: string;
} & Omit<TProjectPermission, "projectId">;

export type TVercelBranches = {
  ref: string;
  lastCommit: string;
  isProtected: boolean;
};

export type TChecklyGroups = {
  id: number;
  name: string;
};

export type TQoveryProjects = {
  id: string;
  name: string;
};

export type TQoveryEnvironments = {
  id: string;
  name: string;
};

export type TBitbucketWorkspace = {
  type: string;
  uuid: string;
  name: string;
  slug: string;
  is_private: boolean;
  created_on: string;
  updated_on: string;
};

export type TNorthflankSecretGroup = {
  id: string;
  name: string;
  description: string;
  priority: number;
  projectId: string;
};

export type THerokuPipelineCoupling = {
  app: { id: string };
  stage: string;
  pipeline: { id: string; name: string };
};

export type TTeamCityBuildConfig = {
  id: string;
  name: string;
  projectName: string;
  projectId: string;
  href: string;
  webUrl: string;
};

export type TIntegrationsWithEnvironment = TIntegrations & {
  environment?:
    | {
        id?: string | null | undefined;
        name?: string | null | undefined;
      }
    | null
    | undefined;
};
