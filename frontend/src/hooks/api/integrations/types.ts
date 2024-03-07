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
  projectId: string;
  envId: string;
  environment: { slug: string; name: string; id: string };
  isActive: boolean;
  url: any;
  app: string;
  appId: string;
  targetEnvironment: string;
  targetEnvironmentId: string;
  targetService: string;
  targetServiceId: string;
  owner: string;
  path: string;
  region: string;
  integration: string;
  integrationAuth: string;
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

export const syncBehaviors = [
  { label: "Overwrite target", value: IntegrationSyncBehavior.OVERWRITE_TARGET },
  { label: "Prefer target", value: IntegrationSyncBehavior.PREFER_TARGET },
  { label: "Prefer source", value: IntegrationSyncBehavior.PREFER_SOURCE }
];