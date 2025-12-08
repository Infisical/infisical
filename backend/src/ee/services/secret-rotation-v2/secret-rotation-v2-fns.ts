import { AxiosError } from "axios";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { KmsDataKey } from "@app/services/kms/kms-types";

import { AUTH0_CLIENT_SECRET_ROTATION_LIST_OPTION } from "./auth0-client-secret";
import { AWS_IAM_USER_SECRET_ROTATION_LIST_OPTION } from "./aws-iam-user-secret";
import { AZURE_CLIENT_SECRET_ROTATION_LIST_OPTION } from "./azure-client-secret";
import { LDAP_PASSWORD_ROTATION_LIST_OPTION, TLdapPasswordRotation } from "./ldap-password";
import { MONGODB_CREDENTIALS_ROTATION_LIST_OPTION } from "./mongodb-credentials";
import { MSSQL_CREDENTIALS_ROTATION_LIST_OPTION } from "./mssql-credentials";
import { MYSQL_CREDENTIALS_ROTATION_LIST_OPTION } from "./mysql-credentials";
import { OKTA_CLIENT_SECRET_ROTATION_LIST_OPTION } from "./okta-client-secret";
import { ORACLEDB_CREDENTIALS_ROTATION_LIST_OPTION } from "./oracledb-credentials";
import { POSTGRES_CREDENTIALS_ROTATION_LIST_OPTION } from "./postgres-credentials";
import { REDIS_CREDENTIALS_ROTATION_LIST_OPTION } from "./redis-credentials";
import { TSecretRotationV2DALFactory } from "./secret-rotation-v2-dal";
import { SecretRotation, SecretRotationStatus } from "./secret-rotation-v2-enums";
import { TSecretRotationV2ServiceFactory, TSecretRotationV2ServiceFactoryDep } from "./secret-rotation-v2-service";
import {
  TSecretRotationRotateSecretsJobPayload,
  TSecretRotationV2,
  TSecretRotationV2GeneratedCredentials,
  TSecretRotationV2ListItem,
  TSecretRotationV2Raw,
  TUpdateSecretRotationV2DTO
} from "./secret-rotation-v2-types";

const SECRET_ROTATION_LIST_OPTIONS: Record<SecretRotation, TSecretRotationV2ListItem> = {
  [SecretRotation.PostgresCredentials]: POSTGRES_CREDENTIALS_ROTATION_LIST_OPTION,
  [SecretRotation.MsSqlCredentials]: MSSQL_CREDENTIALS_ROTATION_LIST_OPTION,
  [SecretRotation.MySqlCredentials]: MYSQL_CREDENTIALS_ROTATION_LIST_OPTION,
  [SecretRotation.OracleDBCredentials]: ORACLEDB_CREDENTIALS_ROTATION_LIST_OPTION,
  [SecretRotation.Auth0ClientSecret]: AUTH0_CLIENT_SECRET_ROTATION_LIST_OPTION,
  [SecretRotation.AzureClientSecret]: AZURE_CLIENT_SECRET_ROTATION_LIST_OPTION,
  [SecretRotation.AwsIamUserSecret]: AWS_IAM_USER_SECRET_ROTATION_LIST_OPTION,
  [SecretRotation.LdapPassword]: LDAP_PASSWORD_ROTATION_LIST_OPTION,
  [SecretRotation.OktaClientSecret]: OKTA_CLIENT_SECRET_ROTATION_LIST_OPTION,
  [SecretRotation.RedisCredentials]: REDIS_CREDENTIALS_ROTATION_LIST_OPTION,
  [SecretRotation.MongoDBCredentials]: MONGODB_CREDENTIALS_ROTATION_LIST_OPTION
};

export const listSecretRotationOptions = () => {
  return Object.values(SECRET_ROTATION_LIST_OPTIONS).sort((a, b) => a.name.localeCompare(b.name));
};

