import { z } from "zod";

import { TAppConnectionCredentialRotations } from "../../../db/schemas/app-connection-credential-rotations";
import { CreateAppConnectionCredentialRotationSchema } from "./app-connection-credential-rotation-schemas";
import { TAzureClientSecretGeneratedCredential, TAzureClientSecretStrategyConfig } from "./providers";

export type TAppConnectionCredentialRotationRaw = TAppConnectionCredentialRotations;

export type TAppConnectionCredentialRotation = Omit<
  TAppConnectionCredentialRotationRaw,
  "encryptedLastRotationMessage"
> & {
  lastRotationMessage: string | null;
};

export type TCreateAppConnectionCredentialRotationSchema = z.infer<typeof CreateAppConnectionCredentialRotationSchema>;

export type TAppConnectionCredentialRotationStrategyConfig = TAzureClientSecretStrategyConfig;

export type TAppConnectionCredentialRotationGeneratedCredentials = (TAzureClientSecretGeneratedCredential | null)[];

export type TCredentialRotationProvider = {
  // Validates the connection's auth method is supported — throws BadRequestError if not
  validateConnectionMethod(method: string): void;

  // Called during createRotation:
  // - Auto-detects strategy config (e.g. applicationObjectId) from credentials
  // - Validates accessibility (e.g. Graph API call)
  // - Lists existing credentials (to track original for first revocation cycle)
  // - Creates the initial credential
  issueInitialCredentials(
    credentials: Record<string, unknown>,
    rotationInterval: number
  ): Promise<{
    strategyConfig: TAppConnectionCredentialRotationStrategyConfig;
    generatedCredentials: TAppConnectionCredentialRotationGeneratedCredentials;
    updatedCredentials: Record<string, unknown>;
  }>;

  // Called during rotateCredentials (queue worker):
  // Creates a new credential at the given index
  createCredential(
    strategyConfig: TAppConnectionCredentialRotationStrategyConfig,
    credentials: Record<string, unknown>,
    rotationInterval: number,
    inactiveIndex: number
  ): Promise<TAzureClientSecretGeneratedCredential>;

  // Merges newly created credential back into the connection's credentials object
  mergeCredentials(
    currentCredentials: Record<string, unknown>,
    newCredential: TAzureClientSecretGeneratedCredential
  ): Record<string, unknown>;

  // Revokes the inactive/old credential (best-effort, non-fatal)
  revokeCredential(
    inactiveCredential: TAzureClientSecretGeneratedCredential,
    strategyConfig: TAppConnectionCredentialRotationStrategyConfig,
    credentials: Record<string, unknown>
  ): Promise<void>;
};

// DTOs
export type TCreateAppConnectionCredentialRotationDTO = {
  connectionId: string;
  rotationInterval: number;
  rotateAtUtc: { hours: number; minutes: number };
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

// Queue payloads
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
  strategy: string;
  lastRotationAttemptedAt: Date;
};
