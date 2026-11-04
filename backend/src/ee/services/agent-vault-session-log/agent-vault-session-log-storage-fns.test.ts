import { S3ServiceException } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { ObjectStorageError, toObjectStorageError } from "@app/services/object-storage/object-storage-errors";
import { ObjectStorageErrorReason, ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import {
  AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_MESSAGE,
  AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_SELF_HOSTED_MESSAGE
} from "./agent-vault-session-log-constants";
import {
  buildSessionLogSettingsAuditMetadata,
  describeStorageFailure,
  toEffectiveSessionLogConfig
} from "./agent-vault-session-log-storage-fns";

const instance = vi.hoisted(() => ({ isCloud: true }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isCloud: instance.isCloud }) }));

beforeEach(() => {
  instance.isCloud = true;
});

describe("toEffectiveSessionLogConfig", () => {
  const external = {
    enabled: true,
    storageType: "external",
    appConnectionId: "conn-1",
    bucket: "my-bucket",
    region: AWSRegion.US_EAST_1 as string,
    keyPrefix: "logs"
  };
  const savedDefault = {
    enabled: false,
    storageType: "default",
    appConnectionId: null,
    bucket: null,
    region: null,
    keyPrefix: null
  };

  test("a saved external row is used as it is, with or without an instance bucket", () => {
    const expected = {
      enabled: true,
      isSaved: true,
      storage: {
        type: ObjectStorageType.External,
        appConnectionId: "conn-1",
        bucket: "my-bucket",
        region: AWSRegion.US_EAST_1,
        keyPrefix: "logs"
      }
    };
    expect(toEffectiveSessionLogConfig(external, true)).toEqual(expected);
    expect(toEffectiveSessionLogConfig(external, false)).toEqual(expected);
  });

  test("an empty key prefix reads as none", () => {
    const config = toEffectiveSessionLogConfig({ ...external, keyPrefix: "" }, false);
    expect(config?.storage).toMatchObject({ keyPrefix: null });
  });

  test("with nothing saved and an instance bucket, session logs are on in default storage", () => {
    expect(toEffectiveSessionLogConfig(undefined, true)).toEqual({
      enabled: true,
      isSaved: false,
      storage: { type: ObjectStorageType.Default }
    });
  });

  test("a saved default row keeps its on or off", () => {
    expect(toEffectiveSessionLogConfig(savedDefault, true)).toEqual({
      enabled: false,
      isSaved: true,
      storage: { type: ObjectStorageType.Default }
    });
    expect(toEffectiveSessionLogConfig({ ...savedDefault, enabled: true }, true)?.enabled).toBe(true);
  });

  test("without an instance bucket, nothing saved and a saved default both mean no settings", () => {
    expect(toEffectiveSessionLogConfig(undefined, false)).toBeNull();
    expect(toEffectiveSessionLogConfig({ ...savedDefault, enabled: true }, false)).toBeNull();
  });

  test.each(["appConnectionId", "bucket", "region"] as const)(
    "an external row missing its %s reads as off in default storage",
    (field) => {
      expect(toEffectiveSessionLogConfig({ ...external, [field]: null }, true)).toEqual({
        enabled: false,
        isSaved: true,
        storage: { type: ObjectStorageType.Default }
      });
      expect(toEffectiveSessionLogConfig({ ...external, [field]: null }, false)).toBeNull();
    }
  );
});

