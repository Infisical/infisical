import { S3ServiceException } from "@aws-sdk/client-s3";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { ProjectType } from "@app/db/schemas";
import { createS3Bucket } from "@app/lib/aws/s3";
import { DailyQuotaExceededError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { AppConnection, AWSRegion } from "@app/services/app-connection/app-connection-enums";
import { getAwsConnectionConfig } from "@app/services/app-connection/aws/aws-connection-fns";

import { ObjectStorageError } from "./object-storage-errors";
import { defineStorageNamespace } from "./object-storage-namespace-fns";
import { objectStorageServiceFactory } from "./object-storage-service";
import { ObjectStorageErrorReason, ObjectStorageType } from "./object-storage-types";

const ORG_ID = "c4a1e0d2-5b7f-4c1e-9a3d-2f6b8e0c7a11";
const CONNECTION_ID = "8a2f4c61-1d3e-4b5a-9c7f-0e6d2b8a4f13";

const instance = vi.hoisted(() => ({
  storage: null as null | { bucket: string; region: string; prefix: string | null; credentials?: unknown }
}));
vi.mock("@app/services/object-storage/object-storage-default-fns", () => ({
  getDefaultStorage: () => instance.storage,
  isDefaultStorageConfigured: () => instance.storage !== null
}));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnection: vi.fn(async (raw: object) => raw)
}));
vi.mock("@app/services/app-connection/aws/aws-connection-fns", () => ({
  getAwsConnectionConfig: vi.fn(async () => ({ credentials: { accessKeyId: "ASIA", secretAccessKey: "s" } }))
}));

const bucketClient = {
  presignCreateOnlyPut: vi.fn(async ({ key }: { key: string }) => `https://signed/${key}`),
  presignGet: vi.fn(async (key: string) => `https://signed/${key}`),
  listPage: vi.fn(async () => ({ objects: [], isTruncated: false })),
  checkListAccess: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: unknown }> => ({ ok: true })),
  writeTestObject: vi.fn(async (): Promise<{ ok: true } | { ok: false; error: unknown }> => ({ ok: true }))
};
vi.mock("@app/lib/aws/s3", () => ({
  AWS_REQUEST_TIMEOUTS: { requestTimeout: 15_000 },
  createS3Bucket: vi.fn(() => bucketClient)
}));

const site = vi.hoisted(() => ({ url: "https://app.example.com" as string | undefined, isCloud: true }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: site.url, isCloud: site.isCloud }) }));

const preflight = vi.hoisted(() => ({
  options: vi.fn(async () => ({
    status: 200,
    headers: { "access-control-allow-origin": "https://app.example.com" } as Record<string, string>
  })),
  get: vi.fn(async () => ({ status: 200 }))
}));
vi.mock("@app/lib/config/request", () => ({ request: preflight }));

const logs = defineStorageNamespace({
  id: "agent-vault.session-logs",
  product: ProjectType.AgentVault,
  path: "sessions/{sessionId}/logs/{file}"
});

const external = {
  storageType: ObjectStorageType.External as const,
  appConnectionId: CONNECTION_ID,
  bucket: "customer-bucket",
  region: AWSRegion.EU_WEST_1,
  keyPrefix: "inf-logs",
  projectType: ProjectType.AgentVault
};

const build = (opts: { connection?: unknown; admit?: (key: string, value: number) => Promise<number> } = {}) => {
  const connection =
    "connection" in opts
      ? opts.connection
      : { id: CONNECTION_ID, orgId: ORG_ID, app: AppConnection.AWS, name: "prod-logs" };
  const incrementByIfUnderLimitWithFixedExpiry = vi.fn(opts.admit ?? (async (_key: string, value: number) => value));
  const service = objectStorageServiceFactory({
    appConnectionDAL: { findById: vi.fn(async () => connection) } as never,
    kmsService: {} as never,
    keyStore: { incrementByIfUnderLimitWithFixedExpiry } as never
  });
  service.registerNamespaces([logs]);
  return { service, incrementByIfUnderLimitWithFixedExpiry };
};

const put = { name: "chunk.json.enc", bytes: 4096, sha256Base64: "abc=", expiresInSeconds: 300 };

beforeEach(() => {
  vi.clearAllMocks();
  site.url = "https://app.example.com";
  site.isCloud = true;
  instance.storage = { bucket: "instance-bucket", region: "us-east-1", prefix: "infisical" };
});

