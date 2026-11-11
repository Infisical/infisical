import { TActorInput } from "@app/lib/types";

export type TGetIntegrationDTO = {
  id: string;
} & TActorInput;

export type TUpdateIntegrationDTO = {
  id: string;
  app?: string;
  appId?: string;
  isActive?: boolean;
  secretPath?: string;
  region?: string;
  path?: string;
  targetEnvironment?: string;
  owner?: string;
  environment?: string;
  metadata?: {
    secretPrefix?: string;
    secretSuffix?: string;
    secretGCPLabel?: {
      labelName: string;
      labelValue: string;
    };
    secretAWSTag?: {
      key: string;
      value: string;
    }[];
    kmsKeyId?: string;
    shouldDisableDelete?: boolean;
    shouldEnableDelete?: boolean;
  };
} & TActorInput;

export type TDeleteIntegrationDTO = {
  id: string;
  shouldDeleteIntegrationSecrets?: boolean;
} & TActorInput;

export type TSyncIntegrationDTO = {
  id: string;
} & TActorInput;
