import {
  ChecksumMode,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  NotFound,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { CustomAWSHasher } from "@app/lib/aws/hashing";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { PAM_RECORDING_MAX_CHUNK_BYTES, PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS } from "../pam-recording-constants";
import {
  buildExternalChunkObjectKey,
  normalizeKeyPrefix,
  TPamRecordingResolvedConfig,
  TPamRecordingStorageProvider
} from "../pam-recording-storage-types";

const buildClient = (config: TPamRecordingResolvedConfig) => {
  if (!config.region || !config.awsCredentials) {
    throw new BadRequestError({ message: "AWS S3 storage backend requires region and credentials" });
  }
  return new S3Client({
    region: config.region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials: config.awsCredentials
  });
};

export const AwsS3RecordingStorageProvider: TPamRecordingStorageProvider = () => ({
  validateConfig: async ({ config }) => {
    if (!config.bucket) {
      throw new BadRequestError({ message: "Bucket is required for AWS S3 backend" });
    }
    const client = buildClient(config);
    try {
      await client.send(new HeadBucketCommand({ Bucket: config.bucket }));
    } catch (err) {
      logger.warn({ err, bucket: config.bucket }, `S3 HeadBucket failed [bucket=${config.bucket}]`);
      throw new BadRequestError({
        message: `Unable to access bucket. Verify region, credentials, and bucket policy [bucket=${config.bucket}]`
      });
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
      await client.send(
        new DeleteObjectsCommand({
          Bucket: config.bucket,
          Delete: { Objects: [{ Key: testKey }], Quiet: true }
        })
      );
    } catch (err) {
      logger.warn({ err, bucket: config.bucket, testKey }, `S3 test object cleanup failed [testKey=${testKey}]`);
    }
  },

  mintPresignedPut: async ({
    config,
    projectId,
    sessionId,
    chunkIndex,
    ciphertextBytes,
    isKeyframe,
    ciphertextSha256Base64
  }) => {
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
      ContentType: "application/octet-stream",
      ...(ciphertextSha256Base64 ? { ChecksumSHA256: ciphertextSha256Base64 } : {})
    });

    // A signed checksum header makes S3 itself refuse a body whose hash differs from the one declared here.
    // Only signed when the gateway asked for it: an older gateway would not send the header and S3 would
    // reject every upload.
    const unhoistableHeaders = new Set(["content-length"]);
    if (ciphertextSha256Base64) unhoistableHeaders.add("x-amz-checksum-sha256");

    const url = await getSignedUrl(client, command, {
      expiresIn: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS,
      unhoistableHeaders
    });

    return {
      url,
      objectKey,
      method: "PUT" as const,
      expiresInSeconds: PAM_RECORDING_PRESIGNED_URL_EXPIRY_SECONDS,
      ...(ciphertextSha256Base64 ? { headers: { "x-amz-checksum-sha256": ciphertextSha256Base64 } } : {})
    };
  },

  describeObject: async ({ config, objectKey }) => {
    if (!config.bucket) throw new BadRequestError({ message: "Bucket is required" });
    const client = buildClient(config);
    try {
      const head = await client.send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: objectKey, ChecksumMode: ChecksumMode.ENABLED })
      );
      return { sizeBytes: Number(head.ContentLength ?? 0), sha256Base64: head.ChecksumSHA256 || undefined };
    } catch (err) {
      if (err instanceof NotFound || (err as { name?: string })?.name === "NotFound") return null;
      logger.warn({ err, bucket: config.bucket, objectKey }, `S3 HeadObject failed [bucket=${config.bucket}]`);
      throw new BadRequestError({
        message: `Unable to read the uploaded recording chunk from the bucket. Grant s3:GetObject on the configured key prefix [bucket=${config.bucket}]`
      });
    }
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
      if (keys.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        await client.send(
          new DeleteObjectsCommand({
            Bucket: config.bucket,
            Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true }
          })
        );
      }
      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);
  }
});
