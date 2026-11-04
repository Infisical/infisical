import { S3ServiceException } from "@aws-sdk/client-s3";
import { createMongoAbility } from "@casl/ability";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError, DailyQuotaExceededError, InternalServerError } from "@app/lib/errors";
import { ObjectStorageError, toObjectStorageError } from "@app/services/object-storage/object-storage-errors";
import { ObjectStorageErrorReason, ObjectStorageType } from "@app/services/object-storage/object-storage-types";

import {
  AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_NOT_ON_PLAN,
  AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_MESSAGE,
  AGENT_VAULT_SESSION_LOG_EXTERNAL_STORAGE_NOT_ON_PLAN,
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES,
  AGENT_VAULT_SESSION_LOG_RANGE_MARGIN_MS,
  AGENT_VAULT_SESSION_LOG_STORAGE_NEEDS_ADMIN_MESSAGE,
  AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE
} from "./agent-vault-session-log-constants";
import { encodeHistoryCursor, encodeTailCursor } from "./agent-vault-session-log-cursor-fns";
import {
  AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE,
  AgentVaultSessionLogErrorName
} from "./agent-vault-session-log-enums";
import { buildSessionLogObjectName, toRev } from "./agent-vault-session-log-fns";
import { unwrapSessionLogKey } from "./agent-vault-session-log-secrets";
import { agentVaultSessionLogServiceFactory } from "./agent-vault-session-log-service";
import { TCreateChunkUploadUrlDTO, TUpdateSessionLogSettingsDTO } from "./agent-vault-session-log-types";

const PROJECT_ID = "c4a1e0d2-5b7f-4c1e-9a3d-2f6b8e0c7a11";
const SESSION_ID = "5d2e9b41-0c3a-4f8e-b7d2-91a4c6e8f035";
const PROXY_ID = "e91f3c20-7d4b-4a8e-9f1c-3b5d7e2a6c48";
const CONNECTION_ID = "8a2f4c61-1d3e-4b5a-9c7f-0e6d2b8a4f13";
const folderFor = (sessionId: string) => `logs/orgs/org-1/agent-vault/sessions/${sessionId}/logs/`;
const FOLDER = folderFor(SESSION_ID);

const defaultStorage = vi.hoisted(() => ({ configured: false }));
vi.mock("@app/services/object-storage/object-storage-default-fns", () => ({
  isDefaultStorageConfigured: () => defaultStorage.configured
}));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ isCloud: true }) }));
vi.mock("./agent-vault-session-log-secrets", () => ({ unwrapSessionLogKey: vi.fn(async () => Buffer.alloc(32, 7)) }));

const presignPut = vi.fn(async ({ name }: { name: string }) => ({
  key: `${FOLDER}${name}`,
  url: "https://bucket.s3.amazonaws.com/signed-put"
}));
const presignGet = vi.fn(async (key: string) => `https://bucket.s3.amazonaws.com/${key}`);
const list = vi.fn(async () => ({ objects: [] as { key: string; size: number }[], isTruncated: false }));
const listAccess = vi.fn(async () => {});
const check = vi.fn(async () => {});
const presignCorsProbe = vi.fn(async () => "https://bucket.s3.amazonaws.com/probe");
const forOrg = vi.fn(async () => ({
  bucket: "my-bucket",
  namespace: () => ({
    listAccess,
    check,
    presignCorsProbe,
    folder: ({ sessionId }: { sessionId: string }) => ({
      prefix: folderFor(sessionId),
      presignPut,
      list,
      presignGet
    })
  })
}));
const at = vi.fn(() => ({ forOrg }));

const PROXY = { id: PROXY_ID, name: "proxy-one", projectId: PROJECT_ID, orgId: "org-1" };

const liveSession = () => ({
  id: SESSION_ID,
  projectId: PROJECT_ID,
  userId: "user-1",
  identityId: null,
  expiresAt: null,
  revokedAt: null,
  updatedAt: new Date(Date.now() - 60_000),
  encryptedSessionLogKey: Buffer.alloc(32)
});

const enabledConfig = () => ({
  id: "cfg-1",
  projectId: PROJECT_ID,
  enabled: true,
  storageType: "external",
  appConnectionId: CONNECTION_ID,
  bucket: "my-bucket",
  region: "us-east-1",
  keyPrefix: "logs"
});

const defaultRow = (enabled: boolean) => ({
  id: "cfg-1",
  projectId: PROJECT_ID,
  enabled,
  storageType: "default",
  appConnectionId: null,
  bucket: null,
  region: null,
  keyPrefix: null
});

const externalStorage = (fields: Record<string, unknown> = {}) => ({
  type: ObjectStorageType.External,
  appConnectionId: CONNECTION_ID,
  bucket: "my-bucket",
  region: "us-east-1",
  keyPrefix: "logs",
  ...fields
});

// The id carries the time of the chunk's last request, which Infisical checks against endedAt.
const validChunk = (endedAt = new Date(Date.now() - 1_000)) => ({
  chunkId: uuidv7({ msecs: endedAt.getTime() }),
  endedAt,
  ciphertextBytes: 4096,
  ciphertextSha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"
});

const objectFor = (lastRecordAtMs: number, proxyId = PROXY_ID) => {
  const chunkId = uuidv7({ msecs: lastRecordAtMs });
  return { chunkId, key: `${FOLDER}${buildSessionLogObjectName({ proxyId, chunkId })}` };
};

type TFeedEntry = [string, string[]];
type TPlan = { hasExternal?: boolean; hasDefault?: boolean; retentionDays?: number | null };

type TOverrides = {
  proxy?: unknown;
  session?: unknown;
  config?: unknown;
  feed?: TFeedEntry[];
  feedAddFails?: boolean;
  feedAddHangs?: boolean;
  isAdmin?: boolean;
  plan?: TPlan;
  planFallback?: boolean;
  lastKnownPlan?: { plan: TPlan; ageMs: number } | null;
};

const toPlan = ({ hasExternal = true, hasDefault = true, retentionDays = null }: TPlan = {}) => ({
  agentVaultByoS3: hasExternal,
  agentVaultManagedStorage: hasDefault,
  agentVaultSessionLogRetentionDays: retentionDays
});

