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
  _id: string;
  workspace: string;
  environment: string;
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
    scope: string; 
    org: string;
    project: string;
    environment: string;
  }
};