describe("default storage", () => {
  test("signs an upload under the instance prefix, the org and the product, tagged with the retention", async () => {
    const { service } = build();
    const location = await service.at({ storageType: ObjectStorageType.Default }).forOrg(ORG_ID);
    const { key } = await location
      .namespace(logs)
      .folder({ sessionId: "sess-1" })
      .presignPut({ ...put, retentionDays: 90 });

    expect(key).toBe(`infisical/orgs/${ORG_ID}/agent-vault/sessions/sess-1/logs/chunk.json.enc`);
    expect(createS3Bucket).toHaveBeenCalledWith({
      region: "us-east-1",
      bucket: "instance-bucket",
      credentials: null
    });
    expect(bucketClient.presignCreateOnlyPut).toHaveBeenCalledWith({
      key,
      contentLength: 4096,
      sha256Base64: "abc=",
      expiresInSeconds: 300,
      tagging: "retention=90d"
    });
  });

  test.each([undefined, null, 0, -3, 1.5])("retention %j falls back to 30 days", async (retentionDays) => {
    const { service } = build();
    const location = await service.at({ storageType: ObjectStorageType.Default }).forOrg(ORG_ID);
    await location
      .namespace(logs)
      .folder({ sessionId: "sess-1" })
      .presignPut({ ...put, retentionDays });
    expect(bucketClient.presignCreateOnlyPut).toHaveBeenCalledWith(
      expect.objectContaining({ tagging: "retention=30d" })
    );
  });

  test("reuses one client for the instance bucket", async () => {
    const { service } = build();
    await service.at({ storageType: ObjectStorageType.Default }).forOrg(ORG_ID);
    await service.at({ storageType: ObjectStorageType.Default }).forOrg("another-org");
    expect(createS3Bucket).toHaveBeenCalledTimes(1);
  });

  test("an instance without a bucket has no default storage", async () => {
    instance.storage = null;
    const { service } = build();
    await expect(service.at({ storageType: ObjectStorageType.Default }).forOrg(ORG_ID)).rejects.toMatchObject({
      reason: ObjectStorageErrorReason.Unconfigured
    });
  });

  test("has no bucket check or CORS probe, since the bucket is the operator's", async () => {
    const { service } = build();
    const namespace = (await service.at({ storageType: ObjectStorageType.Default }).forOrg(ORG_ID)).namespace(logs);
    await expect(namespace.check()).rejects.toThrow();
    await expect(namespace.presignCorsProbe(300)).rejects.toThrow();
  });
});

describe("external storage", () => {
  test("signs under the customer's prefix with no tag, and assumes the role with the product's external id", async () => {
    const { service } = build();
    const location = await service.at(external).forOrg(ORG_ID);
    const { key } = await location.namespace(logs).folder({ sessionId: "sess-1" }).presignPut(put);

    expect(key).toBe(`inf-logs/orgs/${ORG_ID}/agent-vault/sessions/sess-1/logs/chunk.json.enc`);
    expect(bucketClient.presignCreateOnlyPut).toHaveBeenCalledWith(expect.objectContaining({ tagging: undefined }));
    expect(getAwsConnectionConfig).toHaveBeenCalledWith(
      expect.objectContaining({ projectType: ProjectType.AgentVault }),
      AWSRegion.EU_WEST_1,
      { stsRequestHandler: { requestTimeout: 15_000 } }
    );
  });

  test.each([
    { why: "a missing connection", connection: undefined },
    { why: "another org's connection", connection: { id: CONNECTION_ID, orgId: "other-org", app: AppConnection.AWS } }
  ])("$why reads as missing", async ({ connection }) => {
    const { service } = build({ connection });
    await expect(service.at(external).forOrg(ORG_ID)).rejects.toMatchObject({
      reason: ObjectStorageErrorReason.ConnectionInvalid,
      details: expect.objectContaining({ isConnectionMissing: true }) as unknown
    });
  });

  test("a connection that isn't AWS is refused, naming its app", async () => {
    const { service } = build({
      connection: { id: CONNECTION_ID, orgId: ORG_ID, app: AppConnection.GitHub, name: "gh" }
    });
    await expect(service.at(external).forOrg(ORG_ID)).rejects.toMatchObject({
      reason: ObjectStorageErrorReason.ConnectionInvalid,
      details: expect.objectContaining({ connectionApp: AppConnection.GitHub }) as unknown
    });
  });

  test("AWS not answering while assuming the role is temporary", async () => {
    vi.mocked(getAwsConnectionConfig).mockRejectedValueOnce(
      Object.assign(new Error("timed out"), { name: "TimeoutError" })
    );
    const { service } = build();
    await expect(service.at(external).forOrg(ORG_ID)).rejects.toMatchObject({
      reason: ObjectStorageErrorReason.Temporary
    });
  });

  test("any other failure loading the connection says it couldn't load its credentials", async () => {
    vi.mocked(getAwsConnectionConfig).mockRejectedValueOnce(new TypeError("bad blob"));
    const { service } = build();
    await expect(service.at(external).forOrg(ORG_ID)).rejects.toMatchObject({
      reason: ObjectStorageErrorReason.ConnectionInvalid,
      details: expect.objectContaining({ cause: "Infisical could not load its credentials" }) as unknown
    });
  });

  test("the bucket check lists the product folder, then writes .check there", async () => {
    const { service } = build();
    const namespace = (await service.at(external).forOrg(ORG_ID)).namespace(logs);
    await namespace.check();
    expect(bucketClient.checkListAccess).toHaveBeenCalledWith(`inf-logs/orgs/${ORG_ID}/agent-vault/`);
    expect(bucketClient.writeTestObject).toHaveBeenCalledWith(`inf-logs/orgs/${ORG_ID}/agent-vault/.check`);
  });

  test("a bucket check that can't write says which step failed", async () => {
    bucketClient.writeTestObject.mockResolvedValueOnce({
      ok: false,
      error: new S3ServiceException({ name: "AccessDenied", $fault: "client", $metadata: {}, message: "denied" })
    });
    const { service } = build();
    const namespace = (await service.at(external).forOrg(ORG_ID)).namespace(logs);
    await expect(namespace.check()).rejects.toMatchObject({
      reason: ObjectStorageErrorReason.AccessDenied,
      details: expect.objectContaining({ step: "write" }) as unknown
    });
  });

  test("the CORS probe is a link to .cors-probe in the product folder", async () => {
    const { service } = build();
    const namespace = (await service.at(external).forOrg(ORG_ID)).namespace(logs);
    expect(await namespace.presignCorsProbe(300)).toBe(
      `https://signed/inf-logs/orgs/${ORG_ID}/agent-vault/.cors-probe`
    );
  });
});