const build = (overrides: TOverrides = {}) => {
  const validateConnection = vi.fn(async () => ({ name: "prod-logs" }));
  const config = "config" in overrides ? overrides.config : enabledConfig();
  const upsertConfig = vi.fn(async ([values]: Record<string, unknown>[]) => [{ id: "cfg-1", ...values }]);
  const streamAdd = vi.fn(async () => {
    if (overrides.feedAddHangs) return new Promise<string>(() => {});
    return overrides.feedAddFails ? Promise.reject(new Error("redis is down")) : "1791278402731-0";
  });
  const findSession = vi.fn(async () => ("session" in overrides ? overrides.session : liveSession()));
  const streamRange = vi.fn(async () => overrides.feed ?? []);

  const service = agentVaultSessionLogServiceFactory({
    agentVaultSessionLogConfigDAL: {
      findOne: vi.fn(async () => config),
      findByProjectIdFromPrimary: vi.fn(async () => config),
      upsert: upsertConfig
    } as never,
    agentVaultSessionDAL: { findOne: findSession } as never,
    agentVaultProxyDAL: {
      findByIdWithOrg: vi.fn(async () => ("proxy" in overrides ? overrides.proxy : PROXY))
    } as never,
    appConnectionDAL: { findById: vi.fn(async () => ({ name: "prod-logs" })) } as never,
    appConnectionService: { validateAppConnectionUsageById: validateConnection } as never,
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility([{ action: "read", subject: "agent-vault-sessions" }]),
        hasRole: () => overrides.isAdmin ?? true
      }))
    } as never,
    kmsService: {} as never,
    licenseService: {
      getPlan: vi.fn(async () => toPlan(overrides.plan)),
      isServingFallbackPlan: vi.fn(async () => overrides.planFallback ?? false),
      getLastKnownPlan: vi.fn(async () =>
        overrides.lastKnownPlan
          ? { plan: toPlan(overrides.lastKnownPlan.plan), fetchedAt: Date.now() - overrides.lastKnownPlan.ageMs }
          : null
      )
    } as never,
    keyStore: { streamAdd, streamRange } as never,
    objectStorage: { at } as never
  });

  return { service, validateConnection, upsertConfig, streamAdd, streamRange, findSession };
};

const record = (
  service: ReturnType<typeof build>["service"],
  chunk: TCreateChunkUploadUrlDTO["chunk"] = validChunk()
) => service.createChunkUploadUrl({ proxyId: PROXY_ID, sessionId: SESSION_ID, chunk });

const ctx = { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never;
const actor = { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never;
const scope = { projectId: PROJECT_ID, ctx, sessionId: SESSION_ID };

// The route's schema already shapes the body, so tests pass plain objects.
const save = (service: ReturnType<typeof build>["service"], patch: Record<string, unknown>) =>
  service.updateSessionLogSettings({
    projectId: PROJECT_ID,
    ctx,
    actor,
    ...patch
  } as unknown as TUpdateSessionLogSettingsDTO);

const s3Error = (name: string, fault: "client" | "server" = "client") =>
  new S3ServiceException({ name, $fault: fault, $metadata: {}, message: name });
const storageError = (error: Error, storageType = ObjectStorageType.External) =>
  toObjectStorageError(error, { storageType, bucket: "my-bucket", region: "us-east-1", step: "list" });
const connectionUnusable = new ObjectStorageError({
  reason: ObjectStorageErrorReason.ConnectionInvalid,
  storageType: ObjectStorageType.External,
  details: { connectionName: "prod-logs", cause: "AccessDenied" }
});

beforeEach(() => {
  vi.clearAllMocks();
  defaultStorage.configured = false;
  list.mockResolvedValue({ objects: [], isTruncated: false });
});

describe("createChunkUploadUrl: who is allowed to write", () => {
  test("a happy path signs the chunk's name in the session's folder and adds it to the live feed", async () => {
    const { service, streamAdd } = build();
    const chunk = validChunk();
    const result = await record(service, chunk);

    expect(result.uploadUrl).toBe("https://bucket.s3.amazonaws.com/signed-put");
    expect(result.chunkId).toBe(chunk.chunkId);

    expect(at).toHaveBeenCalledWith({
      storageType: ObjectStorageType.External,
      appConnectionId: CONNECTION_ID,
      bucket: "my-bucket",
      region: "us-east-1",
      keyPrefix: "logs",
      projectType: "agent-vault"
    });
    expect(forOrg).toHaveBeenCalledWith("org-1");
    const name = buildSessionLogObjectName({ proxyId: PROXY_ID, chunkId: chunk.chunkId });
    expect(presignPut).toHaveBeenCalledWith({
      name,
      bytes: 4096,
      sha256Base64: `${chunk.ciphertextSha256}=`,
      expiresInSeconds: 300,
      retentionDays: 30
    });
    expect(streamAdd).toHaveBeenCalledWith(
      `agent-vault-session-log-feed:${SESSION_ID}`,
      "*",
      { key: `${FOLDER}${name}`, bucket: "my-bucket", bytes: "4096" },
      10,
      120,
      true
    );
  });

  test("with nothing saved and an instance bucket, a chunk goes to default storage with the plan's retention", async () => {
    defaultStorage.configured = true;
    const { service } = build({ config: undefined, plan: { retentionDays: 90 } });
    await record(service);
    expect(at).toHaveBeenCalledWith({ storageType: ObjectStorageType.Default });
    expect(presignPut).toHaveBeenCalledWith(expect.objectContaining({ retentionDays: 90 }));
  });

  test("an unknown proxy is a 404 that says nothing about the session", async () => {
    const { service } = build({ proxy: undefined });
    await expect(record(service)).rejects.toMatchObject({ message: "Session not found" });
  });

  test("looks the session up in the proxy's own project, so another project's session reads as missing", async () => {
    const { service, findSession } = build({ session: undefined });
    await expect(record(service)).rejects.toMatchObject({ message: "Session not found" });
    expect(findSession).toHaveBeenCalledWith({ id: SESSION_ID, projectId: PROJECT_ID });
  });
});

describe("createChunkUploadUrl: the retirement grace window", () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  test.each([
    { why: "revoked an hour ago", session: { revokedAt: hoursAgo(1), expiresAt: null } },
    { why: "expired an hour ago", session: { revokedAt: null, expiresAt: hoursAgo(1) } },
    { why: "revoked 23 hours ago", session: { revokedAt: hoursAgo(23), expiresAt: null } }
  ])("still accepts a chunk from a session $why", async ({ session }) => {
    const { service } = build({ session: { ...liveSession(), ...session } });
    await expect(record(service)).resolves.toHaveProperty("uploadUrl");
  });

  test.each([
    { why: "revoked", session: { revokedAt: hoursAgo(25), expiresAt: null } },
    { why: "expired", session: { revokedAt: null, expiresAt: hoursAgo(25) } }
  ])("refuses a chunk from a session $why more than a day ago", async ({ session }) => {
    const { service } = build({ session: { ...liveSession(), ...session } });
    await expect(record(service)).rejects.toMatchObject({
      message: "Session ended too long ago to accept session logs"
    });
  });

  test("retirement is the earlier of revoked and expired, so a long-expired session stays closed", async () => {
    const { service } = build({
      session: { ...liveSession(), revokedAt: new Date(Date.now() - 60_000), expiresAt: hoursAgo(24 * 7) }
    });
    await expect(record(service)).rejects.toMatchObject({
      message: "Session ended too long ago to accept session logs"
    });
  });

  test("a session whose owner was deleted still accepts what the proxy held, for a day", async () => {
    const { service } = build({
      session: { ...liveSession(), userId: null, identityId: null, updatedAt: hoursAgo(23) }
    });
    await expect(record(service)).resolves.toHaveProperty("uploadUrl");
  });

  test("a session whose owner was deleted more than a day ago is refused", async () => {
    const { service } = build({
      session: { ...liveSession(), userId: null, identityId: null, updatedAt: hoursAgo(25) }
    });
    await expect(record(service)).rejects.toMatchObject({
      message: "Session ended too long ago to accept session logs"
    });
  });
});

describe("createChunkUploadUrl: when session logs are off", () => {
  test.each([
    { why: "nothing is saved and the instance has no bucket", config: undefined },
    { why: "the switch is off", config: { ...enabledConfig(), enabled: false } },
    { why: "a saved default choice has no instance bucket", config: defaultRow(true) },
    { why: "an external row has no bucket", config: { ...enabledConfig(), bucket: null } }
  ])("refuses with the named error when $why", async ({ config }) => {
    const { service } = build({ config });
    await expect(record(service)).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.Disabled });
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("a saved default choice that is off stays off when the instance has a bucket", async () => {
    defaultStorage.configured = true;
    const { service } = build({ config: defaultRow(false) });
    await expect(record(service)).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.Disabled });
  });
});