describe("describeStorageFailure", () => {
  const s3Error = (name: string, fault: "client" | "server" = "client") =>
    new S3ServiceException({ name, $fault: fault, $metadata: {}, message: name });
  const networkError = (code: string) => Object.assign(new Error(`connect ${code}`), { code });
  const external = (error: Error, step?: "list" | "write") =>
    toObjectStorageError(error, {
      storageType: ObjectStorageType.External,
      bucket: "my-bucket",
      region: "us-east-1",
      step
    }) as ObjectStorageError;

  test.each([
    { error: s3Error("InvalidAccessKeyId"), isTemporary: false, hint: "Check the AWS connection's credentials." },
    { error: s3Error("ExpiredToken"), isTemporary: false, hint: "Check the AWS connection's credentials." },
    {
      error: s3Error("AccessDenied"),
      isTemporary: false,
      hint: "Check that the connection's credentials allow s3:ListBucket on it."
    },
    { error: s3Error("NoSuchBucket"), isTemporary: false, hint: "Check the bucket name and region in Settings." },
    { error: s3Error("PermanentRedirect"), isTemporary: false, hint: "Check the bucket name and region in Settings." },
    { error: s3Error("SlowDown"), isTemporary: true, hint: "S3 isn't responding. Try again in a bit." },
    { error: s3Error("SomethingNew", "server"), isTemporary: true, hint: "S3 isn't responding. Try again in a bit." },
    {
      error: Object.assign(new Error("timed out"), { name: "TimeoutError" }),
      isTemporary: true,
      hint: "S3 isn't responding. Try again in a bit."
    },
    { error: networkError("ECONNREFUSED"), isTemporary: true, hint: "S3 isn't responding. Try again in a bit." },
    {
      error: Object.assign(new Error("XML parse error"), { $metadata: { httpStatusCode: 429 } }),
      isTemporary: true,
      hint: "S3 isn't responding. Try again in a bit."
    },
    {
      error: Object.assign(new Error("XML parse error"), { $metadata: { httpStatusCode: 200 } }),
      isTemporary: true,
      hint: "S3 isn't responding. Try again in a bit."
    },
    {
      error: Object.assign(new Error("XML parse error"), { $metadata: { httpStatusCode: 403 } }),
      isTemporary: false,
      hint: "Check the AWS connection and the bucket settings."
    },
    { error: s3Error("SomethingNew"), isTemporary: false, hint: "Check the AWS connection and the bucket settings." }
  ])("a read failing with $error.name ($error.message) is temporary: $isTemporary", ({ error, isTemporary, hint }) => {
    const failure = describeStorageFailure(external(error, "list"), "read");
    expect(failure.isTemporary).toBe(isTemporary);
    expect(failure.message.startsWith("Infisical couldn't list session logs in bucket 'my-bucket' (")).toBe(true);
    expect(failure.message.endsWith(hint)).toBe(true);
  });

  test("a reply S3's client couldn't parse is labelled by its status", () => {
    const error = Object.assign(new Error("XML parse error"), { $metadata: { httpStatusCode: 429 } });
    expect(describeStorageFailure(external(error), "read").message).toContain("(HTTP 429)");
  });

  test("a network error is labelled by its code, not its generic name", () => {
    expect(describeStorageFailure(external(networkError("ENOTFOUND")), "read").message).toContain("(ENOTFOUND)");
  });

  test("a bucket check that S3 answers with a temporary error is worth a retry, not an IAM change", () => {
    expect(describeStorageFailure(external(s3Error("SlowDown", "server"), "list"), "check")).toEqual({
      isTemporary: true,
      message: "Couldn't reach bucket 'my-bucket' just now. Try again in a bit."
    });
  });

  test.each([
    { step: "list" as const, message: "Unable to reach bucket 'my-bucket'" },
    { step: "write" as const, message: "Grant s3:PutObject on the configured key prefix" }
  ])("a bucket check failing at the $step step says what to fix", ({ step, message }) => {
    const failure = describeStorageFailure(external(s3Error("AccessDenied"), step), "check");
    expect(failure.isTemporary).toBe(false);
    expect(failure.message).toContain(message);
  });

  const connectionError = (
    details: ObjectStorageError["details"],
    reason = ObjectStorageErrorReason.ConnectionInvalid
  ) => new ObjectStorageError({ reason, storageType: ObjectStorageType.External, details });

  test.each([
    {
      why: "a missing connection",
      error: connectionError({ isConnectionMissing: true }),
      message: "The AWS connection used for session logs no longer exists. Choose another on the Settings page.",
      isTemporary: false
    },
    {
      why: "a connection that isn't AWS",
      error: connectionError({ connectionName: "gh", connectionApp: "github" }),
      message: "The connection used for session logs is a github connection. Session logs require an AWS connection",
      isTemporary: false
    },
    {
      why: "a role AWS refused",
      error: connectionError({ connectionName: "aws-prod", cause: "Not authorized to perform sts:AssumeRole" }),
      message: "Couldn't use the AWS connection 'aws-prod' for session logs: Not authorized to perform sts:AssumeRole",
      isTemporary: false
    },
    {
      why: "AWS not answering",
      error: connectionError({ connectionName: "aws-prod" }, ObjectStorageErrorReason.Temporary),
      message: "Couldn't reach AWS to use the connection 'aws-prod' for session logs. Try again in a bit.",
      isTemporary: true
    }
  ])("names $why", ({ error, message, isTemporary }) => {
    expect(describeStorageFailure(error, "read")).toEqual({ message, isTemporary });
    expect(describeStorageFailure(error, "check")).toEqual({ message, isTemporary });
  });

  test("default storage gets the generic message, never its bucket, and is always worth a retry", () => {
    const error = toObjectStorageError(s3Error("AccessDenied"), {
      storageType: ObjectStorageType.Default,
      bucket: "instance-bucket",
      region: "us-east-1"
    }) as ObjectStorageError;
    for (const use of ["read", "check"] as const) {
      const failure = describeStorageFailure(error, use);
      expect(failure).toEqual({
        isTemporary: true,
        message: AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_MESSAGE
      });
    }
  });

  test("on a self-hosted instance, default storage problems point at the server administrator", () => {
    instance.isCloud = false;
    const error = toObjectStorageError(s3Error("AccessDenied"), {
      storageType: ObjectStorageType.Default,
      bucket: "instance-bucket",
      region: "us-east-1"
    }) as ObjectStorageError;
    expect(describeStorageFailure(error, "read")).toEqual({
      isTemporary: true,
      message: AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_SELF_HOSTED_MESSAGE
    });
  });
});

