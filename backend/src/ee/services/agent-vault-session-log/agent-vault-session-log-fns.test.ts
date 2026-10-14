import { S3ServiceException } from "@aws-sdk/client-s3";
import { describe, expect, test, vi } from "vitest";

import { AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { ObjectStorageError, toObjectStorageError } from "@app/services/object-storage/object-storage-errors";
import { ObjectStorageErrorReason, ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import { AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE } from "./agent-vault-session-log-constants";
import {
  buildSessionLogObjectName,
  chunkIdTimeMs,
  describeStorageFailure,
  getSessionLogEntitlement,
  getSessionLogRetentionDays,
  parseSessionLogObjectKey,
  toEffectiveSessionLogConfig,
  toRev,
  TSessionLogLicenseService
} from "./agent-vault-session-log-fns";

vi.mock("@app/lib/logger", () => ({ logger: { warn: () => {} } }));

describe("session log object names", () => {
  const orgId = "c4a1e0d2-5b7f-4c1e-9a3d-2f6b8e0c7a11";
  const sessionId = "5d2e9b41-0c3a-4f8e-b7d2-91a4c6e8f035";
  const proxyId = "e91f3c20-7d4b-4a8e-9f1c-3b5d7e2a6c48";
  const chunkId = "01a11226-9990-7a3f-8c21-4e6f9b2d1a07";
  const folder = `agent-vault-1/orgs/${orgId}/agent-vault/sessions/${sessionId}/logs/`;

  test("names a chunk by rev, chunk and proxy", () => {
    expect(buildSessionLogObjectName({ proxyId, chunkId })).toBe(`8208694117999_${chunkId}.${proxyId}.json.enc`);
  });

  test("reads the time out of the chunk id", () => {
    expect(chunkIdTimeMs(chunkId)).toBe(1791305882000);
  });

  test("a newer chunk sorts first, which is the only order S3 lists in", () => {
    expect(toRev(2_000) < toRev(1_000)).toBe(true);
    expect(toRev(1_000)).toHaveLength(13);
  });

  test("clamps a time outside what 13 digits can hold", () => {
    expect(toRev(-5)).toBe("9999999999999");
    expect(toRev(1e14)).toBe("0000000000000");
  });

  test("parses a name it built", () => {
    expect(parseSessionLogObjectKey(folder, `${folder}${buildSessionLogObjectName({ proxyId, chunkId })}`)).toEqual({
      chunkId,
      proxyId,
      lastRecordAt: new Date(1791305882000)
    });
  });

  test.each([
    {
      why: "another session's folder",
      key: `agent-vault-1/orgs/${orgId}/agent-vault/sessions/other/logs/8208694117999_${chunkId}.${proxyId}.json.enc`
    },
    { why: "a nested folder", key: `${folder}${proxyId}/2026-09-16/${chunkId}.json.enc` },
    { why: "a rev that disagrees with the chunk id", key: `${folder}8208694117998_${chunkId}.${proxyId}.json.enc` },
    { why: "a proxy that is not a uuid", key: `${folder}8208694117999_${chunkId}.proxy-1.json.enc` },
    { why: "a file someone else put there", key: `${folder}notes.txt` }
  ])("skips $why", ({ key }) => {
    expect(parseSessionLogObjectKey(folder, key)).toBeNull();
  });
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

describe("getSessionLogEntitlement", () => {
  type TPlan = { hasExternal: boolean; hasDefault: boolean; retentionDays?: number | null };
  const toPlan = ({ hasExternal, hasDefault, retentionDays = null }: TPlan) => ({
    agentVaultByoS3: hasExternal,
    agentVaultManagedStorage: hasDefault,
    agentVaultSessionLogRetentionDays: retentionDays
  });
  const licenseService = ({
    plan,
    fallback = false,
    lastKnown = null
  }: {
    plan: TPlan;
    fallback?: boolean;
    lastKnown?: { plan: TPlan; ageMs: number } | null;
  }) =>
    ({
      getPlan: async () => toPlan(plan),
      isServingFallbackPlan: async () => fallback,
      getLastKnownPlan: async () =>
        lastKnown ? { plan: toPlan(lastKnown.plan), fetchedAt: Date.now() - lastKnown.ageMs } : null
    }) as unknown as TSessionLogLicenseService;

  const free = { hasExternal: false, hasDefault: true };
  const paid = { hasExternal: true, hasDefault: true, retentionDays: 365 };
  const none = { hasExternal: false, hasDefault: false };

  test.each([
    { why: "a paid plan", service: { plan: paid }, expected: "licensed" },
    { why: "a real free plan", service: { plan: free }, expected: "unlicensed" },
    {
      why: "a fallback with a recent paid answer",
      service: { plan: free, fallback: true, lastKnown: { plan: paid, ageMs: 10 * 60_000 } },
      expected: "licensed"
    },
    {
      why: "a fallback with a recent free answer",
      service: { plan: free, fallback: true, lastKnown: { plan: free, ageMs: 10 * 60_000 } },
      expected: "unlicensed"
    },
    {
      why: "a fallback whose last answer is over an hour old",
      service: { plan: free, fallback: true, lastKnown: { plan: paid, ageMs: 61 * 60_000 } },
      expected: "unknown"
    },
    { why: "a fallback with no real answer on record", service: { plan: free, fallback: true }, expected: "unknown" }
  ])("external storage: reads $why as $expected", async ({ service, expected }) => {
    expect(
      (await getSessionLogEntitlement(licenseService(service), "org-1", ObjectStorageType.External)).entitlement
    ).toBe(expected);
  });

  test.each([
    { why: "a plan with default storage", service: { plan: free }, expected: "licensed" },
    { why: "a plan without it", service: { plan: none }, expected: "unlicensed" },
    {
      why: "a fallback whose recent real answer leaves it out",
      service: { plan: free, fallback: true, lastKnown: { plan: none, ageMs: 10 * 60_000 } },
      expected: "unlicensed"
    },
    {
      why: "a fallback with no real answer, which includes it",
      service: { plan: free, fallback: true },
      expected: "licensed"
    }
  ])("default storage: reads $why as $expected", async ({ service, expected }) => {
    expect(
      (await getSessionLogEntitlement(licenseService(service), "org-1", ObjectStorageType.Default)).entitlement
    ).toBe(expected);
  });

  test("during an outage, uploads keep the retention of the last real plan", async () => {
    const { plan } = await getSessionLogEntitlement(
      licenseService({ plan: free, fallback: true, lastKnown: { plan: paid, ageMs: 10 * 60_000 } }),
      "org-1",
      ObjectStorageType.Default
    );
    expect(getSessionLogRetentionDays(plan)).toBe(365);
  });

  test("after the first hour of an outage, retention still comes from the last real plan", async () => {
    const { entitlement, plan } = await getSessionLogEntitlement(
      licenseService({ plan: free, fallback: true, lastKnown: { plan: paid, ageMs: 3 * 60 * 60_000 } }),
      "org-1",
      ObjectStorageType.Default
    );
    expect(entitlement).toBe("licensed");
    expect(getSessionLogRetentionDays(plan)).toBe(365);
  });

  test("retention is 30 days when the plan doesn't say", () => {
    expect(getSessionLogRetentionDays({ agentVaultSessionLogRetentionDays: null })).toBe(30);
    expect(getSessionLogRetentionDays(null)).toBe(30);
  });
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

  test("a failure that isn't from S3 isn't treated as a storage problem", () => {
    const bug = new TypeError("undefined is not a function");
    expect(external(bug)).toBe(bug);
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
      message: "The AWS connection used for session logs no longer exists. Choose another on the Settings page."
    },
    {
      why: "a connection that isn't AWS",
      error: connectionError({ connectionName: "gh", connectionApp: "github" }),
      message: "The connection used for session logs is a github connection. Session logs require an AWS connection"
    },
    {
      why: "a role AWS refused",
      error: connectionError({ connectionName: "aws-prod", cause: "Not authorized to perform sts:AssumeRole" }),
      message: "Couldn't use the AWS connection 'aws-prod' for session logs: Not authorized to perform sts:AssumeRole"
    },
    {
      why: "AWS not answering",
      error: connectionError({ connectionName: "aws-prod" }, ObjectStorageErrorReason.Temporary),
      message: "Couldn't reach AWS to use the connection 'aws-prod' for session logs. Try again in a bit."
    }
  ])("names $why", ({ error, message }) => {
    expect(describeStorageFailure(error, "read").message).toBe(message);
    expect(describeStorageFailure(error, "check").message).toBe(message);
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
        message: AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE
      });
    }
  });
});