describe("createChunkUploadUrl: the proxy's clock", () => {
  test("a proxy clock too far ahead is refused with the named error, saying how far", async () => {
    const { service } = build();
    const refusal = record(service, validChunk(new Date(Date.now() + 10 * 60_000)));
    await expect(refusal).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.ClockSkew });
    await expect(refusal).rejects.toThrow(/about 10 minutes ahead/);
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("a small clock skew forward is tolerated", async () => {
    const { service } = build();
    await expect(record(service, validChunk(new Date(Date.now() + 60_000)))).resolves.toBeTruthy();
  });

  test("a proxy clock more than 30 days behind is refused with the named error", async () => {
    const { service } = build();
    const refusal = record(service, validChunk(new Date(Date.now() - 31 * 24 * 60 * 60_000)));
    await expect(refusal).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.ClockSkew });
    await expect(refusal).rejects.toThrow(/more than 30 days behind/);
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("a proxy clock a few days behind is tolerated", async () => {
    const { service } = build();
    await expect(record(service, validChunk(new Date(Date.now() - 3 * 24 * 60 * 60_000)))).resolves.toBeTruthy();
  });
});

describe("createChunkUploadUrl: what the chunk says about itself", () => {
  test("a chunk whose id time is minutes off its endedAt is refused before it is signed", async () => {
    const { service, streamAdd } = build();
    const endedAt = new Date(Date.now() - 1_000);
    const chunk = { ...validChunk(endedAt), chunkId: uuidv7({ msecs: endedAt.getTime() - 5 * 60_000 }) };
    await expect(record(service, chunk)).rejects.toThrow("The chunk ID's time must match the chunk's endedAt");
    expect(presignPut).not.toHaveBeenCalled();
    expect(streamAdd).not.toHaveBeenCalled();
  });

  test("an endedAt that rounds differently from the id is still accepted", async () => {
    const { service } = build();
    const endedAt = new Date(Date.now() - 1_000);
    const chunk = { ...validChunk(endedAt), chunkId: uuidv7({ msecs: endedAt.getTime() - 500 }) };
    await expect(record(service, chunk)).resolves.toBeTruthy();
  });

  test("a chunk from a CLI that still sends the IV is refused with a message that says to update it", async () => {
    const { service, streamAdd } = build();
    await expect(record(service, { ...validChunk(), iv: "AAAAAAAAAAAAAAAA" })).rejects.toThrow(
      "This proxy's Infisical CLI is too old to record session logs. Update the Infisical CLI on this machine."
    );
    expect(presignPut).not.toHaveBeenCalled();
    expect(streamAdd).not.toHaveBeenCalled();
  });

  test("a chunk id another proxy also used lands under that proxy's own name", async () => {
    const chunk = validChunk();
    const { service } = build();
    await record(service, chunk);
    const otherProxyId = "0b5c8f2a-3d1e-4c7b-9a6f-2e8d4b1c7f30";
    const { service: other } = build({ proxy: { ...PROXY, id: otherProxyId } });
    await other.createChunkUploadUrl({ proxyId: otherProxyId, sessionId: SESSION_ID, chunk });
    const [first, second] = presignPut.mock.calls.map(([args]) => args.name);
    expect(first).not.toBe(second);
  });
});

describe("createChunkUploadUrl: the live feed", () => {
  test("a feed that can't be written still hands out the upload url", async () => {
    const { service } = build({ feedAddFails: true });
    await expect(record(service)).resolves.toMatchObject({ uploadUrl: "https://bucket.s3.amazonaws.com/signed-put" });
  });

  test("an upload never waits on Redis, even when it doesn't answer", async () => {
    const { service } = build({ feedAddHangs: true });
    await expect(record(service)).resolves.toMatchObject({ uploadUrl: "https://bucket.s3.amazonaws.com/signed-put" });
  });
});