describe("folders", () => {
  test("refuses a namespace that was never registered", async () => {
    const { service } = build();
    const location = await service.at(external).forOrg(ORG_ID);
    const stray = defineStorageNamespace({ id: "stray", product: ProjectType.AgentVault, path: "stray/{file}" });
    expect(() => location.namespace(stray)).toThrow("without being registered");
  });

  test("won't sign a download outside the folder", async () => {
    const { service } = build();
    const folder = (await service.at(external).forOrg(ORG_ID)).namespace(logs).folder({ sessionId: "sess-1" });
    await expect(
      folder.presignGet(`inf-logs/orgs/${ORG_ID}/agent-vault/sessions/sess-2/logs/x`, 300)
    ).rejects.toThrow();
  });

  test("a listing that S3 refuses becomes a storage error", async () => {
    bucketClient.listPage.mockRejectedValueOnce(
      new S3ServiceException({ name: "NoSuchBucket", $fault: "client", $metadata: {}, message: "gone" })
    );
    const { service } = build();
    const folder = (await service.at(external).forOrg(ORG_ID)).namespace(logs).folder({ sessionId: "sess-1" });
    const error = await folder.list({ maxKeys: 10 }).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(ObjectStorageError);
    expect(error).toMatchObject({ reason: ObjectStorageErrorReason.BucketNotFound });
  });

  test("registering a namespace that breaks the naming rules fails", () => {
    const { service } = build();
    expect(() =>
      service.registerNamespaces([
        defineStorageNamespace({
          id: "agent-vault.attachments",
          product: ProjectType.AgentVault,
          path: "sessions/{sessionId}/{file}"
        })
      ])
    ).toThrow('ends in "sessions"');
  });
});

