import {
  GetObjectCommand,
  HeadBucketCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { crypto } from "@app/lib/crypto/cryptography";

import { CustomAWSHasher } from "./hashing";

type TS3Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

export type TS3AccessCheck = { ok: true } | { ok: false; failure: "unreachable" | "unwritable"; error: unknown };

export type TS3Bucket = ReturnType<typeof createS3Bucket>;

export const createS3Bucket = ({
  region,
  bucket,
  credentials
}: {
  region: string;
  bucket: string;
  credentials: TS3Credentials;
}) => {
  const client = new S3Client({
    region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials,
    // Without these the SDK waits on a stalled S3 indefinitely, past the point Infisical drops the request.
    requestHandler: { connectionTimeout: 5_000, requestTimeout: 15_000, throwOnRequestTimeout: true }
  });

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

  // One page only: callers that page do so across requests, so one request can't walk an unbounded listing.
  const listPage = async ({
    prefix,
    startAfter,
    maxKeys
  }: {
    prefix: string;
    startAfter?: string;
    maxKeys: number;
  }) => {
    const res = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, StartAfter: startAfter, MaxKeys: maxKeys })
    );
    const objects: { key: string; size: number }[] = [];
    (res.Contents ?? []).forEach(({ Key, Size }) => {
      if (Key !== undefined && Size !== undefined) objects.push({ key: Key, size: Size });
    });
    return { objects, isTruncated: Boolean(res.IsTruncated) };
  };

  const checkReachable = async (): Promise<{ ok: true } | { ok: false; error: unknown }> => {
    try {
      await client.send(new HeadBucketCommand({ Bucket: bucket }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  };

  const checkAccess = async (testKey: string): Promise<TS3AccessCheck> => {
    const reachable = await checkReachable();
    if (!reachable.ok) return { ok: false, failure: "unreachable", error: reachable.error };
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

  return { presignCreateOnlyPut, presignGet, listPage, checkReachable, checkAccess };
};