describe("createChunkUploadUrl: when storage can't be used", () => {
  test("an unusable connection is a retryable 500 without the connection's details", async () => {
    forOrg.mockRejectedValueOnce(connectionUnusable);
    const { service } = build();
    const error = (await record(service).catch((err: unknown) => err)) as Error;
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error.message).toBe(
      "Session logs can't use their AWS connection right now. An Agent Vault admin can check it in Settings."
    );
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("default storage that can't be reached is retryable too, and says so in its own words", async () => {
    defaultStorage.configured = true;
    forOrg.mockRejectedValueOnce(storageError(s3Error("AccessDenied"), ObjectStorageType.Default));
    const { service } = build({ config: undefined });
    await expect(record(service)).rejects.toMatchObject({
      name: "InternalServerError",
      message: "Session logs can't reach default storage right now. The proxy keeps the chunk and retries."
    });
  });

  test("the daily cap's 429 reaches the proxy as it is", async () => {
    presignPut.mockRejectedValueOnce(new DailyQuotaExceededError({}));
    const { service } = build();
    await expect(record(service)).rejects.toBeInstanceOf(DailyQuotaExceededError);
  });
});

describe("createChunkUploadUrl: the plan for the storage in use", () => {
  test("external storage without its flag tells the proxy logging is off", async () => {
    const { service } = build({ plan: { hasExternal: false } });
    await expect(record(service)).rejects.toMatchObject({
      name: AgentVaultSessionLogErrorName.Disabled,
      message: AGENT_VAULT_SESSION_LOG_EXTERNAL_STORAGE_NOT_ON_PLAN
    });
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("default storage without its flag tells the proxy logging is off", async () => {
    defaultStorage.configured = true;
    const { service } = build({ config: undefined, plan: { hasDefault: false } });
    await expect(record(service)).rejects.toMatchObject({
      name: AgentVaultSessionLogErrorName.Disabled,
      message: AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_NOT_ON_PLAN
    });
  });

  test("while the License Server is down, a chunk from a paid org is accepted on its last known plan", async () => {
    const { service } = build({
      plan: { hasExternal: false },
      planFallback: true,
      lastKnownPlan: { plan: { hasExternal: true }, ageMs: 10 * 60_000 }
    });
    await record(service);
    expect(presignPut).toHaveBeenCalledTimes(1);
  });

  test("while the License Server is down, default storage keeps the retention of the last real plan", async () => {
    defaultStorage.configured = true;
    const { service } = build({
      config: undefined,
      planFallback: true,
      lastKnownPlan: { plan: { retentionDays: 365 }, ageMs: 10 * 60_000 }
    });
    await record(service);
    expect(presignPut).toHaveBeenCalledWith(expect.objectContaining({ retentionDays: 365 }));
  });

  test("a chunk is held, not refused, when there is no recent real answer", async () => {
    const { service } = build({
      plan: { hasExternal: false },
      planFallback: true,
      lastKnownPlan: { plan: { hasExternal: true }, ageMs: 2 * 60 * 60_000 }
    });
    await expect(record(service)).rejects.toMatchObject({ name: "InternalServerError" });
    expect(presignPut).not.toHaveBeenCalled();
  });
});

describe("reading logs when storage can't be used", () => {
  const storageUnavailable = (message: string): unknown =>
    expect.objectContaining({ name: AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE, message });

  test("a read fails with the named error and tells an admin why", async () => {
    forOrg.mockRejectedValueOnce(connectionUnusable);
    const { service } = build();
    const error = await service.listSessionLogs(scope).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestError);
    expect(error).toEqual(
      storageUnavailable("Couldn't use the AWS connection 'prod-logs' for session logs: AccessDenied")
    );
  });

  test("a live read fails too, so the caller keeps its cursor and nothing is skipped", async () => {
    forOrg.mockRejectedValueOnce(connectionUnusable);
    const { key } = objectFor(Date.now());
    const { service } = build({ feed: [["1791278402731-0", ["key", key, "bucket", "my-bucket", "bytes", "4096"]]] });
    await expect(service.tailSessionLogs({ ...scope, cursor: "1791278402000-0" })).rejects.toEqual(
      storageUnavailable("Couldn't use the AWS connection 'prod-logs' for session logs: AccessDenied")
    );
  });

  test("a member who isn't an admin is told to ask an admin, without the AWS error", async () => {
    forOrg.mockRejectedValueOnce(connectionUnusable);
    const { service } = build({ isAdmin: false });
    await expect(service.listSessionLogs(scope)).rejects.toEqual(
      storageUnavailable(AGENT_VAULT_SESSION_LOG_STORAGE_NEEDS_ADMIN_MESSAGE)
    );
  });

  test("a member who isn't an admin gets no bucket detail when listing fails", async () => {
    list.mockRejectedValueOnce(storageError(s3Error("AccessDenied")));
    const { service } = build({ isAdmin: false });
    await expect(service.listSessionLogs(scope)).rejects.toEqual(
      storageUnavailable(AGENT_VAULT_SESSION_LOG_STORAGE_NEEDS_ADMIN_MESSAGE)
    );
  });

  test("a member who isn't an admin is told to try again when S3 isn't responding", async () => {
    list.mockRejectedValueOnce(storageError(s3Error("SlowDown", "server")));
    const { service } = build({ isAdmin: false });
    const error = await service.listSessionLogs(scope).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error).toEqual(storageUnavailable(AGENT_VAULT_SESSION_LOG_STORAGE_UNAVAILABLE_MESSAGE));
  });

  test("a bucket that refuses to list is a 400 that points at s3:ListBucket", async () => {
    list.mockRejectedValueOnce(storageError(s3Error("AccessDenied")));
    const { service } = build();
    const error = await service.listSessionLogs(scope).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(BadRequestError);
    expect((error as Error).message).toContain("s3:ListBucket");
  });

  test("an S3 that isn't responding is a 500, so callers know to try again", async () => {
    list.mockRejectedValueOnce(storageError(s3Error("SlowDown", "server")));
    const { service } = build();
    const error = await service.listSessionLogs(scope).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(InternalServerError);
    expect(error).toEqual(
      storageUnavailable(
        "Infisical couldn't list session logs in bucket 'my-bucket' (SlowDown). S3 isn't responding. Try again in a bit."
      )
    );
  });

  test.each([true, false])(
    "default storage that can't be read is a 500 pointing to Infisical support, for admins and others (admin: %s)",
    async (isAdmin) => {
      defaultStorage.configured = true;
      list.mockRejectedValueOnce(storageError(s3Error("AccessDenied"), ObjectStorageType.Default));
      const { service } = build({ config: undefined, isAdmin });
      const error = await service.listSessionLogs(scope).catch((err: unknown) => err);
      expect(error).toBeInstanceOf(InternalServerError);
      expect(error).toEqual(storageUnavailable(AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_UNAVAILABLE_MESSAGE));
    }
  );

  test("anything else that goes wrong while listing stays an error", async () => {
    list.mockRejectedValueOnce(new TypeError("a bug"));
    const { service } = build();
    await expect(service.listSessionLogs(scope)).rejects.toThrow("a bug");
  });
});

describe("reading logs that are off or not on the plan", () => {
  test("off hides what was recorded, without reading the bucket", async () => {
    const { service } = build({ config: { ...enabledConfig(), enabled: false } });
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.sessionLogs).toMatchObject({ enabled: false, disabledReason: "off" });
    expect(forOrg).not.toHaveBeenCalled();
  });

  test("with no settings at all, reads say logs are off", async () => {
    const { service } = build({ config: undefined });
    const page = await service.tailSessionLogs(scope);
    expect(page.sessionLogs.disabledReason).toBe("off");
  });

  test("without the plan for the storage in use, recorded logs are hidden", async () => {
    const { service } = build({ plan: { hasExternal: false } });
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.sessionLogs).toMatchObject({ enabled: false, disabledReason: "not-on-plan" });
    expect(forOrg).not.toHaveBeenCalled();
  });

  test("while the License Server is down with no recent answer, logs can still be read", async () => {
    const { service } = build({ plan: { hasExternal: false }, planFallback: true });
    const page = await service.listSessionLogs(scope);
    expect(page.sessionLogs).toMatchObject({ enabled: true, disabledReason: null });
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe("listSessionLogs: paging through the bucket", () => {
  test("a session that was never recordable lists nothing and never calls S3", async () => {
    const { service } = build({ session: { ...liveSession(), encryptedSessionLogKey: null } });
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(list).not.toHaveBeenCalled();
  });

  test("returns each chunk with its proxy, size and a download link", async () => {
    const { chunkId, key } = objectFor(Date.now() - 60_000);
    list.mockResolvedValueOnce({ objects: [{ key, size: 4096 }], isTruncated: false });
    const { service } = build();

    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([
      { chunkId, proxyId: PROXY_ID, ciphertextBytes: 4096, presignedGetUrl: `https://bucket.s3.amazonaws.com/${key}` }
    ]);
    expect(page.sessionLogs.sessionKey).toBe(Buffer.alloc(32, 7).toString("base64"));
    expect(page.nextCursor).toBeNull();
  });

  test("a page ends at its byte budget and the cursor continues after the last chunk it took", async () => {
    const big = Math.floor(AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES * 0.6);
    const newer = objectFor(Date.now() - 1_000);
    const older = objectFor(Date.now() - 2_000);
    list.mockResolvedValueOnce({
      objects: [
        { key: newer.key, size: big },
        { key: older.key, size: big }
      ],
      isTruncated: false
    });
    const { service } = build();

    const page = await service.listSessionLogs(scope);
    expect(page.chunks.map((chunk) => chunk.chunkId)).toEqual([newer.chunkId]);
    expect(page.nextCursor).toBe(encodeHistoryCursor(newer.key.slice(FOLDER.length)));
  });

  test("always takes at least one chunk, however large", async () => {
    const huge = objectFor(Date.now());
    list.mockResolvedValueOnce({
      objects: [{ key: huge.key, size: AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES * 4 }],
      isTruncated: false
    });
    const { service } = build();
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toHaveLength(1);
  });

  test("skips files it didn't write, and still moves past them", async () => {
    list.mockResolvedValueOnce({ objects: [{ key: `${FOLDER}notes.txt`, size: 10 }], isTruncated: true });
    const { service } = build();
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeHistoryCursor("notes.txt"));
  });

  test("an empty page that says more remain ends the listing instead of failing", async () => {
    list.mockResolvedValueOnce({ objects: [], isTruncated: true });
    const { service } = build();
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  test("a cursor continues after the name it carries", async () => {
    const { service } = build();
    await service.listSessionLogs({ ...scope, cursor: "8208694117999_x" });
    expect(list).toHaveBeenCalledWith({ startAfter: `${FOLDER}8208694117999_x`, maxKeys: 200 });
  });

  test("a cursor wins over the end of a date range, so later pages keep moving back", async () => {
    const { service } = build();
    await service.listSessionLogs({ ...scope, cursor: "8208694117999_x", to: new Date() });
    expect(list).toHaveBeenCalledWith({ startAfter: `${FOLDER}8208694117999_x`, maxKeys: 200 });
  });

  test("a date range starts listing at its end plus the margin", async () => {
    const to = new Date("2026-10-07T10:00:00.000Z");
    const { service } = build();
    await service.listSessionLogs({ ...scope, from: new Date("2026-10-07T09:00:00.000Z"), to });
    expect(list).toHaveBeenCalledWith({
      startAfter: `${FOLDER}${toRev(to.getTime() + AGENT_VAULT_SESSION_LOG_RANGE_MARGIN_MS)}`,
      maxKeys: 200
    });
  });

  test("stops at the first chunk whose last request is before the range starts, with nothing older to load", async () => {
    const from = new Date(Date.now() - 60_000);
    const inside = objectFor(from.getTime() + 1_000);
    const before = objectFor(from.getTime() - 1_000);
    list.mockResolvedValueOnce({
      objects: [
        { key: inside.key, size: 100 },
        { key: before.key, size: 100 }
      ],
      isTruncated: true
    });
    const { service } = build();
    const page = await service.listSessionLogs({ ...scope, from });
    expect(page.chunks.map((chunk) => chunk.chunkId)).toEqual([inside.chunkId]);
    expect(page.nextCursor).toBeNull();
  });

  test("refuses a range that ends before it starts", async () => {
    const { service } = build();
    await expect(
      service.listSessionLogs({
        ...scope,
        from: new Date("2026-10-07T10:00:00Z"),
        to: new Date("2026-10-07T09:00:00Z")
      })
    ).rejects.toThrow("The 'from' time must be before the 'to' time");
  });
});

describe("tailSessionLogs: reading the live feed", () => {
  const entry = (id: string, key: string, bucket = "my-bucket"): TFeedEntry => [
    id,
    ["key", key, "bucket", bucket, "bytes", "4096"]
  ];

  test("with no cursor, reads the feed from its start", async () => {
    const { service, streamRange } = build();
    await service.tailSessionLogs(scope);
    expect(streamRange).toHaveBeenCalledWith(`agent-vault-session-log-feed:${SESSION_ID}`, "(0-0", "+");
  });

  test("returns each new entry as a chunk and moves the cursor to the last one", async () => {
    const first = objectFor(Date.now() - 2_000);
    const second = objectFor(Date.now() - 1_000);
    const { service } = build({ feed: [entry("100-0", first.key), entry("101-0", second.key)] });

    const page = await service.tailSessionLogs({ ...scope, cursor: "99-0" });
    expect(page.chunks.map((chunk) => chunk.chunkId)).toEqual([first.chunkId, second.chunkId]);
    expect(page.chunks[0]).toMatchObject({ proxyId: PROXY_ID, ciphertextBytes: 4096 });
    expect(page.nextCursor).toBe(encodeTailCursor("101-0"));
  });

  test("an entry sent twice for the same chunk is returned each time, so a full feed still reads as full", async () => {
    const { key } = objectFor(Date.now());
    const { service } = build({ feed: [entry("100-0", key), entry("101-0", key)] });
    const page = await service.tailSessionLogs(scope);
    expect(page.chunks).toHaveLength(2);
  });

  test("skips entries from another bucket or folder, and still moves past them", async () => {
    const { key } = objectFor(Date.now());
    const { service } = build({
      feed: [entry("100-0", key, "old-bucket"), entry("101-0", `old-prefix/orgs/org-1/agent-vault/x.json.enc`)]
    });
    const page = await service.tailSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeTailCursor("101-0"));
  });

  test("skips an entry whose size isn't a whole number, and still moves past it", async () => {
    const { key } = objectFor(Date.now());
    const { service } = build({ feed: [["100-0", ["key", key, "bucket", "my-bucket", "bytes", "lots"]]] });
    const page = await service.tailSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeTailCursor("100-0"));
  });

  test("an uppercase session id reads the same folder and feed as the stored one", async () => {
    const upper = { ...scope, sessionId: SESSION_ID.toUpperCase() };
    const { key } = objectFor(Date.now() - 60_000);
    list.mockResolvedValueOnce({ objects: [{ key, size: 100 }], isTruncated: false });
    const { service, streamRange } = build();
    await service.tailSessionLogs(upper);
    const page = await service.listSessionLogs(upper);
    expect(streamRange).toHaveBeenCalledWith(`agent-vault-session-log-feed:${SESSION_ID}`, "(0-0", "+");
    expect(page.chunks).toHaveLength(1);
    expect(unwrapSessionLogKey).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: SESSION_ID }),
      expect.anything()
    );
  });

  test("an empty feed keeps the cursor and never touches storage", async () => {
    const { service } = build();
    const page = await service.tailSessionLogs({ ...scope, cursor: "99-0" });
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeTailCursor("99-0"));
    expect(forOrg).not.toHaveBeenCalled();
  });
});

