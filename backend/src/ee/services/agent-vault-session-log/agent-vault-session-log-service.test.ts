import { createMongoAbility } from "@casl/ability";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError, DatabaseError } from "@app/lib/errors";

import {
  AGENT_VAULT_SESSION_LOG_MAX_STORED_CHUNKS,
  AgentVaultSessionLogErrorName
} from "./agent-vault-session-log-constants";
import { encodeTailCursor } from "./agent-vault-session-log-cursor";
import { agentVaultSessionLogServiceFactory } from "./agent-vault-session-log-service";
import { buildSessionLogObjectKey, buildSessionLogStorage } from "./agent-vault-session-log-storage";

const CEILING = AGENT_VAULT_SESSION_LOG_MAX_STORED_CHUNKS;

const presignPut = vi.fn(async () => "https://bucket.s3.amazonaws.com/signed-put");
vi.mock("./agent-vault-session-log-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agent-vault-session-log-storage")>();
  return {
    ...actual,
    buildSessionLogStorage: vi.fn(async () => ({
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
  encryptedSessionLogKey: Buffer.alloc(32)
});

const enabledConfig = () => ({
  id: "cfg-1",
  projectId: "proj-1",
  enabled: true,
  appConnectionId: "conn-1",
  bucket: "my-bucket",
  region: "us-east-1",
  keyPrefix: "logs",
  storedChunkCount: 0
});

const validChunk = () => ({
  chunkId: "01a0a9c5-231d-7abc-8def-0123456789ab",
  startedAt: new Date(Date.now() - 60_000),
  endedAt: new Date(Date.now() - 1_000),
  firstSeq: 0,
  lastSeq: 41,
  recordCount: 42,
  droppedCount: 0,
  ciphertextBytes: 4096,
  iv: "qrvM3e7/ABEiM0RV",
  ciphertextSha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"
});

type TOverrides = {
  proxy?: unknown;
  session?: unknown;
  config?: unknown;
  storedAfterIncrement?: number;
  createThrows?: unknown;
  isReplay?: boolean;
  existingChunk?: unknown;
  pageRows?: unknown[];
  proxies?: unknown[];
  connection?: unknown;
  configCreateThrows?: unknown;
};

const build = (overrides: TOverrides = {}) => {
  const created = { ...validChunk(), objectKey: "logs/proj-1/sess-1/proxy-1/2026-09-16/chunk.json.enc" };

  const createIfAbsent = vi.fn(async (values: Record<string, unknown>) => {
    if (overrides.createThrows) return Promise.reject(overrides.createThrows);
    if (overrides.isReplay) return undefined;
    return { ...created, ...values };
  });
  const recordStoredChunk = vi.fn(async () => overrides.storedAfterIncrement ?? 42);
  const findChunk = vi.fn(async () =>
    overrides.existingChunk ? { proxyId: PROXY.id, ...(overrides.existingChunk as object) } : null
  );
  const repointChunk = vi.fn(async (_id: string, values: Record<string, unknown>) => ({
    ...(overrides.existingChunk as object),
    ...values
  }));
  const validateConnection = vi.fn(async () => ({}));
  const findConnection = vi.fn(async () => overrides.connection);
  const config = "config" in overrides ? overrides.config : enabledConfig();

  const service = agentVaultSessionLogServiceFactory({
    agentVaultSessionLogChunkDAL: {
      createIfAbsent,
      findOne: findChunk,
      updateById: repointChunk,
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb({})),
      findForSessionPage: vi.fn(async () => ({ chunks: overrides.pageRows ?? [], hasMore: false })),
      findReceivedForSession: vi.fn(async () => ({ chunks: overrides.pageRows ?? [], hasMore: false }))
    } as never,
    agentVaultSessionLogConfigDAL: {
      findOne: vi.fn(async () => config),
      findByProjectIdFromPrimary: vi.fn(async () => config),
      recordStoredChunk,
      updateById: vi.fn(async (_id: string, values: Record<string, unknown>) => ({
        ...(config as object),
        ...values
      })),
      create: vi.fn(async (values: Record<string, unknown>) => {
        if (overrides.configCreateThrows) return Promise.reject(overrides.configCreateThrows);
        return { ...enabledConfig(), ...values };
      })
    } as never,
    agentVaultSessionDAL: {
      findOne: vi.fn(async () => ("session" in overrides ? overrides.session : liveSession()))
    } as never,
    agentVaultProxyDAL: {
      findByIdWithOrg: vi.fn(async () => ("proxy" in overrides ? overrides.proxy : PROXY)),
      find: vi.fn(async () => overrides.proxies ?? [PROXY])
    } as never,
    appConnectionDAL: { findById: findConnection } as never,
    appConnectionService: { validateAppConnectionUsageById: validateConnection } as never,
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility([{ action: "read", subject: "agent-vault-sessions" }]),
        hasRole: () => true
      }))
    } as never,
    kmsService: { createCipherPairWithDataKey: vi.fn() } as never
  });

  return { service, createIfAbsent, recordStoredChunk, findChunk, repointChunk, validateConnection, findConnection };
};

