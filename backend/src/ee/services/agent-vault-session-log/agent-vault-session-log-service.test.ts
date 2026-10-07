import { S3ServiceException } from "@aws-sdk/client-s3";
import { createMongoAbility } from "@casl/ability";
import { v7 as uuidv7 } from "uuid";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { BadRequestError, DatabaseError } from "@app/lib/errors";

import {
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES,
  AGENT_VAULT_SESSION_LOG_RANGE_SEAL_MARGIN_MS,
  AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN
} from "./agent-vault-session-log-constants";
import { AgentVaultSessionLogErrorName } from "./agent-vault-session-log-enums";
import {
  buildSessionLogFolder,
  buildSessionLogObjectKey,
  encodeHistoryCursor,
  encodeTailCursor,
  toRev
} from "./agent-vault-session-log-fns";
import { agentVaultSessionLogServiceFactory } from "./agent-vault-session-log-service";
import { buildSessionLogStorage } from "./agent-vault-session-log-storage-fns";

const PROJECT_ID = "c4a1e0d2-5b7f-4c1e-9a3d-2f6b8e0c7a11";
const SESSION_ID = "5d2e9b41-0c3a-4f8e-b7d2-91a4c6e8f035";
const PROXY_ID = "e91f3c20-7d4b-4a8e-9f1c-3b5d7e2a6c48";
const FOLDER = buildSessionLogFolder({ keyPrefix: "logs", projectId: PROJECT_ID, sessionId: SESSION_ID });

const presignPut = vi.fn(async () => "https://bucket.s3.amazonaws.com/signed-put");
const presignGet = vi.fn(async (key: string) => `https://bucket.s3.amazonaws.com/${key}`);
const listChunks = vi.fn(async () => ({
  objects: [] as { key: string; size: number }[],
  isTruncated: false
}));
vi.mock("@app/lib/logger", () => ({ logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("./agent-vault-session-log-secrets", () => ({ unwrapSessionLogKey: vi.fn(async () => Buffer.alloc(32, 7)) }));
vi.mock("./agent-vault-session-log-storage-fns", () => {
  return {
    buildSessionLogStorage: vi.fn(async () => ({
      presignPut,
      presignGet,
      listChunks,
      mintCorsProbeUrl: vi.fn(async () => "https://bucket.s3.amazonaws.com/probe"),
      validate: vi.fn(async () => {})
    }))
  };
});

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
  appConnectionId: "conn-1",
  bucket: "my-bucket",
  region: "us-east-1",
  keyPrefix: "logs"
});

const validChunk = () => ({
  chunkId: uuidv7(),
  endedAt: new Date(Date.now() - 1_000),
  ciphertextBytes: 4096,
  ciphertextSha256: "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU"
});

const objectFor = (sealedAtMs: number, proxyId = PROXY_ID) => {
  const chunkId = uuidv7({ msecs: sealedAtMs });
  return { chunkId, key: buildSessionLogObjectKey({ folder: FOLDER, proxyId, chunkId }) };
};

type TFeedEntry = [string, string[]];

type TOverrides = {
  proxy?: unknown;
  session?: unknown;
  config?: unknown;
  feed?: TFeedEntry[];
  feedAddFails?: boolean;
  connection?: unknown;
  configCreateThrows?: unknown;
  licensed?: boolean;
  planFallback?: boolean;
  lastKnownPlan?: { plan: { agentVaultByoS3: boolean }; fetchedAt: number } | null;
};

const build = (overrides: TOverrides = {}) => {
  const validateConnection = vi.fn(async () => ({}));
  const findConnection = vi.fn(async () => overrides.connection);
  const config = "config" in overrides ? overrides.config : enabledConfig();
  const updateConfig = vi.fn(async (_id: string, values: Record<string, unknown>) => ({
    ...(config as object),
    ...values
  }));
  const streamAdd = vi.fn(async () =>
    overrides.feedAddFails ? Promise.reject(new Error("redis is down")) : "1791278402731-0"
  );
  const streamRange = vi.fn(async () => overrides.feed ?? []);

  const service = agentVaultSessionLogServiceFactory({
    agentVaultSessionLogConfigDAL: {
      findOne: vi.fn(async () => config),
      findByProjectIdFromPrimary: vi.fn(async () => config),
      updateById: updateConfig,
      create: vi.fn(async (values: Record<string, unknown>) => {
        if (overrides.configCreateThrows) return Promise.reject(overrides.configCreateThrows);
        return { ...enabledConfig(), ...values };
      })
    } as never,
    agentVaultSessionDAL: {
      findOne: vi.fn(async () => ("session" in overrides ? overrides.session : liveSession()))
    } as never,
    agentVaultProxyDAL: {
      findByIdWithOrg: vi.fn(async () => ("proxy" in overrides ? overrides.proxy : PROXY))
    } as never,
    appConnectionDAL: { findById: findConnection } as never,
    appConnectionService: { validateAppConnectionUsageById: validateConnection } as never,
    permissionService: {
      getProjectPermission: vi.fn(async () => ({
        permission: createMongoAbility([{ action: "read", subject: "agent-vault-sessions" }]),
        hasRole: () => true
      }))
    } as never,
    kmsService: { createCipherPairWithDataKey: vi.fn() } as never,
    licenseService: {
      getPlan: vi.fn(async () => ({ agentVaultByoS3: overrides.licensed ?? true })),
      isServingFallbackPlan: vi.fn(async () => overrides.planFallback ?? false),
      getLastKnownPlan: vi.fn(async () => overrides.lastKnownPlan ?? null)
    } as never,
    keyStore: { streamAdd, streamRange } as never
  });

  return { service, validateConnection, findConnection, updateConfig, streamAdd, streamRange };
};

const record = (service: ReturnType<typeof build>["service"], chunk = validChunk()) =>
  service.recordChunk({ proxyId: PROXY_ID, sessionId: SESSION_ID, chunk });

const scope = {
  projectId: PROJECT_ID,
  ctx: { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never,
  sessionId: SESSION_ID
};

beforeEach(() => {
  vi.clearAllMocks();
  listChunks.mockResolvedValue({ objects: [], isTruncated: false });
});

describe("recordChunk: who is allowed to write", () => {
  test("a happy path signs the chunk's name and adds it to the live feed", async () => {
    const { service, streamAdd } = build();
    const chunk = validChunk();
    const result = await record(service, chunk);

    expect(result.uploadUrl).toBe("https://bucket.s3.amazonaws.com/signed-put");
    expect(result.chunkId).toBe(chunk.chunkId);

    const objectKey = buildSessionLogObjectKey({ folder: FOLDER, proxyId: PROXY_ID, chunkId: chunk.chunkId });
    expect(presignPut).toHaveBeenCalledWith({
      objectKey,
      ciphertextBytes: 4096,
      ciphertextSha256: chunk.ciphertextSha256
    });
    expect(streamAdd).toHaveBeenCalledWith(
      `agent-vault-session-log-feed:${SESSION_ID}`,
      "*",
      { key: objectKey, bucket: "my-bucket", bytes: "4096" },
      10,
      120,
      true
    );
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
    const { service } = build({ config });
    await expect(record(service)).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.Disabled });
    expect(presignPut).not.toHaveBeenCalled();
  });
});

