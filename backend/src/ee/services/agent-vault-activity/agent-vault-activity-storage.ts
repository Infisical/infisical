import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { STSServiceException } from "@aws-sdk/client-sts";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { TAgentVaultActivityConfigs } from "@app/db/schemas";
import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { decryptAppConnection } from "@app/services/app-connection/app-connection-fns";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS } from "./agent-vault-activity-constants";
import { TResolvedActivityStorageConfig } from "./agent-vault-activity-types";

export const withKeyPrefix = (keyPrefix: string | null | undefined, key: string) =>
  keyPrefix ? `${keyPrefix}/${key}` : key;

export const buildActivityObjectKey = ({
  keyPrefix,
  projectId,
  sessionId,
  proxyId,
  startedAt,
  chunkId
}: {
  keyPrefix?: string | null;
  projectId: string;
  sessionId: string;
  proxyId: string;
  startedAt: Date;
  chunkId: string;
}) => {
  const day = startedAt.toISOString().slice(0, 10);
  return withKeyPrefix(keyPrefix, `${projectId}/${sessionId}/${proxyId}/${day}/${chunkId}.json.enc`);
};

export const resolveStorageConfig = (
  config: Pick<TAgentVaultActivityConfigs, "appConnectionId" | "bucket" | "region" | "keyPrefix">
): TResolvedActivityStorageConfig | null => {
  if (!config.appConnectionId || !config.bucket || !config.region) return null;
  return {
    appConnectionId: config.appConnectionId,
    bucket: config.bucket,
    region: config.region as AWSRegion,
    keyPrefix: config.keyPrefix ?? null
  };
};

// Both headers are signed so S3 enforces them: the link cannot carry more than the declared size, and
// If-None-Match stops a link re-minted for a retried chunk from overwriting one already stored.
export const presignActivityPut = (
  client: S3Client,
  { bucket, objectKey, ciphertextBytes }: { bucket: string; objectKey: string; ciphertextBytes: number }
) =>
  getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentLength: ciphertextBytes,
      ContentType: "application/octet-stream",
      IfNoneMatch: "*"
    }),
    {
      expiresIn: AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS,
      unhoistableHeaders: new Set(["content-length", "if-none-match"])
    }
  );

type TStorageDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithInputKey">;
};

export type TAgentVaultActivityStorage = Awaited<ReturnType<typeof buildActivityStorage>>;

export const buildActivityStorage = async (
  config: TResolvedActivityStorageConfig,
  orgId: string,
  { appConnectionDAL, kmsService }: TStorageDeps
) => {
  const raw = await appConnectionDAL.findById(config.appConnectionId);
  if (!raw) {
    throw new BadRequestError({
      message: "The AWS connection used for session logging no longer exists. Choose another on the Settings page."
    });
  }
  if (raw.orgId !== orgId) {
    throw new InternalServerError({ message: "Activity storage connection belongs to a different organization" });
  }
  if (raw.app !== AppConnection.AWS) {
    throw new BadRequestError({
      message: `The connection used for session logging is a ${raw.app} connection. Session logging requires an AWS connection`
    });
  }

  let credentials: Awaited<ReturnType<typeof getAwsConnectionConfig>>["credentials"];
  try {
    const connection = await decryptAppConnection(raw, kmsService as Parameters<typeof decryptAppConnection>[1]);
    ({ credentials } = await getAwsConnectionConfig(connection as unknown as TAwsConnectionConfig, config.region));
  } catch (err) {
    logger.warn({ err }, `Agent Vault activity could not use its AWS connection [appConnectionId=${raw.id}]`);
    const reason =
      err instanceof STSServiceException || err instanceof BadRequestError
        ? err.message
        : "Infisical could not load its credentials";
    throw new BadRequestError({
      message: `Couldn't use the AWS connection '${raw.name}' for session logging: ${reason}`
    });
  }

  const client = new S3Client({
    region: config.region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials
  });

  const { bucket, keyPrefix } = config;

  const presignPut = async ({ objectKey, ciphertextBytes }: { objectKey: string; ciphertextBytes: number }) =>
    presignActivityPut(client, { bucket, objectKey, ciphertextBytes });

  const presignGet = async (objectKey: string) =>
    getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), {
      expiresIn: AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS
    });

  const mintCorsProbeUrl = async () => presignGet(withKeyPrefix(keyPrefix, ".cors-probe"));

  const validate = async () => {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err) {
      logger.warn({ err, bucket }, `Agent Vault activity HeadBucket failed [bucket=${bucket}]`);
      throw new BadRequestError({
        message: `Unable to reach bucket '${bucket}'. Check the bucket name, the region, and that the connection's credentials can access it`
      });
    }

    const testKey = withKeyPrefix(keyPrefix, ".test/write-check");
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: testKey,
          Body: Buffer.from("infisical-agent-vault-activity-config-test"),
          ContentType: "application/octet-stream"
        })
      );
    } catch (err) {
      logger.warn({ err, bucket, testKey }, `Agent Vault activity PutObject failed [bucket=${bucket}]`);
      throw new BadRequestError({
        message: `Bucket '${bucket}' is reachable but writing to it failed. Grant s3:PutObject on the configured key prefix`
      });
    }
  };

  return { presignPut, presignGet, mintCorsProbeUrl, validate };
};
