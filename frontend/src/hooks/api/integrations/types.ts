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
  metadata?: Record<string, any>;
  integrationAuthId: string;
  envId: string;
  secretPath: string;
  createdAt: string;
  updatedAt: string;
};