describe("recordChunk: the proxy's clock", () => {
  test("a proxy clock too far ahead is refused with the named error, saying how far", async () => {
    const { service } = build();
    const refusal = record(service, { ...validChunk(), endedAt: new Date(Date.now() + 10 * 60_000) });
    await expect(refusal).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.ClockSkew });
    await expect(refusal).rejects.toThrow(/about 10 minutes ahead/);
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("a small clock skew forward is tolerated", async () => {
    const { service } = build();
    const soon = new Date(Date.now() + 60_000);
    await expect(record(service, { ...validChunk(), endedAt: soon })).resolves.toBeTruthy();
  });

  test("a proxy clock more than 30 days behind is refused with the named error", async () => {
    const { service } = build();
    const refusal = record(service, { ...validChunk(), endedAt: new Date(Date.now() - 31 * 24 * 60 * 60_000) });
    await expect(refusal).rejects.toMatchObject({ name: AgentVaultSessionLogErrorName.ClockSkew });
    await expect(refusal).rejects.toThrow(/more than 30 days behind/);
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("a proxy clock a few days behind is tolerated", async () => {
    const { service } = build();
    await expect(
      record(service, { ...validChunk(), endedAt: new Date(Date.now() - 3 * 24 * 60 * 60_000) })
    ).resolves.toBeTruthy();
  });
});

describe("recordChunk: sending a chunk again", () => {
  test("signs the same name, so the create-only upload can't store it twice", async () => {
    const { service } = build();
    const chunk = validChunk();
    await record(service, chunk);
    await record(service, chunk);
    const [first, second] = presignPut.mock.calls as unknown as [{ objectKey: string }][];
    expect(first[0].objectKey).toBe(second[0].objectKey);
  });

  test("a chunk id another proxy also used lands under that proxy's own name", async () => {
    const chunk = validChunk();
    const { service } = build();
    await record(service, chunk);
    const { service: other } = build({ proxy: { ...PROXY, id: "0b5c8f2a-3d1e-4c7b-9a6f-2e8d4b1c7f30" } });
    await other.recordChunk({ proxyId: "0b5c8f2a-3d1e-4c7b-9a6f-2e8d4b1c7f30", sessionId: SESSION_ID, chunk });
    const [first, second] = presignPut.mock.calls as unknown as [{ objectKey: string }][];
    expect(first[0].objectKey).not.toBe(second[0].objectKey);
  });
});

describe("recordChunk: the live feed", () => {
  test("a feed that can't be written still hands out the upload url", async () => {
    const { service } = build({ feedAddFails: true });
    await expect(record(service)).resolves.toMatchObject({ uploadUrl: "https://bucket.s3.amazonaws.com/signed-put" });
  });
});

describe("when the AWS connection can't be used", () => {
  const unusable = new BadRequestError({ message: "Couldn't use the AWS connection 'prod-logs': AccessDenied" });

  test("a chunk is refused as a retryable 500 before it is signed, without the connection's details", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { service } = build();
    const error = (await record(service).catch((err: unknown) => err)) as Error;
    expect(error.name).toBe("InternalServerError");
    expect(error.message).not.toContain("prod-logs");
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("a read returns no chunks and tells an admin why", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { service } = build();
    const page = await service.listSessionLogs(scope);
    expect(page.sessionLogs.storageUnavailable).toEqual({ reason: "connection-unusable", message: unusable.message });
    expect(page.sessionLogs.sessionKey).toBeNull();
    expect(page.chunks).toEqual([]);
  });

  test("a read further back keeps its cursor, so a retry continues from the same place", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { service } = build();
    const page = await service.listSessionLogs({ ...scope, after: "some-name" });
    expect(page.nextCursor).toBe(encodeHistoryCursor("some-name"));
  });

  test("a live read holds its cursor so nothing is skipped once the connection is back", async () => {
    vi.mocked(buildSessionLogStorage).mockRejectedValueOnce(unusable);
    const { key } = objectFor(Date.now());
    const { service } = build({ feed: [["1791278402731-0", ["key", key, "bucket", "my-bucket", "bytes", "4096"]]] });
    const page = await service.tailSessionLogs({ ...scope, feedEntryId: "1791278402000-0" });
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeTailCursor("1791278402000-0"));
  });

  test("a bucket that refuses to list reads as unusable storage, not a 500", async () => {
    listChunks.mockRejectedValueOnce(
      new S3ServiceException({ name: "AccessDenied", $fault: "client", $metadata: {}, message: "Access Denied" })
    );
    const { service } = build();
    const page = await service.listSessionLogs(scope);
    expect(page.sessionLogs.storageUnavailable).toMatchObject({ reason: "connection-unusable" });
    expect(page.sessionLogs.storageUnavailable?.message).toContain("s3:ListBucket");
  });

  test("anything else that goes wrong while listing stays an error", async () => {
    listChunks.mockRejectedValueOnce(new TypeError("a bug"));
    const { service } = build();
    await expect(service.listSessionLogs(scope)).rejects.toThrow("a bug");
  });
});

