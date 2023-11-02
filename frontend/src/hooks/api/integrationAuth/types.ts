export type IntegrationAuth = {
  _id: string;
  integration: string;
  workspace: string;
  __v: number;
  createdAt: string;
  updatedAt: string;
  algorithm: string;
  keyEncoding: string;
};

export type App = {
  name: string;
  appId?: string;
  owner?: string;
  secretGroups?: string[];
};

export type Team = {
  name: string;
  teamId: string;
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

export type Service = {
  name: string;
  serviceId: string;
};

export type BitBucketWorkspace = {
  uuid: string;
  name: string;
  slug: string;
}

export type NorthflankSecretGroup = {
  name: string;
  groupId: string;
}

export type TeamCityBuildConfig = {
  name: string;
  buildConfigId: string;
}