import { beforeEach, describe, expect, test, vi } from "vitest";

import { DatabaseError } from "@app/lib/errors";

import { AGENT_VAULT_ACTIVITY_MAX_STORED_CHUNKS, AgentVaultActivityErrorName } from "./agent-vault-activity-constants";
import { agentVaultActivityServiceFactory } from "./agent-vault-activity-service";

const CEILING = AGENT_VAULT_ACTIVITY_MAX_STORED_CHUNKS;

const presignPut = vi.fn(async () => "https://bucket.s3.amazonaws.com/signed-put");
vi.mock("./agent-vault-activity-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agent-vault-activity-storage")>();
  return {
    ...actual,
    buildActivityStorage: vi.fn(async () => ({
      presignPut,
      presignGet: vi.fn(async () => "https://bucket.s3.amazonaws.com/signed-get"),
      mintCorsProbeUrl: vi.fn(async () => "https://bucket.s3.amazonaws.com/probe"),
      validate: vi.fn(async () => {})
    }))
  };
});

const PROXY = { id: "proxy-1", name: "proxy-one", projectId: "proj-1", orgId: "org-1" };

const liveSession = () => ({
  id: "sess-1",
  projectId: "proj-1",
  userId: "user-1",
  identityId: null,
  expiresAt: null,
  revokedAt: null,
  updatedAt: new Date(Date.now() - 60_000),
  encryptedActivityKey: Buffer.alloc(32)
});

const enabledConfig = () => ({
  id: "cfg-1",
  projectId: "proj-1",
  enabled: true,
  appConnectionId: "conn-1",
  bucket: "my-bucket",
  region: "us-east-1",
  keyPrefix: "logs",
  configVersion: 3,
  storedChunkCount: 0
});

const validChunk = () => ({
  chunkId: "01K5ABCDEFGHJKMNPQRSTVWXYZ",
  startedAt: new Date(Date.now() - 60_000),
  endedAt: new Date(Date.now() - 1_000),
  firstSeq: 0,
  lastSeq: 41,
  recordCount: 42,
  droppedCount: 0,
  ciphertextBytes: 4096,
  iv: "qrvM3e7/ABEiM0RV"
});

type TOverrides = {
  proxy?: unknown;
  session?: unknown;
  config?: unknown;
  storedAfterIncrement?: number;
  createThrows?: unknown;
  isReplay?: boolean;
  existingChunk?: unknown;
};

const build = (overrides: TOverrides = {}) => {
  const created = { ...validChunk(), objectKey: "logs/proj-1/sess-1/proxy-1/2026-09-16/chunk.json.enc" };

  const createIfAbsent = vi.fn(async (values: Record<string, unknown>) => {
    if (overrides.createThrows) return Promise.reject(overrides.createThrows);
    if (overrides.isReplay) return undefined;
    return { ...created, ...values };
  });
  const recordStoredChunk = vi.fn(async () => overrides.storedAfterIncrement ?? 42);
  const findChunk = vi.fn(async () => overrides.existingChunk ?? null);
  const repointChunk = vi.fn(async (_id: string, values: Record<string, unknown>) => ({
    ...(overrides.existingChunk as object),
    ...values
  }));
  const validateConnection = vi.fn(async () => ({}));
  const config = "config" in overrides ? overrides.config : enabledConfig();

  const service = agentVaultActivityServiceFactory({
    agentVaultActivityChunkDAL: {
      createIfAbsent,
      findOne: findChunk,
      updateById: repointChunk,
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
      findForSessionPage: vi.fn(async () => ({ chunks: [], hasMore: false }))
    } as never,
    agentVaultActivityConfigDAL: {
      findOne: vi.fn(async () => config),
      findByProjectIdFromPrimary: vi.fn(async () => config),
      recordStoredChunk,
      updateById: vi.fn(async (_id: string, values: Record<string, unknown>) => ({
        ...(config as object),
        ...values
      }))
    } as never,
    agentVaultSessionDAL: {
      findOne: vi.fn(async () => ("session" in overrides ? overrides.session : liveSession()))
    } as never,
    agentVaultProxyDAL: {
      findByIdWithOrg: vi.fn(async () => ("proxy" in overrides ? overrides.proxy : PROXY))
    } as never,
    appConnectionDAL: { findById: vi.fn() } as never,
    appConnectionService: { validateAppConnectionUsageById: validateConnection } as never,
    permissionService: {
      getProjectPermission: vi.fn(async () => ({ permission: {}, hasRole: () => true }))
    } as never,
    kmsService: { createCipherPairWithDataKey: vi.fn() } as never
  });

  return { service, createIfAbsent, recordStoredChunk, findChunk, repointChunk, validateConnection };
};

