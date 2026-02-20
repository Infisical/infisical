import { z } from "zod";

import { TAppConnectionCredentialRotations } from "../../../db/schemas/app-connection-credential-rotations";
import { CreateAppConnectionCredentialRotationSchema } from "./app-connection-credential-rotation-schemas";

export type TAppConnectionCredentialRotationRaw = TAppConnectionCredentialRotations;

export type TAppConnectionCredentialRotation = Omit<
  TAppConnectionCredentialRotationRaw,
  "encryptedLastRotationMessage"
> & {
  lastRotationMessage: string | null;
};

export type TCreateAppConnectionCredentialRotationSchema = z.infer<typeof CreateAppConnectionCredentialRotationSchema>;

// Strategy config types
export type TAzureClientSecretStrategyConfig = {
  objectId: string;
};

export type TAppConnectionCredentialRotationStrategyConfig = TAzureClientSecretStrategyConfig;

// Generated credentials types
export type TAzureClientSecretGeneratedCredential = {
  keyId: string;
  clientSecret: string;
  createdAt: string;
};

export type TAppConnectionCredentialRotationGeneratedCredentials = (TAzureClientSecretGeneratedCredential | null)[];

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