describe("getSessionLogSettings", () => {
  test("with nothing saved and an instance bucket, reads as on in default storage", async () => {
    defaultStorage.configured = true;
    const { service } = build({ config: undefined });
    expect(await service.getSessionLogSettings({ projectId: PROJECT_ID, ctx })).toEqual({
      settings: { enabled: true, storage: { type: ObjectStorageType.Default } },
      defaultStorage: { configured: true }
    });
  });

  test("with nothing saved and no instance bucket, there are no settings", async () => {
    const { service } = build({ config: undefined });
    expect(await service.getSessionLogSettings({ projectId: PROJECT_ID, ctx })).toEqual({
      settings: null,
      defaultStorage: { configured: false }
    });
  });

  test("a saved default choice reads as nothing once the operator removes the bucket", async () => {
    const { service } = build({ config: defaultRow(true) });
    expect((await service.getSessionLogSettings({ projectId: PROJECT_ID, ctx })).settings).toBeNull();
  });

  test("a saved external choice reads back as saved", async () => {
    const { service } = build();
    expect((await service.getSessionLogSettings({ projectId: PROJECT_ID, ctx })).settings).toEqual({
      enabled: true,
      storage: externalStorage()
    });
  });
});

describe("updateSessionLogSettings: choosing storage", () => {
  test("default storage on an instance without a bucket is refused", async () => {
    const { service, upsertConfig } = build({ config: undefined });
    await expect(save(service, { enabled: true, storage: { type: "default" } })).rejects.toThrow(
      "This instance doesn't offer default storage"
    );
    expect(upsertConfig).not.toHaveBeenCalled();
  });

  test("turning off is saved even with nothing to turn off, so a bucket added later doesn't turn it on", async () => {
    const { service, upsertConfig } = build({ config: undefined });
    const result = await save(service, { enabled: false });
    expect(result).toMatchObject({ settings: null, previous: null });
    expect(upsertConfig).toHaveBeenCalledWith(
      [expect.objectContaining({ enabled: false, storageType: "default", bucket: null })],
      "projectId"
    );
  });

  test("turning off the default with nothing saved saves it off", async () => {
    defaultStorage.configured = true;
    const { service, upsertConfig } = build({ config: undefined });
    const { settings } = await save(service, { enabled: false });
    expect(settings).toEqual({ enabled: false, storage: { type: ObjectStorageType.Default } });
    expect(upsertConfig).toHaveBeenCalledWith(
      [expect.objectContaining({ enabled: false, storageType: "default", bucket: null })],
      "projectId"
    );
  });

  test("switching to default drops the bucket and frees the connection", async () => {
    defaultStorage.configured = true;
    const { service, upsertConfig, validateConnection } = build();
    await save(service, { enabled: true, storage: { type: "default" } });
    expect(upsertConfig).toHaveBeenCalledWith(
      [
        {
          projectId: PROJECT_ID,
          enabled: true,
          storageType: "default",
          appConnectionId: null,
          bucket: null,
          region: null,
          keyPrefix: null
        }
      ],
      "projectId"
    );
    expect(validateConnection).not.toHaveBeenCalled();
  });

  test("switching to external checks the connection and the bucket at the product folder", async () => {
    defaultStorage.configured = true;
    const { service, validateConnection } = build({ config: undefined });
    const { settings, appConnectionName } = await save(service, { enabled: true, storage: externalStorage() });
    expect(validateConnection).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
    expect(settings?.storage).toEqual(externalStorage());
    expect(appConnectionName).toBe("prod-logs");
  });

  test("a bucket check failure says what to fix, and nothing is saved", async () => {
    check.mockRejectedValueOnce(
      toObjectStorageError(s3Error("AccessDenied"), {
        storageType: ObjectStorageType.External,
        bucket: "other-bucket",
        region: "us-east-1",
        step: "write"
      })
    );
    const { service, upsertConfig } = build();
    await expect(
      save(service, { enabled: true, storage: externalStorage({ bucket: "other-bucket" }) })
    ).rejects.toThrow("Grant s3:PutObject");
    expect(upsertConfig).not.toHaveBeenCalled();
  });

  test("a saved default choice on an instance that lost its bucket can still be replaced", async () => {
    const { service, upsertConfig } = build({ config: defaultRow(true) });
    await save(service, { enabled: true, storage: externalStorage() });
    expect(upsertConfig).toHaveBeenCalledTimes(1);
  });
});

