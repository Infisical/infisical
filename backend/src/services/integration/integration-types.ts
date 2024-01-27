import { TProjectPermission } from "@app/lib/types";

export type TCreateIntegrationDTO = {
  secretPath: string;
  integrationAuthId: string;
  app?: string;
  isActive: boolean;
  appId?: string;
  sourceEnvironment: string;
  targetEnvironment?: string;
  targetEnvironmentId?: string;
  targetService?: string;
  targetServiceId?: string;
  owner?: string;
  path?: string;
  region?: string;
  scope?: string;
  metadata?: {
    secretPrefix?: string;
    secretSuffix?: string;
    secretGCPLabel?: {
      labelName: string;
      labelValue: string;
    };
  };
} & Omit<TProjectPermission, "projectId">;

export type TUpdateIntegrationDTO = {
  id: string;
  app: string;
  appId: string;
  isActive?: boolean;
  secretPath: string;
  targetEnvironment: string;
  owner: string;
  environment: string;
} & Omit<TProjectPermission, "projectId">;

export type TDeleteIntegrationDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;
