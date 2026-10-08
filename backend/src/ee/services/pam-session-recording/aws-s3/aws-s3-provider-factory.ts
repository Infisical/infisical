import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3ServiceException
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { createS3Client } from "@app/lib/aws/s3";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { TAppConnection } from "@app/services/app-connection/app-connection-types";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";
import { TAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-types";
import { getS3CompatibleConnectionConfig } from "@app/services/app-connection/s3-compatible";

import { PAM_RECORDING_MAX_CHUNK_BYTES, PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS } from "../pam-recording-constants";
import {
  buildExternalChunkObjectKey,
  normalizeKeyPrefix,
  TPamRecordingResolvedConfig,
  TPamRecordingStorageProvider
} from "../pam-recording-storage-types";

export const PAM_RECORDING_CONNECTION_APPS = [AppConnection.AWS, AppConnection.S3Compatible];

export const resolveS3RecordingAccess = async (
  appConnection: TAppConnection,
  region: string | undefined
): Promise<Pick<TPamRecordingResolvedConfig, "region" | "endpoint" | "awsCredentials">> => {
  if (appConnection.app === AppConnection.S3Compatible) {
    const s3Config = await getS3CompatibleConnectionConfig(appConnection);
    return { region: s3Config.region, endpoint: s3Config.endpoint, awsCredentials: s3Config.credentials };
  }

  if (appConnection.app !== AppConnection.AWS) {
    throw new BadRequestError({
      message: "Recording connection must be an AWS or S3-Compatible Storage connection"
    });
  }

  if (!region) {
    throw new BadRequestError({ message: "Select the AWS region of the recording bucket" });
  }

  const awsConfig = await getAwsConnectionConfig(appConnection as unknown as TAwsConnectionConfig, region as AWSRegion);
  return { region, awsCredentials: awsConfig.credentials };
};

const buildClient = (config: TPamRecordingResolvedConfig) => {
  if (!config.region || !config.awsCredentials) {
    throw new BadRequestError({ message: "S3 storage backend requires region and credentials" });
  }
  return createS3Client({ region: config.region, endpoint: config.endpoint, credentials: config.awsCredentials });
};

export const AwsS3RecordingStorageProvider: TPamRecordingStorageProvider = () => ({
  validateConfig: async ({ config }) => {
    if (!config.bucket) {
      throw new BadRequestError({ message: "Bucket is required for S3 storage backend" });
    }
    const client = buildClient(config);
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    } catch (err) {
      logger.warn({ err, bucket: config.bucket }, `S3 HeadBucket failed [bucket=${config.bucket}]`);
      if (!(err instanceof S3ServiceException && err.$metadata.httpStatusCode === 403)) {
        throw new BadRequestError({
          message: `Unable to access bucket. Verify ${config.endpoint ? "" : "region, "}credentials, and bucket policy [bucket=${config.bucket}]`
        });
      }
    }

    const testKey = `${normalizeKeyPrefix(config.keyPrefix)}.test/${crypto.nativeCrypto.randomUUID()}`;

    try {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: testKey,
          Body: Buffer.from("infisical-pam-recording-config-test"),
          ContentType: "application/octet-stream"
        })
      );
    } catch (err) {
      logger.warn({ err, bucket: config.bucket, testKey }, `S3 round-trip PutObject failed [bucket=${config.bucket}]`);
      throw new BadRequestError({
        message: "Bucket reachable but PutObject failed. Grant s3:PutObject on the configured key prefix"
      });
    }

    try {
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: testKey }));
    } catch (err) {
      logger.warn({ err, bucket: config.bucket, testKey }, `S3 test object cleanup failed [testKey=${testKey}]`);
    }
  },

  mintPresignedPut: async ({ config, projectId, sessionId, chunkIndex, ciphertextBytes, isKeyframe }) => {
    if (ciphertextBytes <= 0 || ciphertextBytes > PAM_RECORDING_MAX_CHUNK_BYTES) {
      throw new BadRequestError({
        message: `Chunk size out of range [bytes=${ciphertextBytes}, max=${PAM_RECORDING_MAX_CHUNK_BYTES}]`
      });
    }
    if (!config.bucket) throw new BadRequestError({ message: "Bucket is required" });

    const client = buildClient(config);
    const objectKey = buildExternalChunkObjectKey(
      config.keyPrefix,
      projectId,
      sessionId,
      chunkIndex,
      Boolean(isKeyframe)
    );

    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: objectKey,
      ContentLength: ciphertextBytes,
      ContentType: "application/octet-stream"
    });

    const url = await getSignedUrl(client, command, {
      expiresIn: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS,
      unhoistableHeaders: new Set(["content-length"])
    });

    return {
      url,
      objectKey,
      method: "PUT" as const,
      expiresInSeconds: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS
    };
  },

  mintPresignedGet: async ({ config, objectKey }) => {
    if (!config.bucket) throw new BadRequestError({ message: "Bucket is required" });
    const client = buildClient(config);
    const command = new GetObjectCommand({ Bucket: config.bucket, Key: objectKey });
    const url = await getSignedUrl(client, command, { expiresIn: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS });
    return { url, expiresInSeconds: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS };
  },

  deleteSession: async ({ config, projectId, sessionId }) => {
    if (!config.bucket) throw new BadRequestError({ message: "Bucket is required" });
    const client = buildClient(config);

    const prefix = `${normalizeKeyPrefix(config.keyPrefix)}${projectId}/${sessionId}/`;

    let continuationToken: string | undefined;
    do {
      // eslint-disable-next-line no-await-in-loop
      const listed = await client.send(
        new ListObjectsV2Command({
          Bucket: config.bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken
        })
      );
      const keys = (listed.Contents ?? []).map((o) => o.Key).filter((k): k is string => Boolean(k));
      // single-object deletes, since OCI rejects the CRC32 checksum the SDK sends with DeleteObjects
      for (const batch of chunkArray(keys, 50)) {
        // eslint-disable-next-line no-await-in-loop
        await Promise.all(batch.map((Key) => client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key }))));
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }
});