describe("the daily cap", () => {
  const presign = async (
    service: ReturnType<typeof build>["service"],
    bytes: number,
    config: Parameters<ReturnType<typeof build>["service"]["at"]>[0] = { storageType: ObjectStorageType.Default }
  ) =>
    (await service.at(config).forOrg(ORG_ID))
      .namespace(logs)
      .folder({ sessionId: "sess-1" })
      .presignPut({ ...put, bytes });

  test("counts each upload as at least 16 KiB against the org's UTC day", async () => {
    const { service, incrementByIfUnderLimitWithFixedExpiry } = build();
    await presign(service, 100);
    const day = new Date().toISOString().slice(0, 10);
    expect(incrementByIfUnderLimitWithFixedExpiry).toHaveBeenCalledWith(
      `object-storage:daily-bytes:${ORG_ID}:${day}`,
      16 * 1024,
      1024 * 1024 * 1024,
      2 * 24 * 60 * 60
    );
    await presign(service, 5_000_000);
    expect(incrementByIfUnderLimitWithFixedExpiry).toHaveBeenLastCalledWith(
      expect.any(String),
      5_000_000,
      expect.any(Number),
      expect.any(Number)
    );
  });

  test("over the cap, the link is refused with a 429", async () => {
    const { service } = build({ admit: async () => -1 });
    await expect(presign(service, 4096)).rejects.toBeInstanceOf(DailyQuotaExceededError);
  });

  test("a link that fails to sign is not counted against the cap", async () => {
    const { service, incrementByIfUnderLimitWithFixedExpiry } = build();
    bucketClient.presignCreateOnlyPut.mockRejectedValueOnce(new Error("Could not load credentials"));
    await expect(presign(service, 4096)).rejects.toThrow();
    expect(incrementByIfUnderLimitWithFixedExpiry).not.toHaveBeenCalled();
  });

  test("when Redis doesn't answer within 250 ms, the upload is allowed", async () => {
    const { service } = build({ admit: () => new Promise<number>(() => {}) });
    const started = Date.now();
    await expect(presign(service, 4096)).resolves.toHaveProperty("url");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  test("when Redis fails, the upload is allowed", async () => {
    const { service } = build({ admit: async () => Promise.reject(new Error("redis is down")) });
    await expect(presign(service, 4096)).resolves.toHaveProperty("url");
  });

  test("an external bucket belongs to the customer, so it isn't counted", async () => {
    const { service, incrementByIfUnderLimitWithFixedExpiry } = build({ admit: async () => -1 });
    await expect(presign(service, 4096, external)).resolves.toHaveProperty("url");
    expect(incrementByIfUnderLimitWithFixedExpiry).not.toHaveBeenCalled();
  });

  test("a self-hosted instance's default storage is its own bucket, so it isn't counted", async () => {
    site.isCloud = false;
    const { service, incrementByIfUnderLimitWithFixedExpiry } = build({ admit: async () => -1 });
    await expect(presign(service, 4096)).resolves.toHaveProperty("url");
    expect(incrementByIfUnderLimitWithFixedExpiry).not.toHaveBeenCalled();
  });
});

describe("the startup check of default storage", () => {
  const denied = new S3ServiceException({
    name: "AccessDenied",
    $fault: "client",
    $metadata: { httpStatusCode: 403 },
    message: "denied"
  });

  test("does nothing on an instance without a bucket", async () => {
    instance.storage = null;
    const { service } = build();
    await service.checkDefaultStorage();
    expect(bucketClient.checkListAccess).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("lists the orgs folder, writes a tagged test file there, reads it back and checks browsers may download", async () => {
    const { service } = build();
    await service.checkDefaultStorage();
    expect(bucketClient.checkListAccess).toHaveBeenCalledWith("infisical/orgs/");
    expect(bucketClient.writeTestObject).toHaveBeenCalledWith("infisical/orgs/.check", "retention=30d");
    expect(preflight.get).toHaveBeenCalledWith("https://signed/infisical/orgs/.check", expect.anything());
    expect(preflight.options).toHaveBeenCalledWith(
      "https://signed/infisical/orgs/.cors-probe",
      expect.objectContaining({
        headers: { Origin: "https://app.example.com", "Access-Control-Request-Method": "GET" }
      })
    );
    expect(logger.error).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("default storage is ready"));
  });

  test("logs a missing CORS rule, which nothing else would ever report", async () => {
    preflight.options.mockResolvedValueOnce({ status: 403, headers: {} });
    const { service } = build();
    await service.checkDefaultStorage();
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining("doesn't allow browsers at https://app.example.com")
    );
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("default storage is ready"));
  });

  test("logs a missing s3:GetObject, which would otherwise only show as refused downloads", async () => {
    preflight.get.mockResolvedValueOnce({ status: 403 });
    const { service } = build();
    await service.checkDefaultStorage();
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("grant s3:GetObject"));
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining("default storage is ready"));
  });

  test("skips the CORS check without a SITE_URL to check for", async () => {
    site.url = undefined;
    const { service } = build();
    await service.checkDefaultStorage();
    expect(preflight.options).not.toHaveBeenCalled();
    expect(logger.error).not.toHaveBeenCalled();
  });

  test("logs which step failed, so the operator can fix the IAM policy", async () => {
    bucketClient.writeTestObject.mockResolvedValueOnce({ ok: false, error: denied });
    const { service } = build();
    await service.checkDefaultStorage();
    expect(logger.error).toHaveBeenCalledWith(denied, expect.stringContaining("refused a tagged test write"));
    expect(logger.error).toHaveBeenCalledWith(denied, expect.stringContaining("[error=AccessDenied]"));
  });

  test("stops at a bucket it can't list", async () => {
    bucketClient.checkListAccess.mockResolvedValueOnce({ ok: false, error: denied });
    const { service } = build();
    await service.checkDefaultStorage();
    expect(logger.error).toHaveBeenCalledWith(denied, expect.stringContaining("can't be listed"));
    expect(bucketClient.writeTestObject).not.toHaveBeenCalled();
  });
});