describe("updateSessionLogSettings: when the connection is checked again", () => {
  test.each([
    { use: "a different connection", fields: { appConnectionId: "5c6fd1a9-3c89-4a64-9e5f-6b7cfe0f1a2b" } },
    { use: "a different bucket", fields: { bucket: "another-bucket" } },
    { use: "a different region", fields: { region: "us-west-2" } },
    { use: "a different prefix", fields: { keyPrefix: "elsewhere" } }
  ])("checks it when the save points it at $use", async ({ fields }) => {
    const { service, validateConnection } = build();
    await save(service, { enabled: true, storage: externalStorage(fields) });
    expect(validateConnection).toHaveBeenCalledTimes(1);
  });

  test("checks it, and the bucket, when the save turns recording back on", async () => {
    const { service, validateConnection } = build({ config: { ...enabledConfig(), enabled: false } });
    await save(service, { enabled: true, storage: externalStorage() });
    expect(validateConnection).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledTimes(1);
  });

  test("never checks it when the save turns recording off, so an unusable connection cannot block that", async () => {
    const { service, validateConnection } = build();
    await save(service, { enabled: false });
    expect(validateConnection).not.toHaveBeenCalled();
    expect(check).not.toHaveBeenCalled();
  });

  test("skips it when the save repeats the storage as it was, with an empty prefix meaning none", async () => {
    const { service, validateConnection } = build({ config: { ...enabledConfig(), keyPrefix: null } });
    await save(service, { enabled: true, storage: externalStorage({ keyPrefix: "" }) });
    expect(validateConnection).not.toHaveBeenCalled();
  });

  test("refuses a directory bucket, which can't list in order", async () => {
    const { service, upsertConfig } = build();
    await expect(
      save(service, { enabled: true, storage: externalStorage({ bucket: "logs--usw2-az1--x-s3" }) })
    ).rejects.toThrow("Directory buckets");
    expect(upsertConfig).not.toHaveBeenCalled();
  });

  test("a directory bucket already saved can still be turned off", async () => {
    const { service, upsertConfig } = build({ config: { ...enabledConfig(), bucket: "logs--usw2-az1--x-s3" } });
    await save(service, { enabled: false });
    expect(upsertConfig).toHaveBeenCalledTimes(1);
  });
});

