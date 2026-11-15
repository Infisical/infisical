import { S3ServiceException } from "@aws-sdk/client-s3";
import { describe, expect, test } from "vitest";

import { ObjectStorageError, toObjectStorageError } from "./object-storage-errors";
import { ObjectStorageErrorReason, ObjectStorageType } from "./object-storage-types";

const wrap = (error: unknown, storageType = ObjectStorageType.External) =>
  toObjectStorageError(error, { storageType, bucket: "logs", region: "us-east-1" });
const s3Error = (name: string, fault: "client" | "server" = "client", httpStatusCode?: number) =>
  new S3ServiceException({ name, $fault: fault, $metadata: { httpStatusCode }, message: name });

describe("toObjectStorageError", () => {
  test.each([
    { error: s3Error("SlowDown"), reason: ObjectStorageErrorReason.Temporary },
    { error: s3Error("SomethingNew", "server", 503), reason: ObjectStorageErrorReason.Temporary },
    { error: Object.assign(new Error("connect"), { code: "ECONNRESET" }), reason: ObjectStorageErrorReason.Temporary },
    { error: s3Error("AccessDenied", "client", 403), reason: ObjectStorageErrorReason.AccessDenied },
    { error: s3Error("InvalidAccessKeyId"), reason: ObjectStorageErrorReason.CredentialsInvalid },
    { error: s3Error("NoSuchBucket", "client", 404), reason: ObjectStorageErrorReason.BucketNotFound },
    { error: s3Error("SomethingNew", "client", 400), reason: ObjectStorageErrorReason.Rejected }
  ])("reads $error.name as $reason", ({ error, reason }) => {
    const wrapped = wrap(error) as ObjectStorageError;
    expect(wrapped).toBeInstanceOf(ObjectStorageError);
    expect(wrapped.reason).toBe(reason);
    const label = (error as { code?: string }).code ?? error.name;
    expect(wrapped.details).toMatchObject({ bucket: "logs", region: "us-east-1", awsErrorCode: label });
  });

  test("leaves an error that didn't come from storage as it is", () => {
    const bug = new TypeError("a bug");
    expect(wrap(bug)).toBe(bug);
  });

  test("reads default storage with no usable credentials as invalid credentials, not a bug", () => {
    const missing = Object.assign(new Error("Could not load credentials from any providers"), {
      name: "CredentialsProviderError"
    });
    const wrapped = wrap(missing, ObjectStorageType.Default) as ObjectStorageError;
    expect(wrapped.reason).toBe(ObjectStorageErrorReason.CredentialsInvalid);
    expect(wrapped.storageType).toBe(ObjectStorageType.Default);
  });

  test("keeps an error that is already a storage error", () => {
    const existing = new ObjectStorageError({
      reason: ObjectStorageErrorReason.ConnectionInvalid,
      storageType: ObjectStorageType.External
    });
    expect(wrap(existing)).toBe(existing);
  });
});
