export type IntegrationAuth = {
  id: string;
  integration: string;
  projectId: string;
  __v: number;
  createdAt: string;
  updatedAt: string;
  algorithm: string;
  keyEncoding: string;
  url?: string;
  teamId?: string;
  metadata: {
    installationName?: string;
    installationId?: string;
  };
};

export type App = {
  name: string;
  appId?: string;
  owner?: string;
  secretGroups?: string[];
};

export type Pipeline = {
  pipelineId: string;
  name: string;
};

export type HerokuPipelineCoupling = {
  app: { appId: string };
  stage: string;
  pipeline: { pipelineId: string; name: string };
};

export type Team = {
  name: string;
  id: string;
};

export type Environment = {
  name: string;
  environmentId: string;
};

export type VercelEnvironment = {
  id: string;
  slug: string;
};

export type ChecklyGroup = {
  name: string;
  groupId: number;
};

export type Container = {
  name: string;
  containerId: string;
};

export type Org = {
  name: string;
  orgId: string;
};

export type Project = {
  name: string;
  projectId: string;
};

export type KmsKey = {
  id: string;
  alias: string;
};

export type Service = {
  name: string;
  serviceId: string;
};

export type BitbucketWorkspace = {
  uuid: string;
  name: string;
  slug: string;
};

export type BitbucketEnvironment = {
  uuid: string;
  name: string;
  slug: string;
};

export type NorthflankSecretGroup = {
  name: string;
  groupId: string;
};

export type TeamCityBuildConfig = {
  name: string;
  buildConfigId: string;
};

export type TDuplicateIntegrationAuthDTO = {
  integrationAuthId: string;
  projectId: string;
};

export enum OctopusDeployScope {
  Project = "project"
  // tenant, variable set
}

export type CircleCIOrganization = {
  name: string;
  slug: string;
  projects: {
    name: string;
    id: string;
  }[];
  contexts: {
    name: string;
    id: string;
  }[];
};

export type TGetIntegrationAuthOctopusDeployScopeValuesDTO = {
  integrationAuthId: string;
  spaceId: string;
  resourceId: string;
  scope: OctopusDeployScope;
};

export type TOctopusDeployVariableSetScopeValues = {
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

export enum CircleCiScope {
  Context = "context",
  Project = "project"
}