describe("updateSessionLogSettings: the plan", () => {
  test("turning external storage back on without its flag is refused before the connection is checked", async () => {
    const { service, validateConnection, upsertConfig } = build({
      plan: { hasExternal: false },
      config: { ...enabledConfig(), enabled: false }
    });
    await expect(save(service, { enabled: true, storage: externalStorage() })).rejects.toThrow(
      AGENT_VAULT_SESSION_LOG_EXTERNAL_STORAGE_NOT_ON_PLAN
    );
    expect(validateConnection).not.toHaveBeenCalled();
    expect(upsertConfig).not.toHaveBeenCalled();
  });

  test("changing the bucket without the flag is refused", async () => {
    const { service, upsertConfig } = build({ plan: { hasExternal: false } });
    await expect(
      save(service, { enabled: true, storage: externalStorage({ bucket: "another-bucket" }) })
    ).rejects.toThrow(AGENT_VAULT_SESSION_LOG_EXTERNAL_STORAGE_NOT_ON_PLAN);
    expect(upsertConfig).not.toHaveBeenCalled();
  });

  test("choosing default storage without its flag is refused", async () => {
    defaultStorage.configured = true;
    const { service } = build({ plan: { hasDefault: false } });
    await expect(save(service, { enabled: true, storage: { type: "default" } })).rejects.toThrow(
      AGENT_VAULT_SESSION_LOG_DEFAULT_STORAGE_NOT_ON_PLAN
    );
  });

  test.each([
    { why: "external storage after the plan lapsed", plan: { hasExternal: false }, config: enabledConfig() },
    { why: "default storage that was never on the plan", plan: { hasDefault: false }, config: undefined },
    { why: "a saved default choice after the plan lapsed", plan: { hasDefault: false }, config: defaultRow(true) }
  ])("turning off $why still works", async ({ plan, config }) => {
    defaultStorage.configured = true;
    const { service, upsertConfig } = build({ plan, config });
    const { settings } = await save(service, { enabled: false });
    expect(settings?.enabled).toBe(false);
    expect(upsertConfig).toHaveBeenCalledTimes(1);
  });

  test("a save that needs the plan says when it couldn't be confirmed", async () => {
    const { service, upsertConfig } = build({
      plan: { hasExternal: false },
      planFallback: true,
      config: { ...enabledConfig(), enabled: false }
    });
    await expect(save(service, { enabled: true, storage: externalStorage() })).rejects.toThrow(
      "Infisical couldn't confirm your plan right now. Try again in a few minutes."
    );
    expect(upsertConfig).not.toHaveBeenCalled();
  });
});

