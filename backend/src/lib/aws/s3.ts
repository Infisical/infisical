import { GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { crypto } from "@app/lib/crypto/cryptography";

import { CustomAWSHasher } from "./hashing";

export type TS3Credentials = { accessKeyId: string; secretAccessKey: string; sessionToken?: string };

// Without these the SDK waits on a stalled AWS endpoint indefinitely, past the point Infisical drops the request.
export const AWS_REQUEST_TIMEOUTS = { connectionTimeout: 5_000, requestTimeout: 15_000, throwOnRequestTimeout: true };

// Three attempts at the 15s request timeout fit inside this, and it stays under Infisical's 100s request cut-off.
const S3_CALL_TIMEOUT_MS = 45_000;

export type TS3Check = { ok: true } | { ok: false; error: unknown };

export type TS3Bucket = ReturnType<typeof createS3Bucket>;

export const createS3Bucket = ({
  region,
  bucket,
  credentials
}: {
  region: string;
  bucket: string;
  // Without credentials, the SDK finds them itself: from the environment, the shared config file, or the pod's role.
  credentials?: TS3Credentials;
}) => {
  const client = new S3Client({
    region,
    useFipsEndpoint: crypto.isFipsModeEnabled(),
    sha256: CustomAWSHasher,
    credentials,
    requestHandler: AWS_REQUEST_TIMEOUTS
  });
  // The request timeout stops once the headers arrive, so a reply that stalls after them needs an overall limit.
  const sendOptions = () => ({ abortSignal: AbortSignal.timeout(S3_CALL_TIMEOUT_MS) });

  // These headers are signed so S3 enforces them: the body must be the declared size and hash to the declared
  // digest, and If-None-Match stops a re-minted link from overwriting an object already stored.
  const presignCreateOnlyPut = ({
    key,
    contentLength,
    sha256Base64,
    expiresInSeconds,
    tagging
  }: {
    key: string;
    contentLength: number;
    sha256Base64: string;
    expiresInSeconds: number;
    tagging?: string;
  }) =>
    getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentLength: contentLength,
        ContentType: "application/octet-stream",
        IfNoneMatch: "*",
        ChecksumSHA256: sha256Base64,
        Tagging: tagging
      }),
      // Tagging isn't in unhoistableHeaders, so the signer moves x-amz-tagging into the URL's query string. The uploader
      // sends only the headers above, and can't change the tag without breaking the signature.
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
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, StartAfter: startAfter, MaxKeys: maxKeys }),
      sendOptions()
    );
    const objects: { key: string; size: number }[] = [];
    (res.Contents ?? []).forEach(({ Key, Size }) => {
      if (Key !== undefined && Size !== undefined) objects.push({ key: Key, size: Size });
    });
    return { objects, isTruncated: Boolean(res.IsTruncated) };
  };

  // Lists under the prefix instead of using HeadBucket: the IAM policy allows s3:ListBucket only under the prefix, and
  // AWS refuses HeadBucket under that condition.
  const checkListAccess = async (prefix: string): Promise<TS3Check> => {
    try {
      await client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1 }), sendOptions());
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  };

  const writeTestObject = async (key: string, tagging?: string): Promise<TS3Check> => {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: Buffer.from("infisical-access-check"),
          ContentType: "application/octet-stream",
          Tagging: tagging
        }),
        sendOptions()
      );
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  };

  return { presignCreateOnlyPut, presignGet, listPage, checkListAccess, writeTestObject };
};
