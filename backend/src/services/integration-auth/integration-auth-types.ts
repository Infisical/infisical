import { TIntegrations } from "@app/db/schemas";
import { TActorInput } from "@app/lib/types";

export type TGetIntegrationAuthDTO = {
  id: string;
} & TActorInput;

export type TOauthExchangeDTO = {
  integration: string;
  code: string;
  url?: string;
  installationId?: string;
  projectId: string;
} & TActorInput;

export type TSaveIntegrationAccessTokenDTO = {
  integration: string;
  accessId?: string;
  accessToken?: string;
  url?: string;
  namespace?: string;
  refreshToken?: string;
  awsAssumeIamRoleArn?: string;
  projectId: string;
} & TActorInput;

export type TUpdateIntegrationAuthDTO = Omit<TSaveIntegrationAccessTokenDTO, "projectId" | "integration"> & {
  integrationAuthId: string;
  integration?: string;
};

export type TDeleteIntegrationAuthsDTO = { projectId: string } & TActorInput & {
    integration: string;
    projectId: string;
  };

export type TIntegrationAuthAppsDTO = {
  id: string;
  teamId?: string;
  azureDevOpsOrgName?: string;
  workspaceSlug?: string;
} & TActorInput;

export type TIntegrationAuthTeamsDTO = {
  id: string;
} & TActorInput;

export type TIntegrationAuthVercelBranchesDTO = {
  id: string;
  appId: string;
} & TActorInput;

export type TIntegrationAuthChecklyGroupsDTO = {
  id: string;
  accountId: string;
} & TActorInput;

export type TIntegrationAuthGithubOrgsDTO = {
  id: string;
} & TActorInput;

export type TIntegrationAuthGithubEnvsDTO = {
  id: string;
  repoName: string;
  repoOwner: string;
} & TActorInput;

export type TIntegrationAuthQoveryOrgsDTO = {
  id: string;
} & TActorInput;

export type TIntegrationAuthQoveryProjectDTO = {
  id: string;
  orgId: string;
} & TActorInput;

export type TIntegrationAuthAwsKmsKeyDTO = {
  id: string;
  region: string;
} & TActorInput;

export type TIntegrationAuthQoveryEnvironmentsDTO = {
  id: string;
  projectId: string;
} & TActorInput;

export type TIntegrationAuthQoveryScopesDTO = {
  id: string;
  environmentId: string;
} & TActorInput;

export type TIntegrationAuthHerokuPipelinesDTO = {
  id: string;
} & TActorInput;

export type TIntegrationAuthRailwayEnvDTO = {
  id: string;
  appId: string;
} & TActorInput;

export type TIntegrationAuthRailwayServicesDTO = {
  id: string;
  appId: string;
} & TActorInput;

export type TIntegrationAuthBitbucketWorkspaceDTO = {
  id: string;
} & TActorInput;

export type TIntegrationAuthBitbucketEnvironmentsDTO = {
  workspaceSlug: string;
  repoSlug: string;
  id: string;
} & TActorInput;

export type TIntegrationAuthNorthflankSecretGroupDTO = {
  id: string;
  appId: string;
} & TActorInput;

export type TDeleteIntegrationAuthByIdDTO = {
  id: string;
} & TActorInput;

export type TDuplicateGithubIntegrationAuthDTO = {
  id: string;
  projectId: string;
} & TActorInput;

export type TGetIntegrationAuthTeamCityBuildConfigDTO = {
  id: string;
  appId: string;
} & TActorInput;

export type TIntegrationAuthCircleCIOrganizationDTO = {
  id: string;
} & TActorInput;

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

export type TBitbucketEnvironment = {
  type: string;
  uuid: string;
  name: string;
  slug: string;
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

export type TCircleCIOrganization = {
  id: string;
  vcsType: string;
  name: string;
  avatarUrl: string;
  slug: string;
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

export type TIntegrationAuthOctopusDeploySpacesDTO = {
  id: string;
} & TActorInput;

export type TIntegrationAuthOctopusDeployProjectScopeValuesDTO = {
  id: string;
  spaceId: string;
  resourceId: string;
  scope: OctopusDeployScope;
} & TActorInput;

export enum OctopusDeployScope {
  Project = "project"
  // add tenant, variable set, etc.
}

export enum CircleCiScope {
  Project = "project",
  Context = "context"
}

export type TOctopusDeployVariableSet = {
  Id: string;
  OwnerId: string;
  Version: number;
  Variables: {
    Id: string;
    Name: string;
    Value: string;
    Description: string;
    Scope: {
      Environment?: string[];
      Machine?: string[];
      Role?: string[];
      TargetRole?: string[];
      Action?: string[];
      User?: string[];
      Trigger?: string[];
      ParentDeployment?: string[];
      Private?: string[];
      Channel?: string[];
      TenantTag?: string[];
      Tenant?: string[];
      ProcessOwner?: string[];
    };
    IsEditable: boolean;
    Prompt: {
      Description: string;
      DisplaySettings: Record<string, string>;
      Label: string;
      Required: boolean;
    } | null;
    Type: "String";
    IsSensitive: boolean;
  }[];
  ScopeValues: {
    Environments: { Id: string; Name: string }[];
    Machines: { Id: string; Name: string }[];
    Actions: { Id: string; Name: string }[];
    Roles: { Id: string; Name: string }[];
    Channels: { Id: string; Name: string }[];
    TenantTags: { Id: string; Name: string }[];
    Processes: {
      ProcessType: string;
      Id: string;
      Name: string;
    }[];
  };
  SpaceId: string;
  Links: {
    Self: string;
  };
};

export type GetVercelCustomEnvironmentsDTO = {
  teamId: string;
  id: string;
} & TActorInput;
