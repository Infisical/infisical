import type { Agent } from "node:https";

import { GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { crypto } from "@app/lib/crypto/cryptography";

import { CustomAWSHasher } from "./hashing";

type TS3Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

export type TS3AccessCheck = { ok: true } | { ok: false; failure: "unreachable" | "unwritable"; error: unknown };

export type TS3Bucket = ReturnType<typeof createS3Bucket>;

export const createS3Client = ({
  region,
  credentials,
  endpoint,
  httpsAgent
}: {
  region: string;
  credentials: TS3Credentials;
  endpoint?: string;
  httpsAgent?: Agent;
}) =>
  new S3Client({
    region,
    sha256: CustomAWSHasher,
    credentials,
    ...(httpsAgent && { requestHandler: { httpsAgent } }),
    ...(endpoint
      ? {
          endpoint,
          forcePathStyle: true,
          // not every S3-compatible provider accepts the SDK's default flexible checksums
          requestChecksumCalculation: "WHEN_REQUIRED",
          responseChecksumValidation: "WHEN_REQUIRED"
        }
      : { useFipsEndpoint: crypto.isFipsModeEnabled() })
  });

export const createS3Bucket = ({
  region,
  bucket,
  credentials
}: {
  region: string;
  bucket: string;
  credentials: TS3Credentials;
}) => {
  const client = createS3Client({ region, credentials });

  // These headers are signed so S3 enforces them: the body must be the declared size and hash to the declared
  // digest, and If-None-Match stops a re-minted link from overwriting an object already stored.
  const presignCreateOnlyPut = ({
    key,
    contentLength,
    sha256Base64,
    expiresInSeconds
  }: {
    key: string;
    contentLength: number;
    sha256Base64: string;
    expiresInSeconds: number;
  }) =>
    getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentLength: contentLength,
        ContentType: "application/octet-stream",
        IfNoneMatch: "*",
        ChecksumSHA256: sha256Base64
      }),
      {
        expiresIn: expiresInSeconds,
        unhoistableHeaders: new Set(["content-length", "if-none-match", "x-amz-checksum-sha256"])
      }
    );

  const presignGet = (key: string, expiresInSeconds: number) =>
    getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: expiresInSeconds });

  const checkAccess = async (testKey: string): Promise<TS3AccessCheck> => {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (error) {
      return { ok: false, failure: "unreachable", error };
    }
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: testKey,
          Body: Buffer.from("infisical-access-check"),
          ContentType: "application/octet-stream"
        })
      );
    } catch (error) {
      return { ok: false, failure: "unwritable", error };
    }
    return { ok: true };
  };

  return { presignCreateOnlyPut, presignGet, checkAccess };
};