describe("buildSessionLogSettingsAuditMetadata", () => {
  const externalSettings = {
    enabled: true,
    storage: {
      type: ObjectStorageType.External as const,
      appConnectionId: "6f1c7a52-3f7e-4c8e-9a40-0b2d6c1e9f11",
      bucket: "globex-audit",
      region: AWSRegion.US_EAST_1,
      keyPrefix: "logs"
    }
  };

  test("records the saved bucket and the storage it replaced", () => {
    expect(
      buildSessionLogSettingsAuditMetadata({
        settings: externalSettings,
        appConnectionName: "globex-aws",
        previous: {
          storageType: ObjectStorageType.Default,
          appConnectionId: null,
          appConnectionName: null,
          bucket: null,
          region: null,
          keyPrefix: null
        }
      })
    ).toEqual({
      enabled: true,
      storageType: ObjectStorageType.External,
      appConnectionId: "6f1c7a52-3f7e-4c8e-9a40-0b2d6c1e9f11",
      appConnectionName: "globex-aws",
      bucket: "globex-audit",
      region: AWSRegion.US_EAST_1,
      keyPrefix: "logs",
      previousStorageType: ObjectStorageType.Default,
      previousAppConnectionId: null,
      previousAppConnectionName: null,
      previousBucket: null,
      previousRegion: null,
      previousKeyPrefix: null
    });
  });

  test("records turning off with no storage when the settings read back as none", () => {
    expect(
      buildSessionLogSettingsAuditMetadata({
        settings: null,
        appConnectionName: null,
        previous: {
          storageType: ObjectStorageType.External,
          appConnectionId: "6f1c7a52-3f7e-4c8e-9a40-0b2d6c1e9f11",
          appConnectionName: "globex-aws",
          bucket: "globex-audit",
          region: "eu-west-1",
          keyPrefix: "logs"
        }
      })
    ).toMatchObject({
      enabled: false,
      storageType: null,
      bucket: null,
      previousStorageType: ObjectStorageType.External,
      previousAppConnectionName: "globex-aws",
      previousBucket: "globex-audit",
      previousRegion: "eu-west-1",
      previousKeyPrefix: "logs"
    });
  });
});