describe("listSessionLogs: paging through the bucket", () => {
  test("a session that was never recordable lists nothing and never calls S3", async () => {
    const { service } = build({ session: { ...liveSession(), encryptedSessionLogKey: null } });
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(listChunks).not.toHaveBeenCalled();
  });

  test("returns each chunk with its proxy, seal time, size and a download link", async () => {
    const sealedAt = Date.now() - 60_000;
    const { chunkId, key } = objectFor(sealedAt);
    listChunks.mockResolvedValueOnce({ objects: [{ key, size: 4096 }], isTruncated: false });
    const { service } = build();

    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([
      {
        chunkId,
        proxyId: PROXY_ID,
        sealedAt: new Date(sealedAt),
        ciphertextBytes: 4096,
        presignedGetUrl: `https://bucket.s3.amazonaws.com/${key}`
      }
    ]);
    expect(page.sessionLogs.sessionKey).toBe(Buffer.alloc(32, 7).toString("base64"));
    expect(page.nextCursor).toBeNull();
  });

  test("a page ends at its byte budget and the cursor continues after the last chunk it took", async () => {
    const big = Math.floor(AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES * 0.6);
    const newer = objectFor(Date.now() - 1_000);
    const older = objectFor(Date.now() - 2_000);
    listChunks.mockResolvedValueOnce({
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
    listChunks.mockResolvedValueOnce({
      objects: [{ key: huge.key, size: AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES * 4 }],
      isTruncated: false
    });
    const { service } = build();
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toHaveLength(1);
  });

  test("skips files it didn't write, and still moves past them", async () => {
    listChunks.mockResolvedValueOnce({ objects: [{ key: `${FOLDER}notes.txt`, size: 10 }], isTruncated: true });
    const { service } = build();
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeHistoryCursor("notes.txt"));
  });

  test("an empty page that says more remain ends the listing instead of failing", async () => {
    listChunks.mockResolvedValueOnce({ objects: [], isTruncated: true });
    const { service } = build();
    const page = await service.listSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  test("a cursor continues after the name it carries", async () => {
    const { service } = build();
    await service.listSessionLogs({ ...scope, after: "8208694117999_x" });
    expect(listChunks).toHaveBeenCalledWith({ folder: FOLDER, startAfter: `${FOLDER}8208694117999_x` });
  });

  test("a date range starts listing at its end plus the seal margin", async () => {
    const to = new Date("2026-10-07T10:00:00.000Z");
    const { service } = build();
    await service.listSessionLogs({ ...scope, from: new Date("2026-10-07T09:00:00.000Z"), to });
    expect(listChunks).toHaveBeenCalledWith({
      folder: FOLDER,
      startAfter: `${FOLDER}${toRev(to.getTime() + AGENT_VAULT_SESSION_LOG_RANGE_SEAL_MARGIN_MS)}`
    });
  });

  test("stops at the first chunk sealed before the range starts, with nothing older to load", async () => {
    const from = new Date(Date.now() - 60_000);
    const inside = objectFor(from.getTime() + 1_000);
    const before = objectFor(from.getTime() - 1_000);
    listChunks.mockResolvedValueOnce({
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

    const page = await service.tailSessionLogs({ ...scope, feedEntryId: "99-0" });
    expect(page.chunks.map((chunk) => chunk.chunkId)).toEqual([first.chunkId, second.chunkId]);
    expect(page.chunks[0]).toMatchObject({ proxyId: PROXY_ID, ciphertextBytes: 4096 });
    expect(page.nextCursor).toBe(encodeTailCursor("101-0"));
  });

  test("an entry sent twice for the same chunk is returned once", async () => {
    const { key } = objectFor(Date.now());
    const { service } = build({ feed: [entry("100-0", key), entry("101-0", key)] });
    const page = await service.tailSessionLogs(scope);
    expect(page.chunks).toHaveLength(1);
  });

  test("skips entries from an earlier bucket or prefix, and still moves past them", async () => {
    const { key } = objectFor(Date.now());
    const { service } = build({
      feed: [entry("100-0", key, "old-bucket"), entry("101-0", `old-prefix/${PROJECT_ID}/${SESSION_ID}/x.json.enc`)]
    });
    const page = await service.tailSessionLogs(scope);
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeTailCursor("101-0"));
  });

  test("an empty feed keeps the cursor and never touches the AWS connection", async () => {
    const { service } = build();
    const page = await service.tailSessionLogs({ ...scope, feedEntryId: "99-0" });
    expect(page.chunks).toEqual([]);
    expect(page.nextCursor).toBe(encodeTailCursor("99-0"));
    expect(buildSessionLogStorage).not.toHaveBeenCalled();
  });
});

describe("updateSessionLogSettings: when the connection is checked again", () => {
  const ctx = { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never;
  const actor = { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never;

  const save = (service: ReturnType<typeof build>["service"], patch: Record<string, unknown>) =>
    service.updateSessionLogSettings({ projectId: PROJECT_ID, ctx, actor, ...patch });

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

describe("updateSessionLogSettings: directory buckets", () => {
  const ctx = { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never;
  const actor = { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never;

  test("refuses a directory bucket, which can't list in order", async () => {
    const { service, updateConfig } = build();
    await expect(
      service.updateSessionLogSettings({ projectId: PROJECT_ID, ctx, actor, bucket: "logs--usw2-az1--x-s3" })
    ).rejects.toThrow("Directory buckets");
    expect(updateConfig).not.toHaveBeenCalled();
  });

  test("a directory bucket already saved can still be turned off", async () => {
    const { service, updateConfig } = build({ config: { ...enabledConfig(), bucket: "logs--usw2-az1--x-s3" } });
    await service.updateSessionLogSettings({ projectId: PROJECT_ID, ctx, actor, enabled: false });
    expect(updateConfig).toHaveBeenCalledTimes(1);
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
        projectId: PROJECT_ID,
        ctx: { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never,
        actor: { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never,
        enabled: false
      })
    ).rejects.toThrow("Session log settings were just changed. Reload and try again.");
  });
});

describe("without session logs on the plan", () => {
  const ctx = { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never;
  const actor = { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never;

  const save = (service: ReturnType<typeof build>["service"], patch: Record<string, unknown>) =>
    service.updateSessionLogSettings({ projectId: PROJECT_ID, ctx, actor, ...patch });

  test("a save that turns recording on is refused before the connection is checked", async () => {
    const { service, validateConnection, updateConfig } = build({
      licensed: false,
      config: { ...enabledConfig(), enabled: false }
    });
    await expect(save(service, { enabled: true })).rejects.toThrow(AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN);
    expect(validateConnection).not.toHaveBeenCalled();
    expect(updateConfig).not.toHaveBeenCalled();
  });

  test("a save that changes the bucket is refused", async () => {
    const { service, updateConfig } = build({ licensed: false });
    await expect(save(service, { bucket: "another-bucket" })).rejects.toThrow(AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN);
    expect(updateConfig).not.toHaveBeenCalled();
  });

  test("a save that turns recording off still works", async () => {
    const { service, updateConfig } = build({ licensed: false });
    const { settings } = await save(service, { enabled: false });
    expect(settings.enabled).toBe(false);
    expect(updateConfig).toHaveBeenCalledTimes(1);
  });

  test("a save that turns recording off and removes the connection still works", async () => {
    const { service, validateConnection } = build({ licensed: false });
    const { settings } = await save(service, { enabled: false, appConnectionId: null });
    expect(settings).toMatchObject({ enabled: false, appConnectionId: null });
    expect(validateConnection).not.toHaveBeenCalled();
  });

  test("a chunk is refused with the error that tells the proxy logging is off", async () => {
    const { service } = build({ licensed: false });
    await expect(record(service)).rejects.toMatchObject({
      name: AgentVaultSessionLogErrorName.Disabled,
      message: AGENT_VAULT_SESSION_LOGS_NOT_ON_PLAN
    });
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("logs recorded while it was on can still be read, and read as not recording", async () => {
    const { key } = objectFor(Date.now());
    listChunks.mockResolvedValueOnce({ objects: [{ key, size: 4096 }], isTruncated: false });
    const { service } = build({ licensed: false });
    const page = await service.listSessionLogs({ projectId: PROJECT_ID, ctx, sessionId: SESSION_ID });
    expect(page.chunks).toHaveLength(1);
    expect(page.sessionLogs.enabled).toBe(false);
  });
});

describe("while the License Server can't be reached", () => {
  const ctx = { actor: "user", actorId: "user-1", actorOrgId: "org-1", actorAuthMethod: null } as never;
  const actor = { type: "user", id: "user-1", orgId: "org-1", authMethod: null } as never;
  const unreachable = { licensed: false, planFallback: true } as const;

  test("a chunk from a paid org is still accepted on its last known plan", async () => {
    const { service } = build({
      ...unreachable,
      lastKnownPlan: { plan: { agentVaultByoS3: true }, fetchedAt: Date.now() - 10 * 60_000 }
    });
    await record(service);
    expect(presignPut).toHaveBeenCalledTimes(1);
  });

  test("a chunk is held, not refused, when there is no recent real answer", async () => {
    const { service } = build({
      ...unreachable,
      lastKnownPlan: { plan: { agentVaultByoS3: true }, fetchedAt: Date.now() - 2 * 60 * 60_000 }
    });
    await expect(record(service)).rejects.toMatchObject({ name: "InternalServerError" });
    expect(presignPut).not.toHaveBeenCalled();
  });

  test("a save that needs the plan says it couldn't be confirmed", async () => {
    const { service, updateConfig } = build({ ...unreachable, config: { ...enabledConfig(), enabled: false } });
    await expect(
      service.updateSessionLogSettings({ projectId: PROJECT_ID, ctx, actor, enabled: true })
    ).rejects.toThrow("Infisical couldn't confirm your plan right now. Try again in a few minutes.");
    expect(updateConfig).not.toHaveBeenCalled();
  });

  test("a page still reads as recording", async () => {
    const { service } = build({ ...unreachable });
    const page = await service.listSessionLogs({ projectId: PROJECT_ID, ctx, sessionId: SESSION_ID });
    expect(page.sessionLogs.enabled).toBe(true);
  });
});