const getNextUTCDayInterval = ({ hours, minutes }: TSecretRotationV2["rotateAtUtc"] = { hours: 0, minutes: 0 }) => {
  const now = new Date();

  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1, // Add 1 day to get tomorrow
      hours,
      minutes,
      0,
      0
    )
  );
};

const getNextUTCMinuteInterval = ({ minutes }: TSecretRotationV2["rotateAtUtc"] = { hours: 0, minutes: 0 }) => {
  const now = new Date();
  return new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours(),
      now.getUTCMinutes() + 1, // Add 1 minute to get the next minute
      minutes, // use minutes as seconds in dev
      0
    )
  );
};

export const getNextUtcRotationInterval = (rotateAtUtc?: TSecretRotationV2["rotateAtUtc"]) => {
  const appCfg = getConfig();

  if (appCfg.isRotationDevelopmentMode) {
    if (appCfg.isTestMode) {
      // if its test mode, it should always rotate
      return new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // Current time + 1 year
    }
    return getNextUTCMinuteInterval(rotateAtUtc);
  }

  return getNextUTCDayInterval(rotateAtUtc);
};

export const encryptSecretRotationCredentials = async ({
  projectId,
  generatedCredentials,
  kmsService
}: {
  projectId: string;
  generatedCredentials: TSecretRotationV2GeneratedCredentials;
  kmsService: TSecretRotationV2ServiceFactoryDep["kmsService"];
}) => {
  const { encryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const { cipherTextBlob: encryptedCredentialsBlob } = encryptor({
    plainText: Buffer.from(JSON.stringify(generatedCredentials))
  });

  return encryptedCredentialsBlob;
};

export const decryptSecretRotationCredentials = async ({
  projectId,
  encryptedGeneratedCredentials,
  kmsService
}: {
  projectId: string;
  encryptedGeneratedCredentials: Buffer;
  kmsService: TSecretRotationV2ServiceFactoryDep["kmsService"];
}) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId
  });

  const decryptedPlainTextBlob = decryptor({
    cipherTextBlob: encryptedGeneratedCredentials
  });

  return JSON.parse(decryptedPlainTextBlob.toString()) as TSecretRotationV2GeneratedCredentials;
};

export const getSecretRotationRotateSecretJobOptions = ({
  id,
  nextRotationAt
}: Pick<TSecretRotationV2Raw, "id" | "nextRotationAt">) => {
  const appCfg = getConfig();

  return {
    jobId: `secret-rotation-v2-rotate-${id}`,
    retryLimit: appCfg.isRotationDevelopmentMode ? 3 : 5,
    retryBackoff: true,
    startAfter: nextRotationAt ?? undefined
  };
};

export const calculateNextRotationAt = ({
  rotateAtUtc,
  isAutoRotationEnabled,
  rotationInterval,
  rotationStatus,
  isManualRotation,
  ...params
}: Pick<
  TSecretRotationV2,
  "isAutoRotationEnabled" | "lastRotatedAt" | "rotateAtUtc" | "rotationInterval" | "rotationStatus"
> & { isManualRotation: boolean }) => {
  if (!isAutoRotationEnabled) return null;

  if (rotationStatus === SecretRotationStatus.Failed) {
    return getNextUtcRotationInterval(rotateAtUtc);
  }

  const lastRotatedAt = new Date(params.lastRotatedAt);

  const appCfg = getConfig();

  if (appCfg.isRotationDevelopmentMode) {
    // treat interval as minute
    const nextRotation = new Date(lastRotatedAt.getTime() + rotationInterval * 60 * 1000);

    // in development mode we use rotateAtUtc.minutes as seconds
    nextRotation.setUTCSeconds(rotateAtUtc.minutes);
    nextRotation.setUTCMilliseconds(0);

    // If creation/manual rotation seconds are after the configured seconds we pad an additional minute
    // to ensure a full interval has elapsed before rotation
    if (isManualRotation && lastRotatedAt.getUTCSeconds() >= rotateAtUtc.minutes) {
      nextRotation.setUTCMinutes(nextRotation.getUTCMinutes() + 1);
    }

    return nextRotation;
  }

  // production mode - rotationInterval = days

  const nextRotation = new Date(lastRotatedAt);

  nextRotation.setUTCHours(rotateAtUtc.hours);
  nextRotation.setUTCMinutes(rotateAtUtc.minutes);
  nextRotation.setUTCSeconds(0);
  nextRotation.setUTCMilliseconds(0);

  // If creation/manual rotation was after the daily rotation time,
  // we need pad an additional day to ensure full rotation interval
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

export const expandSecretRotation = async (
  { encryptedLastRotationMessage, ...secretRotation }: TSecretRotationV2Raw,
  kmsService: TSecretRotationV2ServiceFactoryDep["kmsService"]
) => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.SecretManager,
    projectId: secretRotation.projectId
  });

  const lastRotationMessage = encryptedLastRotationMessage
    ? decryptor({
        cipherTextBlob: encryptedLastRotationMessage
      }).toString()
    : null;

  return {
    ...secretRotation,
    lastRotationMessage
  } as TSecretRotationV2;
};

