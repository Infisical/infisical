import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
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

/** Trailing slash included when non-empty, so callers can concatenate without branching. */
export const normalizeKeyPrefix = (keyPrefix?: string | null) => {
  const trimmed = (keyPrefix ?? "").trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return trimmed ? `${trimmed}/` : "";
};

/**
 * The date segment exists so a customer can attach their own S3 lifecycle rule. Infisical adds none, and
 * never deletes an object itself.
 */
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
  return `${normalizeKeyPrefix(keyPrefix)}${projectId}/${sessionId}/${proxyId}/${day}/${chunkId}.json.enc`;
};

/** Null when the row is not pointed at a bucket yet. Callers treat that as "activity is off". */
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

type TStorageDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey" | "decryptWithInputKey">;
};

export type TAgentVaultActivityStorage = Awaited<ReturnType<typeof buildActivityStorage>>;

/**
 * Builds an S3 client for a project's configured bucket.
 *
 * orgId is required, not optional: every caller reaches this with an id that came off a row rather than
 * from the request, and asserting the connection belongs to the same org is what stops a stored
 * appConnectionId from reaching across tenants after the config was written.
 */
export const buildActivityStorage = async (
  config: TResolvedActivityStorageConfig,
  orgId: string,
  { appConnectionDAL, kmsService }: TStorageDeps
) => {
  const raw = await appConnectionDAL.findById(config.appConnectionId);
  if (!raw) {
    throw new BadRequestError({
      message:
        "The AWS connection used for activity logging no longer exists. Choose another on the Activity Logs page."
    });
  }
  if (raw.orgId !== orgId) {
    throw new InternalServerError({ message: "Activity storage connection belongs to a different organization" });
  }
  if (raw.app !== AppConnection.AWS) {
    throw new BadRequestError({
      message: `The connection used for activity logging is a ${raw.app} connection. Activity logging requires an AWS connection`
    });
  }

  const connection = await decryptAppConnection(raw, kmsService as Parameters<typeof decryptAppConnection>[1]);
  const { credentials } = await getAwsConnectionConfig(connection as unknown as TAwsConnectionConfig, config.region);

  const client = new S3Client({
    region: config.region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials
  });

  const { bucket, keyPrefix } = config;

  const presignPut = async ({ objectKey, ciphertextBytes }: { objectKey: string; ciphertextBytes: number }) => {
    // ContentLength is signed in, so the url is not a blank cheque: a proxy cannot reuse it to upload
    // something larger than the chunk it declared.
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentLength: ciphertextBytes,
      ContentType: "application/octet-stream"
    });
    return getSignedUrl(client, command, {
      expiresIn: AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS,
      unhoistableHeaders: new Set(["content-length"])
    });
  };

  const presignGet = async (objectKey: string) =>
    getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: objectKey }), {
      expiresIn: AGENT_VAULT_ACTIVITY_PRESIGN_EXPIRY_SECONDS
    });

  /**
   * A presigned GET on an object that is never written. S3 answers a matching CORS rule with the CORS
   * headers even on a 404, and fetch only rejects when the rule is missing, so this detects the one
   * misconfiguration server-side validation cannot see.
   */
  const mintCorsProbeUrl = async () => presignGet(`${normalizeKeyPrefix(keyPrefix)}.cors-probe`);

  const validate = async () => {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (err) {
      logger.warn({ err, bucket }, `Agent Vault activity HeadBucket failed [bucket=${bucket}]`);
      throw new BadRequestError({
        message: `Unable to reach bucket '${bucket}'. Check the bucket name, the region, and that the connection's credentials can access it`
      });
    }

    // One fixed key, overwritten on every save and never deleted: Infisical holds no delete permission on
    // the bucket, so a key per save would leave one behind each time.
    const testKey = `${normalizeKeyPrefix(keyPrefix)}.test/write-check`;
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
