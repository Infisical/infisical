import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";

import type {
  THoneyTokenConfigProvider,
  THoneyTokenConfigServiceFactoryDep
} from "../honey-token-config/honey-token-config-types";
import { HoneyTokenType } from "./honey-token-enums";
import { THoneyTokenConfigByType, THoneyTokenDisplayCredentialsByType } from "./honey-token-provider-types";
import type { THoneyTokenServiceFactoryDep } from "./honey-token-service";

export type THoneyTokenDeploymentStatus = { deployed: boolean; status: string | null };

export type THoneyTokenProviderHooks = {
  createCredentials: (appConnection: TAppConnection) => Promise<{
    credentials: Record<string, string>;
    tokenIdentifier: string;
  }>;
  revokeCredentials: (input: { appConnection: TAppConnection; credentials: Record<string, string> }) => Promise<void>;
  verifyDeployment?: (input: {
    appConnection: TAppConnection;
    orgId: string;
    encryptedConfig?: Buffer | null;
    connectionId: string;
  }) => Promise<THoneyTokenDeploymentStatus>;
  getCredentialsForDisplay: (input: {
    encryptedCredentials: Buffer;
    projectId: string;
  }) => Promise<Record<string, string>>;
};

export type THoneyTokenProviderDefinition<T extends HoneyTokenType = HoneyTokenType> = {
  type: T;
  name: string;
  connectionApp: AppConnection;
  configSchema: z.ZodType<THoneyTokenConfigByType[T], z.ZodTypeDef, unknown>;
  credentialsResponseSchema: z.ZodType<{
    type: T;
    credentials: THoneyTokenDisplayCredentialsByType[T];
  }>;
  serviceHooksFactory: (deps: THoneyTokenServiceFactoryDep) => THoneyTokenProviderHooks;
  configProviderFactory: (deps: THoneyTokenConfigServiceFactoryDep) => THoneyTokenConfigProvider<T>;
  registerRouter?: (server: FastifyZodProvider) => Promise<void>;
};
