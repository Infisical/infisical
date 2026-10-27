import { z } from "zod";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { THoneyTokenTriggeredEvent } from "@app/services/telemetry/telemetry-types";

import type {
  THoneyTokenConfigProvider,
  THoneyTokenConfigServiceFactoryDep
} from "../honey-token-config/honey-token-config-types";
import type { THoneyTokenDALFactory } from "./honey-token-dal";
import { HoneyTokenHosting, HoneyTokenType } from "./honey-token-enums";
import {
  THoneyTokenConfigByType,
  THoneyTokenCreateInput,
  THoneyTokenCreationOptionsByType,
  THoneyTokenDisplayCredentialsByType
} from "./honey-token-provider-types";
import type { THoneyTokenServiceFactoryDep } from "./honey-token-service";

export type THoneyTokenProviderHooksDep = Pick<THoneyTokenServiceFactoryDep, "kmsService" | "appConnectionDAL"> & {
  honeyTokenDAL: Pick<THoneyTokenDALFactory, "findOneByTokenIdentifier" | "transaction">;
  honeyTokenConfigDAL: Pick<THoneyTokenServiceFactoryDep["honeyTokenConfigDAL"], "findOne">;
};

export type THoneyTokenDeploymentStatus = { deployed: boolean; status: string | null };

export type THoneyTokenCredentialTarget =
  | { hosting: HoneyTokenHosting.InfisicalManaged }
  | { hosting: HoneyTokenHosting.CustomerAccount; appConnection: TAppConnection };

// Validates an organization-level connection for the token's project. Provided by the service, which owns
// the actor's permission to use it.
export type THoneyTokenGetAppConnection = (connectionId: string) => Promise<TAppConnection>;

export type THoneyTokenTriggerAuthentication =
  | { outcome: "rejected" }
  // Authentic, but for a token Infisical no longer tracks: acknowledged so the sender stops retrying.
  | { outcome: "ignored" }
  | {
      outcome: "accepted";
      honeyToken: NonNullable<Awaited<ReturnType<THoneyTokenDALFactory["findOneByTokenIdentifier"]>>>;
      telemetryProperties: Omit<THoneyTokenTriggeredEvent["properties"], "type">;
    };

export type THoneyTokenProviderHooks = {
  getCreationOptions: (input: { orgId: string }) => Promise<THoneyTokenCreationOptionsByType[HoneyTokenType]>;
  // Throws when the requested configuration cannot be used. orgConnection is set when the credentials live
  // behind the organization's own connection, whose deployment the service verifies.
  prepareCreate: (input: {
    config: THoneyTokenCreateInput["config"];
    orgId: string;
    getAppConnection: THoneyTokenGetAppConnection;
  }) => Promise<{
    target: THoneyTokenCredentialTarget;
    orgConnection: { appConnection: TAppConnection; connectionId: string; encryptedConfig?: Buffer | null } | null;
  }>;
  getRevokeTarget: (input: {
    honeyToken: { config?: unknown };
    orgId: string;
    getAppConnection: THoneyTokenGetAppConnection;
  }) => Promise<THoneyTokenCredentialTarget>;
  authenticateTrigger: (input: {
    tokenIdentifier: string;
    timestamp: string;
    signatureHash: string;
    rawBody: string;
  }) => Promise<THoneyTokenTriggerAuthentication>;
  createCredentials: (target: THoneyTokenCredentialTarget) => Promise<{
    credentials: Record<string, string>;
    tokenIdentifier: string;
  }>;
  revokeCredentials: (input: {
    target: THoneyTokenCredentialTarget;
    credentials: Record<string, string>;
  }) => Promise<void>;
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
  serviceHooksFactory: (deps: THoneyTokenProviderHooksDep) => THoneyTokenProviderHooks;
  configProviderFactory: (deps: THoneyTokenConfigServiceFactoryDep) => THoneyTokenConfigProvider<T>;
  registerRouter?: (server: FastifyZodProvider) => Promise<void>;
};