const record = (service: ReturnType<typeof build>["service"], chunk = validChunk()) =>
  service.recordChunk({ proxyId: PROXY.id, sessionId: "sess-1", chunk });

const atCurrentDestination = (chunk: ReturnType<typeof validChunk>) => ({
  ...chunk,
  bucket: "my-bucket",
  objectKey: buildSessionLogObjectKey({
    keyPrefix: "logs",
    projectId: "proj-1",
    sessionId: "sess-1",
    proxyId: PROXY.id,
    startedAt: chunk.startedAt,
    chunkId: chunk.chunkId
  })
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordChunk: who is allowed to write", () => {
  test("a happy path writes the row, counts the chunk and returns an upload url", async () => {
    const { service, createIfAbsent, recordStoredChunk } = build();
    const result = await record(service);

    expect(result.uploadUrl).toBe("https://bucket.s3.amazonaws.com/signed-put");
    expect(result.chunkId).toBe("01a0a9c5-231d-7abc-8def-0123456789ab");
    expect(recordStoredChunk).toHaveBeenCalledWith("cfg-1", expect.anything());

    const values = createIfAbsent.mock.calls[0][0];
    expect(String(values.objectKey)).toMatch(
      /^logs\/proj-1\/sess-1\/proxy-1\/\d{4}-\d{2}-\d{2}\/01a0a9c5-231d-7abc-8def-0123456789ab\.json\.enc$/
    );
    expect(values.bucket).toBe("my-bucket");
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
    await expect(record(service)).resolves.toMatchObject({ chunkId: "01a0a9c5-231d-7abc-8def-0123456789ab" });
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
    await expect(record(service)).resolves.toMatchObject({ chunkId: "01a0a9c5-231d-7abc-8def-0123456789ab" });
  });

  test("a session whose owner was deleted more than a day ago is refused", async () => {
    const { service } = build({
      session: { ...liveSession(), userId: null, identityId: null, updatedAt: hoursAgo(25) }
    });
    await expect(record(service)).rejects.toMatchObject({
      message: "Session ended too long ago to accept session logs"
    });
  });

  test("an expiry in the future is not retirement", async () => {
    const { service } = build({
      session: { ...liveSession(), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
    });
    await expect(record(service)).resolves.toBeTruthy();
  });
});

describe("recordChunk: when session logs are off", () => {
  test.each([
    { why: "there is no config row", config: undefined },
    { why: "the switch is off", config: { ...enabledConfig(), enabled: false } },
    { why: "no bucket is set", config: { ...enabledConfig(), bucket: null } },
    { why: "the connection was detached", config: { ...enabledConfig(), appConnectionId: null } }
  ])("refuses with the named error when $why", async ({ config }) => {
    const { service, createIfAbsent } = build({ config });
    await expect(record(service)).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.Disabled });
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
    await expect(refusal).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.ClockSkew });
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
    await expect(record(service)).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.CeilingReached });
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
    const chunk = validChunk();
    const { service, recordStoredChunk, findChunk } = build({
      isReplay: true,
      existingChunk: atCurrentDestination(chunk)
    });

    const result = await record(service, chunk);

    expect(result.chunkId).toBe("01a0a9c5-231d-7abc-8def-0123456789ab");
    expect(result.uploadUrl).toBe("https://bucket.s3.amazonaws.com/signed-put");
    expect(findChunk).toHaveBeenCalledWith(
      { sessionId: "sess-1", chunkId: "01a0a9c5-231d-7abc-8def-0123456789ab" },
      expect.anything()
    );
    expect(recordStoredChunk).not.toHaveBeenCalled();
  });

  test("presigns against the stored row's size, not the resent body's claim", async () => {
    const chunk = validChunk();
    const existing = { ...atCurrentDestination(chunk), ciphertextBytes: 999 };
    const { service } = build({ isReplay: true, existingChunk: existing });
    await record(service, chunk);
    expect(presignPut).toHaveBeenCalledWith({ objectKey: existing.objectKey, ciphertextBytes: 999 });
  });

  test("a chunk re-sent after the destination moved is moved to the current bucket and key before it is presigned", async () => {
    const { service, repointChunk } = build({
      isReplay: true,
      existingChunk: { ...validChunk(), id: "row-1", bucket: "old-bucket", objectKey: "old/key.json.enc" }
    });
    await record(service);

    const [id, values] = repointChunk.mock.calls[0];
    expect(id).toBe("row-1");
    expect(values.bucket).toBe("my-bucket");
    expect(String(values.objectKey)).toMatch(
      /^logs\/proj-1\/sess-1\/proxy-1\/\d{4}-\d{2}-\d{2}\/01a0a9c5-231d-7abc-8def-0123456789ab\.json\.enc$/
    );
    expect(presignPut).toHaveBeenCalledWith({ objectKey: values.objectKey, ciphertextBytes: 4096 });
  });

  test("a chunk re-sent to the destination it is already at is left alone", async () => {
    const chunk = validChunk();
    const existing = atCurrentDestination(chunk);
    const { service, repointChunk } = build({ isReplay: true, existingChunk: existing });
    await record(service, chunk);

    expect(repointChunk).not.toHaveBeenCalled();
    expect(presignPut).toHaveBeenCalledWith({ objectKey: existing.objectKey, ciphertextBytes: 4096 });
  });

  test("a chunk id another proxy recorded is refused before the row is touched", async () => {
    const { service, repointChunk, recordStoredChunk } = build({
      isReplay: true,
      existingChunk: { ...validChunk(), proxyId: "proxy-2", bucket: "old-bucket", objectKey: "theirs/key.json.enc" }
    });

    await expect(record(service)).rejects.toMatchObject({
      name: "Conflict",
      message: "This chunk ID was already recorded by another proxy"
    });
    expect(repointChunk).not.toHaveBeenCalled();
    expect(recordStoredChunk).not.toHaveBeenCalled();
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("a row that vanished between the insert and the read is a 500, not a silent success", async () => {
    const { service } = build({ isReplay: true, existingChunk: null });
    await expect(record(service)).rejects.toMatchObject({
      message: "Session log chunk vanished between insert and read"
    });
  });

  test("a database error propagates rather than being read as a replay", async () => {
    const other = new DatabaseError({ error: { code: "23503" }, name: "create" });
    const { service, findChunk } = build({ createThrows: other });
    await expect(record(service)).rejects.toThrow();
    expect(findChunk).not.toHaveBeenCalled();
  });
});

