import { z } from "zod";

import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";

import { TAppConnectionCredentialRotations } from "../../../db/schemas/app-connection-credential-rotations";
import { TAppConnectionRaw } from "../app-connection-types";
import { CreateAppConnectionCredentialRotationSchema } from "./app-connection-credential-rotation-schemas";
import {
  TAzureClientSecretCredentialRotationCredentials,
  TAzureClientSecretGeneratedCredential,
  TAzureClientSecretStrategyConfig
} from "./providers/azure-client-secret/azure-client-secret-credential-rotation-types";
import {
  TLdapCredentialRotationCredentials,
  TLdapGeneratedCredential,
  TLdapStrategyConfig
} from "./providers/ldap/ldap-credential-rotation-types";

export type TAppConnectionCredentialRotationRaw = TAppConnectionCredentialRotations;

export type TAppConnectionCredentialRotation = Omit<
  TAppConnectionCredentialRotationRaw,
  "encryptedLastRotationMessage"
> & {
  lastRotationMessage: string | null;
};

export type TCreateAppConnectionCredentialRotationSchema = z.infer<typeof CreateAppConnectionCredentialRotationSchema>;

// Union of all strategy configs — expands as providers are added
export type TAppConnectionCredentialRotationStrategyConfig = TAzureClientSecretStrategyConfig | TLdapStrategyConfig;

// Union of all individual generated credential types — expands as providers are added
export type TAppConnectionCredentialRotationGeneratedCredential =
  | TAzureClientSecretGeneratedCredential
  | TLdapGeneratedCredential;

// Union of all individual credentials types — expands as providers are added
export type TAppConnectionCredentialCredentials =
  | TAzureClientSecretCredentialRotationCredentials
  | TLdapCredentialRotationCredentials;

export type TAppConnectionCredentialRotationGeneratedCredentials =
  (TAppConnectionCredentialRotationGeneratedCredential | null)[];

// We might need to update this in the future to do more in-depth validation if need be
export type TCredentialRotationValidateMethod = (method: string) => void;

export type TCredentialRotationIssueInitialCredentials<
  S extends TAppConnectionCredentialRotationStrategyConfig,
  C extends TAppConnectionCredentialRotationGeneratedCredential
> = (
  credentials: Record<string, unknown>,
  rotationInterval: number
) => Promise<{
  strategyConfig: S;
  generatedCredentials: (C | null)[];
  updatedCredentials: Record<string, unknown>;
  postCommitCallback?: () => Promise<void>;
}>;

export type TCredentialRotationCreateCredential<
  S extends TAppConnectionCredentialRotationStrategyConfig,
  C extends TAppConnectionCredentialRotationGeneratedCredential
> = (
  strategyConfig: S,
  credentials: TAppConnectionCredentialCredentials,
  rotationInterval: number,
  activeIndex: number
) => Promise<C>;

export type TCredentialRotationMergeCredentials<C extends TAppConnectionCredentialRotationGeneratedCredential> = (
  currentCredentials: Record<string, unknown>,
  newCredential: C
) => Record<string, unknown>;

export type TCredentialRotationRevokeCredential<
  S extends TAppConnectionCredentialRotationStrategyConfig,
  C extends TAppConnectionCredentialRotationGeneratedCredential
> = (inactiveCredential: C, strategyConfig: S, credentials: TAppConnectionCredentialCredentials) => Promise<void>;

export type TCredentialRotationProviderServices = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

// What a provider reads from the connection. A connection being created has no row yet, so this is not the row.
export type TCredentialRotationConnection = Pick<
  TAppConnectionRaw,
  "app" | "method" | "orgId" | "projectId" | "name" | "gatewayId" | "gatewayPoolId"
>;

// Factory type — takes connection context, returns typed operations.
// Mirrors TRotationFactory in secret-rotation-v2.
export type TCredentialRotationProviderFactory<
  S extends TAppConnectionCredentialRotationStrategyConfig = TAppConnectionCredentialRotationStrategyConfig,
  C extends TAppConnectionCredentialRotationGeneratedCredential = TAppConnectionCredentialRotationGeneratedCredential
> = (
  connection: TCredentialRotationConnection,
  services: TCredentialRotationProviderServices
) => {
  validateConnectionMethod: TCredentialRotationValidateMethod;
  issueInitialCredentials: TCredentialRotationIssueInitialCredentials<S, C>;
  createCredential: TCredentialRotationCreateCredential<S, C>;
  mergeCredentials: TCredentialRotationMergeCredentials<C>;
  revokeCredential: TCredentialRotationRevokeCredential<S, C>;
};

export type TPrepareAppConnectionCredentialRotationDTO = {
  connection: TCredentialRotationConnection;
  // The connection's plaintext credentials as they will be stored before the rotation takes over.
  credentials: Record<string, unknown>;
  rotationInterval: number;
  rotateAtUtc: { hours: number; minutes: number };
};

// A new rotation with its provider calls done and everything encrypted, ready to be written in the caller's
// transaction. postCommitCallback revokes the credential the rotation replaced; run it only after that commit.
export type TPreparedAppConnectionCredentialRotation = {
  strategy: string;
  rotationInterval: number;
  rotateAtUtc: { hours: number; minutes: number };
  rotatedAt: Date;
  nextRotationAt: Date | null;
  encryptedStrategyConfig: Buffer;
  encryptedGeneratedCredentials: Buffer;
  encryptedConnectionCredentials: Buffer;
  postCommitCallback?: () => Promise<void>;
};

export type TUpdateAppConnectionCredentialRotationDTO = {
  connectionId: string;
  rotationInterval?: number;
  rotateAtUtc?: { hours: number; minutes: number };
  isAutoRotationEnabled?: boolean;
};

export type TTriggerAppConnectionCredentialRotationDTO = {
  connectionId: string;
};

export type TAppConnectionCredentialRotationRotateJobPayload = {
  rotationId: string;
  connectionId: string;
  queuedAt: Date;
  isManualRotation?: boolean;
};

export type TAppConnectionCredentialRotationSendNotificationJobPayload = {
  connectionId: string;
  connectionName: string;
  orgId: string;
  projectId?: string | null;
  strategy: string;
  lastRotationAttemptedAt: Date;
};
