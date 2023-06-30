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
};

export type Team = {
  name: string;
  teamId: string;
};

export type Environment = {
  name: string;
  environmentId: string;
};

export type Service = {
  name: string;
  serviceId: string;
};
