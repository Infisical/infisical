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
  lastUsed?: string;
  isSynced?: boolean;
  syncMessage?: string;
  __v: number;
  metadata?: {
    githubVisibility?: string;
    githubVisibilityRepoIds?: string[];
    shouldAutoRedeploy?: boolean;
    secretAWSTag?: {
      key: string;
      value: string;
    }[];

    kmsKeyId?: string;
    secretSuffix?: string;
    secretPrefix?: string;
    syncBehavior?: IntegrationSyncBehavior;
    mappingBehavior?: IntegrationMappingBehavior;
    scope: string;
    org: string;
    project: string;
    environment: string;

    shouldDisableDelete?: boolean;
    shouldMaskSecrets?: boolean;
    shouldProtectSecrets?: boolean;
    shouldEnableDelete?: boolean;
  };
};

export type TIntegrationWithEnv = TIntegration & {
  environment: {
    id: string;
    name: string;
    slug: string;
  };
};

export enum IntegrationSyncBehavior {
  OVERWRITE_TARGET = "overwrite-target",
  PREFER_TARGET = "prefer-target",
  PREFER_SOURCE = "prefer-source"
}

export enum IntegrationMappingBehavior {
  ONE_TO_ONE = "one-to-one",
  MANY_TO_ONE = "many-to-one"
}