const MAX_MESSAGE_LENGTH = 1024;

export const parseRotationErrorMessage = (err: unknown): string => {
  let errorMessage = `Infisical encountered an issue while generating credentials with the configured inputs: `;

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

function haveUnequalProperties<T>(obj1: T, obj2: T, properties: (keyof T)[]): boolean {
  return properties.some((prop) => obj1[prop] !== obj2[prop]);
}

export const throwOnImmutableParameterUpdate = (
  updatePayload: TUpdateSecretRotationV2DTO,
  secretRotation: TSecretRotationV2Raw
) => {
  if (!updatePayload.parameters) return;

  switch (updatePayload.type) {
    case SecretRotation.LdapPassword:
      if (
        haveUnequalProperties(
          updatePayload.parameters as TLdapPasswordRotation["parameters"],
          secretRotation.parameters as TLdapPasswordRotation["parameters"],
          ["rotationMethod", "dn"]
        )
      ) {
        throw new BadRequestError({ message: "Cannot update rotation method or DN" });
      }
      break;
    default:
    // do nothing
  }
};

export const rotateSecretsFns = async ({
  job,
  secretRotationV2DAL,
  secretRotationV2Service
}: {
  job: {
    data: TSecretRotationRotateSecretsJobPayload;
    id: string;
    retryCount: number;
    retryLimit: number;
  };
  secretRotationV2DAL: Pick<TSecretRotationV2DALFactory, "findById">;
  secretRotationV2Service: Pick<TSecretRotationV2ServiceFactory, "rotateGeneratedCredentials">;
}) => {
  const { rotationId, queuedAt, isManualRotation } = job.data;
  const { retryCount, retryLimit } = job;

  const logDetails = `[rotationId=${rotationId}] [jobId=${job.id}] retryCount=[${retryCount}/${retryLimit}]`;

  try {
    const secretRotation = await secretRotationV2DAL.findById(rotationId);

    if (!secretRotation) throw new Error(`Secret rotation ${rotationId} not found`);

    if (!secretRotation.isAutoRotationEnabled) {
      logger.info(`secretRotationV2Queue: Skipping Rotation - Auto-Rotation Disabled Since Queue ${logDetails}`);
    }

    if (new Date(secretRotation.lastRotatedAt).getTime() >= new Date(queuedAt).getTime()) {
      // rotated since being queued, skip rotation
      logger.info(`secretRotationV2Queue: Skipping Rotation - Rotated Since Queue ${logDetails}`);
      return;
    }

    await secretRotationV2Service.rotateGeneratedCredentials(secretRotation, {
      jobId: job.id,
      shouldSendNotification: true,
      isFinalAttempt: retryCount === retryLimit,
      isManualRotation
    });

    logger.info(`secretRotationV2Queue: Secrets Rotated ${logDetails}`);
  } catch (error) {
    logger.error(error, `secretRotationV2Queue: Failed to Rotate Secrets ${logDetails}`);
    throw error;
  }
};
