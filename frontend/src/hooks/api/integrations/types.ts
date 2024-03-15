export type TCloudIntegration = {
  name: string;
  slug: string;
  image: string;
  isAvailable: boolean;
  type: string;
  clientId: string;
  docsLink: string;
  clientSlug: string;
};

export type TIntegration = {
  id: string;
  isActive: boolean;
  url?: string;
  app?: string;
  appId?: string;
  targetEnvironment?: string;
  targetEnvironmentId?: string;
  targetService?: string;
  targetServiceId?: string;
  owner?: string;
  path?: string;
  region?: string;
  scope?: string;
  integration: string;
  integrationAuthId: string;
  envId: string;
  secretPath: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
  metadata?: {
    secretSuffix?: string;
    syncBehavior?: IntegrationSyncBehavior;
    scope: string;
    org: string;
    project: string;
    environment: string;
  };
};

export enum IntegrationSyncBehavior {
  OVERWRITE_TARGET = "overwrite-target",
  PREFER_TARGET = "prefer-target",
  PREFER_SOURCE = "prefer-source"
}