describe("updateSessionLogSettings: turning off", () => {
  test("forgets the bucket and connection, so the connection can be deleted, and says what it replaced", async () => {
    const { service, upsertConfig } = build({ plan: { hasExternal: false, hasDefault: false } });
    const result = await save(service, { enabled: false });
    expect(upsertConfig).toHaveBeenCalledWith(
      [
        {
          projectId: PROJECT_ID,
          enabled: false,
          storageType: "default",
          appConnectionId: null,
          bucket: null,
          region: null,
          keyPrefix: null
        }
      ],
      "projectId"
    );
    expect(result.previous).toEqual({
      storageType: ObjectStorageType.External,
      appConnectionId: CONNECTION_ID,
      appConnectionName: "prod-logs",
      bucket: "my-bucket",
      region: "us-east-1",
      keyPrefix: "logs"
    });
    expect(result.settings).toBeNull();
  });

  test("on an instance with a bucket, what's left reads as default storage, off", async () => {
    defaultStorage.configured = true;
    const { service } = build();
    const result = await save(service, { enabled: false });
    expect(result.settings).toEqual({ enabled: false, storage: { type: ObjectStorageType.Default } });
  });

  test("turning session logs back on from off records nothing as replaced, since off holds no storage", async () => {
    defaultStorage.configured = true;
    const { service } = build({ config: defaultRow(false) });
    const { settings, previous } = await save(service, { enabled: true, storage: externalStorage() });
    expect(settings?.enabled).toBe(true);
    expect(previous).toBeNull();
  });

  test("switching from default storage that was recording to a bucket records the default it replaced", async () => {
    defaultStorage.configured = true;
    const { service } = build({ config: defaultRow(true) });
    const { previous } = await save(service, { enabled: true, storage: externalStorage() });
    expect(previous).toEqual({
      storageType: ObjectStorageType.Default,
      appConnectionId: null,
      appConnectionName: null,
      bucket: null,
      region: null,
      keyPrefix: null
    });
  });

  test("switching from a bucket to default storage records the bucket it replaced", async () => {
    defaultStorage.configured = true;
    const { service } = build();
    const { previous } = await save(service, { enabled: true, storage: { type: "default" } });
    expect(previous).toMatchObject({ storageType: ObjectStorageType.External, bucket: "my-bucket" });
  });

  test("saving the same storage again records nothing as replaced", async () => {
    const { service } = build();
    const { previous } = await save(service, { enabled: true, storage: externalStorage() });
    expect(previous).toBeNull();
  });
});

describe("getSessionLogHealth", () => {
  test("reports a bucket the connection can't list", async () => {
    listAccess.mockRejectedValueOnce(storageError(s3Error("AccessDenied")));
    const { service } = build();
    const { health } = await service.getSessionLogHealth({ projectId: PROJECT_ID, ctx });
    expect(health.connectionError).toBe(
      "Unable to reach bucket 'my-bucket'. Check the bucket name, the region, and that the connection's credentials allow s3:ListBucket on it"
    );
  });

  test("never checks default storage, which is the operator's to fix and is checked at boot", async () => {
    defaultStorage.configured = true;
    const { service } = build({ config: undefined });
    const { health } = await service.getSessionLogHealth({ projectId: PROJECT_ID, ctx });
    expect(health.connectionError).toBeNull();
    expect(listAccess).not.toHaveBeenCalled();
  });

  test("is clear once storage answers", async () => {
    const { service } = build();
    const { health } = await service.getSessionLogHealth({ projectId: PROJECT_ID, ctx });
    expect(health.connectionError).toBeNull();
    expect(listAccess).toHaveBeenCalledTimes(1);
  });

  test.each([
    { why: "session logs are off", overrides: { config: { ...enabledConfig(), enabled: false } } },
    { why: "the plan doesn't include the storage", overrides: { plan: { hasExternal: false } } }
  ])("doesn't check storage while $why, since nothing is recorded", async ({ overrides }) => {
    const { service } = build(overrides);
    const { health } = await service.getSessionLogHealth({ projectId: PROJECT_ID, ctx });
    expect(health.connectionError).toBeNull();
    expect(listAccess).not.toHaveBeenCalled();
  });

  test("still checks while the plan can't be confirmed", async () => {
    const { service } = build({ plan: { hasExternal: false }, planFallback: true });
    await service.getSessionLogHealth({ projectId: PROJECT_ID, ctx });
    expect(listAccess).toHaveBeenCalledTimes(1);
  });

  test("a failure that isn't from storage still answers, so health never becomes a 500", async () => {
    listAccess.mockRejectedValueOnce(new TypeError("a bug"));
    const { service } = build();
    const { health } = await service.getSessionLogHealth({ projectId: PROJECT_ID, ctx });
    expect(health.connectionError).toBe("Couldn't check the AWS connection. Try again.");
  });
});

describe("getSessionLogCorsProbe", () => {
  test("default storage has nothing to probe", async () => {
    defaultStorage.configured = true;
    const { service } = build({ config: undefined });
    expect(await service.getSessionLogCorsProbe({ projectId: PROJECT_ID, ctx })).toEqual({ probe: null });
    expect(forOrg).not.toHaveBeenCalled();
  });

  test.each([
    { why: "session logs are off", overrides: { config: { ...enabledConfig(), enabled: false } } },
    { why: "the plan doesn't include the storage", overrides: { plan: { hasExternal: false } } }
  ])("has nothing to probe while $why, since nothing is shown", async ({ overrides }) => {
    const { service } = build(overrides);
    expect(await service.getSessionLogCorsProbe({ projectId: PROJECT_ID, ctx })).toEqual({ probe: null });
    expect(forOrg).not.toHaveBeenCalled();
  });

  test("external storage gets a link to the probe file", async () => {
    const { service } = build();
    expect(await service.getSessionLogCorsProbe({ projectId: PROJECT_ID, ctx })).toEqual({
      probe: { url: "https://bucket.s3.amazonaws.com/probe", expiresInSeconds: 300 }
    });
  });
});