describe("when the AWS connection can't be used", () => {
  const unusable = new BadRequestError({ message: "Couldn't use the AWS connection 'prod-logs': AccessDenied" });
  const storedRow = () => ({
    ...validChunk(),
    proxyId: "proxy-1",
    proxyName: "proxy-one",
    bucket: "my-bucket",
    objectKey: "logs/key.json.enc",
    createdAt: new Date()
  });
  const scope = {
    projectId: "proj-1",
    ctx: { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never,
    sessionId: "sess-1",
    limit: 100
  };
  const readSessionLogs = (service: ReturnType<typeof build>["service"]) => service.listSessionLogs(scope);
  const tailSessionLogs = (service: ReturnType<typeof build>["service"], receivedAfter: Date) =>
    service.tailSessionLogs({ ...scope, receivedAfter });

  test("a chunk is refused as a retryable 500 before any row is written", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { service, createIfAbsent } = build();
    await expect(record(service)).rejects.toMatchObject({ name: "InternalServerError", message: unusable.message });
    expect(createIfAbsent).not.toHaveBeenCalled();
  });

  test("a read lists the chunks without links and tells an admin why", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { service } = build({ pageRows: [storedRow()] });
    const page = await readSessionLogs(service);
    expect(page.sessionLogs.storageUnavailable).toEqual({ reason: "connection-unusable", message: unusable.message });
    expect(page.sessionLogs.sessionKey).toBeNull();
    expect(page.chunks.map((chunk) => chunk.presignedGetUrl)).toEqual([null]);
  });

  test("a live read holds its cursor so nothing is skipped once the connection is back", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { service } = build({ pageRows: [storedRow()] });
    const since = new Date(Date.now() - 60_000);
    const page = await tailSessionLogs(service, since);
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeTailCursor(since));
    expect(page.hasMore).toBe(false);
  });

  test("a read names each chunk's proxy by its current name", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { service } = build({ pageRows: [storedRow()], proxies: [{ ...PROXY, name: "proxy-renamed" }] });
    const page = await readSessionLogs(service);
    expect(page.chunks.map((chunk) => chunk.proxyName)).toEqual(["proxy-renamed"]);
  });

  test("a read falls back to the stored name once the proxy is deleted", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { service } = build({ pageRows: [storedRow()], proxies: [] });
    const page = await readSessionLogs(service);
    expect(page.chunks.map((chunk) => chunk.proxyName)).toEqual(["proxy-one"]);
  });
});

