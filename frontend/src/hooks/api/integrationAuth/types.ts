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

export type BitBucketWorkspace = {
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