const record = (service: ReturnType<typeof build>["service"], chunk = validChunk()) =>
  service.recordChunk({ proxyId: PROXY.id, sessionId: "sess-1", chunk });

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordChunk: who is allowed to write", () => {
  test("a happy path writes the row, counts the chunk and returns an upload url", async () => {
    const { service, createIfAbsent, recordStoredChunk } = build();
    const result = await record(service);

    expect(result.uploadUrl).toBe("https://bucket.s3.amazonaws.com/signed-put");
    expect(result.chunkId).toBe("01K5ABCDEFGHJKMNPQRSTVWXYZ");
    expect(recordStoredChunk).toHaveBeenCalledWith({ id: "cfg-1", configVersion: 3 }, expect.anything());

    const values = createIfAbsent.mock.calls[0][0];
    expect(String(values.objectKey)).toMatch(
      /^logs\/proj-1\/sess-1\/proxy-1\/\d{4}-\d{2}-\d{2}\/01K5ABCDEFGHJKMNPQRSTVWXYZ\.json\.enc$/
    );
    expect(values.configVersion).toBe(3);
    expect(values.proxyName).toBe("proxy-one");
    expect(values.projectId).toBe("proj-1");
  });

  test("an unknown proxy is a 404 that says nothing about the session", async () => {
    const { service } = build({ proxy: undefined });
    await expect(record(service)).rejects.toMatchObject({ message: "Session not found" });
  });

  test("a session in another project reads exactly like a missing one", async () => {
    const { service } = build({ session: undefined });
    await expect(record(service)).rejects.toMatchObject({ message: "Session not found" });
  });
});

