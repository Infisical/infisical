import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { AppConnectionCredentialRotationStatus } from "./app-connection-credential-rotation-enums";
import {
  TAppConnectionCredentialRotation,
  TAppConnectionCredentialRotationGeneratedCredentials,
  TAppConnectionCredentialRotationRaw
} from "./app-connection-credential-rotation-types";

const getNextUTCDayInterval = ({ hours, minutes }: { hours: number; minutes: number } = { hours: 0, minutes: 0 }) => {
  const now = new Date();

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, hours, minutes, 0, 0));
};

const getNextUTCMinuteInterval = ({ minutes }: { hours: number; minutes: number } = { hours: 0, minutes: 0 }) => {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes() + 1,
      minutes,
      0
    )
  );
};

export const getNextUtcRotationInterval = (rotateAtUtc?: { hours: number; minutes: number }) => {
  const appCfg = getConfig();

  if (appCfg.isRotationDevelopmentMode) {
    if (appCfg.isTestMode) {
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    }
    return getNextUTCMinuteInterval(rotateAtUtc);
  }

  return getNextUTCDayInterval(rotateAtUtc);
};

export const calculateNextRotationAt = ({
  rotateAtUtc,
  isAutoRotationEnabled,
  rotationInterval,
  rotationStatus,
  isManualRotation,
  ...params
}: {
  isAutoRotationEnabled: boolean;
  lastRotatedAt: Date;
  rotateAtUtc: { hours: number; minutes: number };
  rotationInterval: number;
  rotationStatus: string;
  isManualRotation: boolean;
}) => {
  if (!isAutoRotationEnabled) return null;

  if (rotationStatus === AppConnectionCredentialRotationStatus.Failed) {
    return getNextUtcRotationInterval(rotateAtUtc);
  }

  const lastRotatedAt = new Date(params.lastRotatedAt);
  const appCfg = getConfig();

  if (appCfg.isRotationDevelopmentMode) {
    const nextRotation = new Date(lastRotatedAt.getTime() + rotationInterval * 60 * 1000);
    nextRotation.setUTCSeconds(rotateAtUtc.minutes);
    nextRotation.setUTCMilliseconds(0);

    if (isManualRotation && lastRotatedAt.getUTCSeconds() >= rotateAtUtc.minutes) {
      nextRotation.setUTCMinutes(nextRotation.getUTCMinutes() + 1);
    }

    return nextRotation;
  }

  const nextRotation = new Date(lastRotatedAt);
  nextRotation.setUTCHours(rotateAtUtc.hours);
  nextRotation.setUTCMinutes(rotateAtUtc.minutes);
  nextRotation.setUTCSeconds(0);
  nextRotation.setUTCMilliseconds(0);

  if (
    isManualRotation &&
    (lastRotatedAt.getUTCHours() > rotateAtUtc.hours ||
      (lastRotatedAt.getUTCHours() === rotateAtUtc.hours && lastRotatedAt.getUTCMinutes() >= rotateAtUtc.minutes))
  ) {
    nextRotation.setUTCDate(nextRotation.getUTCDate() + rotationInterval + 1);
  } else {
    nextRotation.setUTCDate(nextRotation.getUTCDate() + rotationInterval);
  }

  return nextRotation;
};

export const encryptCredentialRotationGeneratedCredentials = async ({
  orgId,
  generatedCredentials,
  kmsService
}: {
  orgId: string;
  generatedCredentials: TAppConnectionCredentialRotationGeneratedCredentials;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(generatedCredentials))
  });

  return cipherTextBlob;
};

export const decryptCredentialRotationGeneratedCredentials = async ({
  orgId,
  encryptedGeneratedCredentials,
  kmsService
}: {
  orgId: string;
  encryptedGeneratedCredentials: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedGeneratedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TAppConnectionCredentialRotationGeneratedCredentials;
};

export const encryptStrategyConfig = async ({
  orgId,
  config,
  kmsService
}: {
  orgId: string;
  config: Record<string, unknown>;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(config))
  });

  return cipherTextBlob;
};

export const decryptStrategyConfig = async <T>({
  orgId,
  encryptedStrategyConfig,
  kmsService
}: {
  orgId: string;
  encryptedStrategyConfig: Buffer;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedStrategyConfig
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as T;
};

export const encryptRotationMessage = async ({
  orgId,
  message,
  kmsService
}: {
  orgId: string;
  message: string;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });

  const { cipherTextBlob } = encryptor({
    plainText: Buffer.from(message)
  });

  return cipherTextBlob;
};

export const expandCredentialRotation = async (
  { encryptedLastRotationMessage, ...rotation }: TAppConnectionCredentialRotationRaw,
  orgId: string,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
): Promise<TAppConnectionCredentialRotation> => {
  let lastRotationMessage: string | null = null;

  if (encryptedLastRotationMessage) {
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    lastRotationMessage = decryptor({
      cipherTextBlob: encryptedLastRotationMessage
    }).toString();
  }

  return {
    ...rotation,
    lastRotationMessage
  };
};

const MAX_MESSAGE_LENGTH = 1024;

export const parseRotationErrorMessage = (err: unknown): string => {
  let errorMessage = "Infisical encountered an issue while rotating credentials: ";

  if (err instanceof AxiosError) {
    errorMessage += err?.response?.data
      ? JSON.stringify(err?.response?.data)
      : (err?.message ?? "An unknown error occurred.");
  } else {
    errorMessage += (err as Error)?.message || "An unknown error occurred.";
  }

  return errorMessage.length <= MAX_MESSAGE_LENGTH
    ? errorMessage
    : `${errorMessage.substring(0, MAX_MESSAGE_LENGTH - 3)}...`;
};

export const getCredentialRotationJobOptions = ({
  id,
  nextRotationAt
}: Pick<TAppConnectionCredentialRotationRaw, "id" | "nextRotationAt">) => {
  const appCfg = getConfig();

  return {
    jobId: `app-connection-credential-rotation-rotate-${id}`,
    attempts: appCfg.isRotationDevelopmentMode ? 1 : 5,
    removeOnFail: true,
    removeOnComplete: true,
    backoff: {
      type: "exponential" as const,
      delay: 1000
    },
    delay: nextRotationAt ? Number(nextRotationAt) - Date.now() : undefined
  };
};
