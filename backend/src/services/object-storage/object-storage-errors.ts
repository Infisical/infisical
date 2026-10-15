import { S3ServiceException } from "@aws-sdk/client-s3";

import { ObjectStorageErrorReason, ObjectStorageType, TObjectStorageErrorDetails } from "./object-storage-types";

// Says what went wrong with the storage, never in a product's words. The reason tells a product whether trying again
// can help and whether the connection is the problem; for a more specific hint, a product may read the AWS error code
// in the details. Each product writes its own message, and decides what of the details its caller may see.
export class ObjectStorageError extends Error {
  reason: ObjectStorageErrorReason;

  storageType: ObjectStorageType;

  details: TObjectStorageErrorDetails;

  constructor({
    reason,
    storageType,
    details = {}
  }: {
    reason: ObjectStorageErrorReason;
    storageType: ObjectStorageType;
    details?: TObjectStorageErrorDetails;
  }) {
    super(`Object storage failed [reason=${reason}] [storageType=${storageType}]`);
    this.name = "ObjectStorageError";
    this.reason = reason;
    this.storageType = storageType;
    this.details = details;
  }
}

const TEMPORARY_AWS_ERRORS = new Set([
  "SlowDown",
  "InternalError",
  "ServiceUnavailable",
  "RequestTimeout",
  "Throttling",
  "ThrottlingException",
  "TooManyRequestsException",
  "RequestLimitExceeded",
  "TimeoutError",
  "AbortError"
]);
const NETWORK_ERROR_CODES = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]);
const AWS_CREDENTIAL_ERRORS = new Set(["InvalidAccessKeyId", "SignatureDoesNotMatch", "ExpiredToken", "InvalidToken"]);
const AWS_ACCESS_ERRORS = new Set(["AccessDenied", "AllAccessDisabled"]);
const AWS_LOCATION_ERRORS = new Set([
  "NoSuchBucket",
  "PermanentRedirect",
  "AuthorizationHeaderMalformed",
  "IllegalLocationConstraintException"
]);

type TAwsError = Error & { $fault?: string; $metadata?: { httpStatusCode?: number }; code?: string };

// Whether an AWS call failed because AWS or the network didn't answer, so that trying again later can help.
export const isTemporaryAwsError = (error: unknown) => {
  if (!(error instanceof Error)) return false;
  const { $fault, $metadata, code } = error as TAwsError;
  const status = $metadata?.httpStatusCode ?? 0;
  // A reply the client couldn't parse that isn't a 4xx came from something in the network path, not the settings.
  const isUnparsedReply = error.name === "Error" && $metadata?.httpStatusCode !== undefined && status < 400;
  return (
    $fault === "server" ||
    status >= 500 ||
    status === 429 ||
    isUnparsedReply ||
    TEMPORARY_AWS_ERRORS.has(error.name) ||
    NETWORK_ERROR_CODES.has(code ?? "")
  );
};

// S3 errors, network failures and replies S3's client couldn't parse. Anything else is a bug and stays a 500.
const isStorageError = (error: unknown) =>
  error instanceof S3ServiceException ||
  (error instanceof Error && ("code" in error || "$metadata" in error || error.name === "TimeoutError"));

// The name an admin can look up: the S3 error code, or for a reply S3's client couldn't parse (plain text from a
// proxy in between, say), the network code or HTTP status.
export const awsErrorLabel = (error: Error) => {
  const { $metadata, code } = error as TAwsError;
  if (error.name !== "Error") return error.name;
  return code ?? ($metadata?.httpStatusCode ? `HTTP ${$metadata.httpStatusCode}` : error.name);
};

const reasonFor = (error: Error) => {
  if (isTemporaryAwsError(error)) return ObjectStorageErrorReason.Temporary;
  if (AWS_CREDENTIAL_ERRORS.has(error.name)) return ObjectStorageErrorReason.CredentialsInvalid;
  if (AWS_ACCESS_ERRORS.has(error.name)) return ObjectStorageErrorReason.AccessDenied;
  if (AWS_LOCATION_ERRORS.has(error.name)) return ObjectStorageErrorReason.BucketNotFound;
  return ObjectStorageErrorReason.Rejected;
};

// Wraps a failed S3 call. Errors that didn't come from S3 or the network are returned unchanged, so a bug isn't
// reported as a storage problem.
export const toObjectStorageError = (
  error: unknown,
  {
    storageType,
    bucket,
    region,
    step
  }: { storageType: ObjectStorageType; bucket: string; region: string; step?: "list" | "write" }
): Error => {
  if (error instanceof ObjectStorageError) return error;
  // The SDK's default credential chain fails with no code or metadata when the instance has no usable credentials.
  const isMissingCredentials = error instanceof Error && error.name === "CredentialsProviderError";
  if (!isStorageError(error) && !isMissingCredentials) return error instanceof Error ? error : new Error(String(error));

  const awsError = error as TAwsError;
  return new ObjectStorageError({
    reason: isMissingCredentials ? ObjectStorageErrorReason.CredentialsInvalid : reasonFor(awsError),
    storageType,
    details: {
      bucket,
      region,
      step,
      awsErrorCode: awsErrorLabel(awsError),
      httpStatus: awsError.$metadata?.httpStatusCode
    }
  });
};