describe("recordChunk: the retirement grace window", () => {
  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  test.each([
    { why: "revoked an hour ago", session: { revokedAt: hoursAgo(1), expiresAt: null } },
    { why: "expired an hour ago", session: { revokedAt: null, expiresAt: hoursAgo(1) } },
    { why: "revoked 23 hours ago", session: { revokedAt: hoursAgo(23), expiresAt: null } }
  ])("still accepts a chunk from a session $why", async ({ session }) => {
    const { service } = build({ session: { ...liveSession(), ...session } });
    await expect(record(service)).resolves.toMatchObject({ chunkId: "01K5ABCDEFGHJKMNPQRSTVWXYZ" });
  });

  test.each([
    { why: "revoked", session: { revokedAt: hoursAgo(25), expiresAt: null } },
    { why: "expired", session: { revokedAt: null, expiresAt: hoursAgo(25) } }
  ])("refuses a chunk from a session $why more than a day ago", async ({ session }) => {
    const { service } = build({ session: { ...liveSession(), ...session } });
    await expect(record(service)).rejects.toMatchObject({
      message: "Session retired too long ago to accept activity"
    });
  });

  test("retirement is the earlier of revoked and expired, so a long-expired session stays closed", async () => {
    const { service } = build({
      session: { ...liveSession(), revokedAt: new Date(Date.now() - 60_000), expiresAt: hoursAgo(24 * 7) }
    });
    await expect(record(service)).rejects.toMatchObject({
      message: "Session retired too long ago to accept activity"
    });
  });

  test("a session whose owner was deleted still accepts what the proxy held, for a day", async () => {
    const { service } = build({
      session: { ...liveSession(), userId: null, identityId: null, updatedAt: hoursAgo(23) }
    });
    await expect(record(service)).resolves.toMatchObject({ chunkId: "01K5ABCDEFGHJKMNPQRSTVWXYZ" });
  });

  test("a session whose owner was deleted more than a day ago is refused", async () => {
    const { service } = build({
      session: { ...liveSession(), userId: null, identityId: null, updatedAt: hoursAgo(25) }
    });
    await expect(record(service)).rejects.toMatchObject({
      message: "Session retired too long ago to accept activity"
    });
  });

  test("an expiry in the future is not retirement", async () => {
    const { service } = build({
      session: { ...liveSession(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
    });
    await expect(record(service)).resolves.toBeTruthy();
  });
});

describe("recordChunk: when logging is off", () => {
  test.each([
    { why: "there is no config row", config: undefined },
    { why: "the switch is off", config: { ...enabledConfig(), enabled: false } },
    { why: "no bucket is set", config: { ...enabledConfig(), bucket: null } },
    { why: "the connection was detached", config: { ...enabledConfig(), appConnectionId: null } }
  ])("refuses with the named error when $why", async ({ config }) => {
    const { service, createIfAbsent } = build({ config });
    await expect(record(service)).rejects.toMatchObject({ name: AgentVaultActivityErrorName.Disabled });
    expect(createIfAbsent).not.toHaveBeenCalled();
  });
});

describe("recordChunk: semantic validation", () => {
  test.each([
    {
      why: "startedAt is after endedAt",
      patch: { startedAt: new Date(Date.now()), endedAt: new Date(Date.now() - 60_000) },
      message: "Chunk startedAt is after its endedAt"
    },
    {
      why: "the chunk is older than the maximum age",
      patch: {
        startedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
        endedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000)
      },
      message: "Chunk is older than the maximum accepted age"
    },
    {
      why: "firstSeq exceeds lastSeq",
      patch: { firstSeq: 50, lastSeq: 10 },
      message: "Chunk firstSeq is greater than its lastSeq"
    },
    {
      why: "more records than the sequence range can hold",
      patch: { firstSeq: 0, lastSeq: 5, recordCount: 42 },
      message: "Chunk holds more records than its sequence range allows"
    }
  ])("rejects when $why", async ({ patch, message }) => {
    const { service, createIfAbsent } = build();
    await expect(record(service, { ...validChunk(), ...patch })).rejects.toMatchObject({ message });
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  test("a chunk whose range is larger than its count is fine, since the ring drops records", async () => {
    const { service } = build();
    await expect(
      record(service, { ...validChunk(), firstSeq: 0, lastSeq: 999, recordCount: 42 })
    ).resolves.toBeTruthy();
  });

  test("a proxy clock too far ahead is refused with the named error, saying how far", async () => {
    const { service, createIfAbsent } = build();
    const refusal = record(service, { ...validChunk(), endedAt: new Date(Date.now() + 10 * 60_000) });
    await expect(refusal).rejects.toMatchObject({ name: AgentVaultActivityErrorName.ClockSkew });
    await expect(refusal).rejects.toThrow(/about 10 minutes ahead/);
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  test("a small clock skew forward is tolerated", async () => {
    const { service } = build();
    const soon = new Date(Date.now() + 60_000);
    await expect(record(service, { ...validChunk(), startedAt: soon, endedAt: soon })).resolves.toBeTruthy();
  });

  test("refuses a chunk claiming more records than its bytes could hold", async () => {
    const { service, createIfAbsent } = build();
    await expect(
      record(service, { ...validChunk(), firstSeq: 0, lastSeq: 999, recordCount: 1000, ciphertextBytes: 64 })
    ).rejects.toMatchObject({ message: "Chunk is too small to hold the number of records it claims" });
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  test("accepts a chunk whose size is plausible for its record count", async () => {
    const { service } = build();
    await expect(record(service, { ...validChunk(), recordCount: 10, ciphertextBytes: 4096 })).resolves.toBeTruthy();
  });
});

describe("recordChunk: the organization ceiling", () => {
  test("refuses with the named error once the increment carries the org past the limit", async () => {
    const { service } = build({ storedAfterIncrement: CEILING + 1 });
    await expect(record(service)).rejects.toMatchObject({ name: AgentVaultActivityErrorName.CeilingReached });
  });

  test("the refusal is thrown from inside the transaction, so the row is rolled back with it", async () => {
    const { service, createIfAbsent, recordStoredChunk } = build({ storedAfterIncrement: CEILING + 1 });
    await expect(record(service)).rejects.toThrow();
    expect(createIfAbsent).toHaveBeenCalledTimes(1);
    expect(recordStoredChunk).toHaveBeenCalledTimes(1);
  });

  test("landing exactly on the ceiling is allowed", async () => {
    const { service } = build({ storedAfterIncrement: CEILING });
    await expect(record(service)).resolves.toBeTruthy();
  });

  test("no upload url is minted for a refused chunk", async () => {
    const { service } = build({ storedAfterIncrement: CEILING + 1 });
    await expect(record(service)).rejects.toThrow();
    expect(presignPut).not.toHaveBeenCalled();
  });
});

describe("recordChunk: re-sending a chunk", () => {
  test("replays the stored row and does not count the records twice", async () => {
    const existing = {
      ...validChunk(),
      objectKey: "logs/proj-1/sess-1/proxy-1/2026-09-16/01K5ABCDEFGHJKMNPQRSTVWXYZ.json.enc",
      ciphertextBytes: 4096
    };
    const { service, recordStoredChunk, findChunk } = build({ isReplay: true, existingChunk: existing });

    const result = await record(service);

    expect(result.chunkId).toBe("01K5ABCDEFGHJKMNPQRSTVWXYZ");
    expect(result.uploadUrl).toBe("https://bucket.s3.amazonaws.com/signed-put");
    expect(findChunk).toHaveBeenCalledWith(
      { sessionId: "sess-1", chunkId: "01K5ABCDEFGHJKMNPQRSTVWXYZ" },
      expect.anything()
    );
    expect(recordStoredChunk).not.toHaveBeenCalled();
  });

  test("presigns against the stored row's size, not the resent body's claim", async () => {
    const { service } = build({
      isReplay: true,
      existingChunk: { ...validChunk(), objectKey: "stored/key.json.enc", ciphertextBytes: 999 }
    });
    await record(service);
    expect(presignPut).toHaveBeenCalledWith({ objectKey: "stored/key.json.enc", ciphertextBytes: 999 });
  });

  test("a chunk re-sent after the destination moved is pointed at the current one before it is presigned", async () => {
    const { service, repointChunk } = build({
      isReplay: true,
      existingChunk: { ...validChunk(), id: "row-1", configVersion: 2, objectKey: "old/key.json.enc" }
    });
    await record(service);

    const [id, values] = repointChunk.mock.calls[0];
    expect(id).toBe("row-1");
    expect(values.configVersion).toBe(3);
    expect(String(values.objectKey)).toMatch(
      /^logs\/proj-1\/sess-1\/proxy-1\/\d{4}-\d{2}-\d{2}\/01K5[^/]+\.json\.enc$/
    );
    expect(presignPut).toHaveBeenCalledWith({ objectKey: values.objectKey, ciphertextBytes: 4096 });
  });

  test("never points a row at an older destination, so a lagging config read cannot strand it", async () => {
    const { service, repointChunk } = build({
      isReplay: true,
      existingChunk: { ...validChunk(), configVersion: 4, objectKey: "newer/key.json.enc" }
    });
    await record(service);

    expect(repointChunk).not.toHaveBeenCalled();
    expect(presignPut).toHaveBeenCalledWith({ objectKey: "newer/key.json.enc", ciphertextBytes: 4096 });
  });

  test("a row that vanished between the insert and the read is a 500, not a silent success", async () => {
    const { service } = build({ isReplay: true, existingChunk: null });
    await expect(record(service)).rejects.toMatchObject({
      message: "Activity chunk vanished between insert and read"
    });
  });

  test("a database error propagates rather than being read as a replay", async () => {
    const other = new DatabaseError({ error: { code: "23503" }, name: "create" });
    const { service, findChunk } = build({ createThrows: other });
    await expect(record(service)).rejects.toThrow();
    expect(findChunk).not.toHaveBeenCalled();
  });
});

describe("updateActivityConfig: when the connection is checked again", () => {
  const ctx = { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never;
  const actor = { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never;

  const save = (service: ReturnType<typeof build>["service"], patch: Record<string, unknown>) =>
    service.updateActivityConfig({ projectId: "proj-1", ctx, actor, ...patch });

  test.each([
    { use: "a different connection", patch: { appConnectionId: "5c6fd1a9-3c89-4a64-9e5f-6b7cfe0f1a2b" } },
    { use: "a different bucket", patch: { bucket: "another-bucket" } },
    { use: "a different region", patch: { region: "us-west-2" } },
    { use: "a different prefix", patch: { keyPrefix: "elsewhere" } }
  ])("checks it when the save points it at $use", async ({ patch }) => {
    const { service, validateConnection } = build();
    await save(service, patch);
    expect(validateConnection).toHaveBeenCalledTimes(1);
  });

  test("checks it when the save turns recording on", async () => {
    const { service, validateConnection } = build({ config: { ...enabledConfig(), enabled: false } });
    await save(service, { enabled: true });
    expect(validateConnection).toHaveBeenCalledTimes(1);
  });

  test("never checks it when the save turns recording off, so an unusable connection cannot block that", async () => {
    const { service, validateConnection } = build();
    await save(service, { enabled: false });
    expect(validateConnection).not.toHaveBeenCalled();
  });

  test("skips it when the save leaves the destination as it was, however the prefix is spelled", async () => {
    const { service, validateConnection } = build();
    await save(service, {
      enabled: true,
      appConnectionId: "conn-1",
      bucket: "my-bucket",
      region: "us-east-1",
      keyPrefix: "/logs/"
    });
    expect(validateConnection).not.toHaveBeenCalled();
  });
});