describe("updateSessionLogSettings: when the connection is checked again", () => {
  const ctx = { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never;
  const actor = { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never;

  const save = (service: ReturnType<typeof build>["service"], patch: Record<string, unknown>) =>
    service.updateSessionLogSettings({ projectId: "proj-1", ctx, actor, ...patch });

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

  test("skips it when the save leaves the destination as it was", async () => {
    const { service, validateConnection } = build();
    await save(service, {
      enabled: true,
      appConnectionId: "conn-1",
      bucket: "my-bucket",
      region: "us-east-1",
      keyPrefix: "logs"
    });
    expect(validateConnection).not.toHaveBeenCalled();
  });
});

describe("the storage cache", () => {
  test("an edited connection is used at once, not after the cache expires", async () => {
    const { service, findConnection } = build({
      connection: { id: "conn-1", updatedAt: new Date("2026-09-24T10:00:00.000Z") }
    });
    await record(service);
    await record(service);
    expect(buildSessionLogStorage).toHaveBeenCalledTimes(1);

    findConnection.mockResolvedValue({ id: "conn-1", updatedAt: new Date("2026-09-24T10:05:00.000Z") });
    await record(service);
    expect(buildSessionLogStorage).toHaveBeenCalledTimes(2);
  });
});

describe("updateSessionLogSettings: two first saves at once", () => {
  test("the one that loses reads as a clash to retry, not a server error", async () => {
    const { service } = build({
      config: undefined,
      configCreateThrows: new DatabaseError({ error: { code: "23505" }, name: "create" })
    });
    await expect(
      service.updateSessionLogSettings({
        projectId: "proj-1",
        ctx: { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never,
        actor: { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never,
        enabled: false
      })
    ).rejects.toThrow("Session log settings were just changed. Reload and try again.");
  });
});
