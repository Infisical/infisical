import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { fakeActivityStorage } from "e2e-test/fakes/agent-vault-activity-storage";
import { createAwsAppConnection, deleteAppConnection } from "e2e-test/testUtils/secret-syncs";

import { OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { agentVaultActivityConfigDALFactory } from "@app/ee/services/agent-vault-activity/agent-vault-activity-config-dal";
import { AgentVaultActivityErrorName } from "@app/ee/services/agent-vault-activity/agent-vault-activity-constants";
import { agentVaultActivitySweepServiceFactory } from "@app/ee/services/agent-vault-activity/agent-vault-activity-sweep-service";
import { agentVaultSessionDALFactory } from "@app/ee/services/agent-vault-session/agent-vault-session-dal";
import { initLogger } from "@app/lib/logger";

initLogger();

const authHeader = { authorization: `Bearer ${jwtAuthToken}` };

const inject = (method: "GET" | "POST" | "PATCH" | "DELETE", url: string, body?: Record<string, unknown>) =>
  testServer.inject({ method, url, headers: authHeader, ...(body ? { body } : {}) });

const getProjectId = async () =>
  (JSON.parse((await inject("GET", "/api/v1/agent-vault/project")).payload) as { projectId: string }).projectId;

const createAccessBundle = async (name: string) => {
  const res = await inject("POST", "/api/v1/agent-vault/access-bundles", { name });
  expect(res.statusCode).toBe(200);
  return (JSON.parse(res.payload) as { accessBundle: { id: string; name: string } }).accessBundle;
};

const mintSession = async (bundleName: string, ttl = "1h") => {
  const res = await inject("POST", "/api/v1/agent-vault/sessions", { accessBundles: [bundleName], ttl });
  expect(res.statusCode).toBe(200);
  // The token is returned once, inside the session object, and never again.
  return (JSON.parse(res.payload) as { session: { id: string; token: string } }).session;
};

/**
 * A fresh machine identity rather than demoting the seeded admin: the project permission cache serves a
 * 10 second marker, so a role change made mid-test is not visible to the next request.
 */
const createMemberIdentity = async (name: string) => {
  const created = await inject("POST", "/api/v1/identities", {
    name,
    role: OrgMembershipRole.Member,
    organizationId: seedData1.organization.id
  });
  expect(created.statusCode).toBe(200);
  const identity = created.json().identity as { id: string };

  const attached = await inject("POST", `/api/v1/auth/universal-auth/identities/${identity.id}`, {
    accessTokenTTL: 3600,
    accessTokenMaxTTL: 3600,
    accessTokenNumUsesLimit: 0
  });
  expect(attached.statusCode).toBe(200);
  const { clientId } = attached.json().identityUniversalAuth;

  const secret = await inject("POST", `/api/v1/auth/universal-auth/identities/${identity.id}/client-secrets`, {});
  expect(secret.statusCode).toBe(200);

  const login = await testServer.inject({
    method: "POST",
    url: "/api/v1/auth/universal-auth/login",
    body: { clientId, clientSecret: secret.json().clientSecret }
  });
  expect(login.statusCode).toBe(200);
  const token = login.json().accessToken as string;

  expect(
    (
      await inject("POST", "/api/v1/agent-vault/members", {
        machineIdentityIds: [identity.id],
        role: ProjectMembershipRole.Member
      })
    ).statusCode
  ).toBe(200);

  return {
    id: identity.id,
    as: (method: "GET" | "POST" | "PATCH", url: string, body?: Record<string, unknown>) =>
      testServer.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(body ? { body } : {}) }),
    cleanup: () => inject("DELETE", `/api/v1/identities/${identity.id}`)
  };
};

/** A self-signed CA, which is all enrollment checks: it records the fingerprint and never stores the PEM. */
const generateRootCaPem = async () => {
  const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" } as const;
  const keys = await x509.cryptoProvider.get().subtle.generateKey(alg, false, ["sign", "verify"]);
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: "01",
    name: "CN=agent-vault-test-ca",
    notBefore: new Date(Date.now() - 60_000),
    notAfter: new Date(Date.now() + 24 * 60 * 60 * 1000),
    signingAlgorithm: alg,
    keys,
    extensions: [new x509.BasicConstraintsExtension(true, 1, true)]
  });
  return cert.toString("pem");
};

/**
 * A fully enrolled proxy, so the chunk endpoint is exercised the way the Go proxy reaches it: its own
 * auth mode, its own rate limit and the route's params, not just the service beneath them.
 */
const createProxy = async (name: string) => {
  const res = await inject("POST", "/api/v1/agent-vault/proxies", { name });
  expect(res.statusCode).toBe(200);
  const { proxy, token } = JSON.parse(res.payload) as { proxy: { id: string; name: string }; token: string };

  const enrolled = await testServer.inject({
    method: "POST",
    url: "/api/v1/agent-vault/proxy/login",
    body: { method: "token", token, rootCaCertificate: await generateRootCaPem() }
  });
  expect(enrolled.statusCode, enrolled.payload).toBe(200);
  const { accessToken } = JSON.parse(enrolled.payload) as { accessToken: string };

  return {
    ...proxy,
    postChunk: (sessionId: string, chunk: Record<string, unknown>) =>
      testServer.inject({
        method: "POST",
        url: `/api/v1/agent-vault/proxy/sessions/${sessionId}/activity/chunks`,
        headers: { authorization: `Bearer ${accessToken}` },
        body: chunk
      }),
    resolve: (sessionToken: string, hasActivityKey?: boolean) =>
      testServer.inject({
        method: "POST",
        url: "/api/v1/agent-vault/proxy/resolve",
        headers: { authorization: `Bearer ${accessToken}`, "x-infisical-agent-session": sessionToken },
        ...(hasActivityKey === undefined ? {} : { body: { hasActivityKey } })
      })
  };
};

// Monotonic per test run so chunks sort the way the proxy's would.
let ulidCounter = 0;
const nextChunkId = () => {
  ulidCounter += 1;
  return `01K5${ulidCounter.toString().padStart(22, "0")}`.toUpperCase();
};

// Large enough to be plausible for ten records: the server rejects a chunk that claims more records
// than its bytes could hold, because recordCount is what moves the organization's ceiling.
const CHUNK_BYTES = 1024;

const chunkBody = (overrides: Record<string, unknown> = {}) => ({
  chunkId: nextChunkId(),
  startedAt: new Date(Date.now() - 60_000),
  endedAt: new Date(Date.now() - 1_000),
  firstSeq: 0,
  lastSeq: 9,
  recordCount: 10,
  droppedCount: 0,
  ciphertextBytes: CHUNK_BYTES,
  iv: "qrvM3e7/ABEiM0RV",
  ...overrides
});

/** Posts a chunk and asserts it was accepted, returning the upload url the proxy would PUT to. */
const recordChunk = async (
  proxy: Awaited<ReturnType<typeof createProxy>>,
  sessionId: string,
  chunk: Record<string, unknown> = chunkBody()
) => {
  const res = await proxy.postChunk(sessionId, chunk);
  expect(res.statusCode, res.payload).toBe(200);
  return JSON.parse(res.payload) as { chunkId: string; uploadUrl: string; expiresInSeconds: number };
};

const buildSweepService = () =>
  agentVaultActivitySweepServiceFactory({
    agentVaultSessionDAL: agentVaultSessionDALFactory(testDb),
    agentVaultActivityConfigDAL: agentVaultActivityConfigDALFactory(testDb),
    appConnectionDAL: { findById: () => Promise.resolve({ orgId: seedData1.organization.id, app: "aws" }) } as never,
    kmsService: {} as never,
    cronJob: { register: () => {} } as never
  });

const BUCKET = "activity-bucket";

const saveConfig = async (patch: Record<string, unknown>) =>
  inject("PATCH", "/api/v1/agent-vault/activity/config", patch);

describe("Agent Vault activity", async () => {
  let connectionId: string;
  let projectId: string;

  beforeAll(async () => {
    projectId = await getProjectId();
    expect(
      (await inject("POST", `/api/v1/organization-admin/projects/${projectId}/grant-admin-access`)).statusCode
    ).toBe(200);
    connectionId = await createAwsAppConnection({ name: `activity-aws-${Date.now()}`, authToken: jwtAuthToken });
  });

  /**
   * These specs share one database and one seeded org, and this file sorts before agent-vault.spec.ts,
   * which asserts the Agent Vault project bootstraps with no members. So everything created here is
   * removed again, including the admin membership this file needs in order to reach the settings routes.
   */
  afterAll(async () => {
    await testDb("agent_vault_activity_chunks").where({ projectId }).del();
    await testDb("agent_vault_activity_configs").where({ projectId }).del();
    await testDb("agent_vault_sessions").where({ projectId }).del();
    await testDb("agent_vault_proxies").where({ projectId }).del();
    await testDb("agent_vault_access_bundles").where({ projectId }).del();
    await testDb("memberships").where({ scopeProjectId: projectId }).del();
    await deleteAppConnection({ connectionId, authToken: jwtAuthToken });
  });

  beforeEach(async () => {
    fakeActivityStorage.reset();
    await testDb("agent_vault_activity_chunks").where({ projectId }).del();
    await testDb("agent_vault_activity_configs").where({ projectId }).del();
  });

  describe("settings", () => {
    test("reads as off, with no destination and the org ceiling, before anything is configured", async () => {
      const res = await inject("GET", "/api/v1/agent-vault/activity/config");
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload) as {
        config: Record<string, unknown>;
        usage: { storedRecordCount: number; ceiling: number };
        corsProbeUrl: string | null;
      };
      expect(body.config).toMatchObject({ enabled: false, bucket: null, appConnectionId: null, configVersion: 1 });
      expect(body.usage.storedRecordCount).toBe(0);
      expect(body.usage.ceiling).toBeGreaterThan(0);
      expect(body.corsProbeUrl).toBeNull();
    });

    test("saving a destination validates the bucket and hands back a CORS probe url", async () => {
      const res = await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });
      expect(res.statusCode, res.payload).toBe(200);

      const body = JSON.parse(res.payload) as { config: Record<string, unknown>; corsProbeUrl: string };
      expect(body.config).toMatchObject({ enabled: true, bucket: BUCKET, region: "us-east-1", keyPrefix: "logs/" });
      expect(body.corsProbeUrl).toContain("cors-probe");
    });

    test("a bucket it cannot write to is refused with the actionable message, and nothing is saved", async () => {
      fakeActivityStorage.failsValidationWith(
        "Bucket 'nope' is reachable but writing to it failed. Grant s3:PutObject on the configured key prefix"
      );

      const res = await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: "nope",
        region: "us-east-1"
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("s3:PutObject");

      expect(await testDb("agent_vault_activity_configs").where({ projectId }).first()).toBeUndefined();
    });

    test("turning logging on without a complete destination names what is missing", async () => {
      const res = await saveConfig({ enabled: true });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("appConnectionId");
      expect(JSON.parse(res.payload).message).toContain("bucket");
    });

    test("moving the bucket bumps configVersion; changing the region or the connection does not", async () => {
      await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });

      const sameSpot = await saveConfig({ region: "us-west-2" });
      expect(JSON.parse(sameSpot.payload).config.configVersion).toBe(1);

      const movedPrefix = await saveConfig({ keyPrefix: "other" });
      expect(JSON.parse(movedPrefix.payload).config.configVersion).toBe(2);

      const movedBucket = await saveConfig({ bucket: "second-bucket" });
      expect(JSON.parse(movedBucket.payload).config.configVersion).toBe(3);
    });

    test("a patch leaves out what it does not name", async () => {
      await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });

      const off = await saveConfig({ enabled: false });
      expect(JSON.parse(off.payload).config).toMatchObject({ enabled: false, bucket: BUCKET, keyPrefix: "logs/" });
    });

    test("the key prefix is normalised, so two spellings of one prefix are one destination", async () => {
      const res = await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "/logs/"
      });
      expect(JSON.parse(res.payload).config.keyPrefix).toBe("logs/");
    });

    test("a non-admin member cannot read or change the settings", async () => {
      const member = await createMemberIdentity(`activity-member-${Date.now()}`);
      try {
        expect((await member.as("GET", "/api/v1/agent-vault/activity/config")).statusCode).toBe(403);
        expect((await member.as("PATCH", "/api/v1/agent-vault/activity/config", { enabled: false })).statusCode).toBe(
          403
        );
      } finally {
        await member.cleanup();
      }
    });
  });

  describe("recording a chunk", () => {
    const configure = async (patch: Record<string, unknown> = {}) =>
      saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs",
        ...patch
      });

    test("writes the row before the object exists, then presigns an upload for exactly that many bytes", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-write-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-write-${Date.now()}`);

      const chunk = chunkBody();
      const result = await recordChunk(proxy, session.id, chunk);

      const row = await testDb("agent_vault_activity_chunks").where({ sessionId: session.id }).first();
      expect(row).toMatchObject({ chunkId: chunk.chunkId, proxyId: proxy.id, proxyName: proxy.name, recordCount: 10 });
      expect(row.objectKey).toMatch(/^logs\/.+\/\d{4}-\d{2}-\d{2}\/.+\.json\.enc$/);

      // The row landed first: nothing is in the bucket until the proxy uploads.
      expect(fakeActivityStorage.objectKeys(BUCKET)).toEqual([]);

      fakeActivityStorage.put(result.uploadUrl, Buffer.alloc(CHUNK_BYTES));
      expect(fakeActivityStorage.objectKeys(BUCKET)).toEqual([row.objectKey]);

      // The presign pins the length, so a proxy cannot reuse the url for a larger body.
      expect(() => fakeActivityStorage.put(result.uploadUrl, Buffer.alloc(CHUNK_BYTES + 1))).toThrow();
    });

    test("counts the records against the org, and the sweep gives them back", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-count-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-count-${Date.now()}`);
      await recordChunk(proxy, session.id);
      await recordChunk(proxy, session.id, chunkBody({ firstSeq: 10, lastSeq: 19 }));

      const config = await testDb("agent_vault_activity_configs").where({ projectId }).first();
      expect(Number(config.storedRecordCount)).toBe(20);
    });

    test("re-sending a chunk replays the same row and counts nothing twice", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-replay-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-replay-${Date.now()}`);
      const chunk = chunkBody();
      const first = await recordChunk(proxy, session.id, chunk);
      const second = await recordChunk(proxy, session.id, chunk);

      expect(second.chunkId).toBe(first.chunkId);
      expect(second.uploadUrl).not.toBe(first.uploadUrl); // a fresh, unexpired url
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: session.id }).count()).toEqual([
        { count: "1" }
      ]);
      expect(
        Number((await testDb("agent_vault_activity_configs").where({ projectId }).first()).storedRecordCount)
      ).toBe(10);
    });

    test("two proxies can write to one session, and a chunk id is only unique within it", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-two-${Date.now()}`);
      const sessionA = await mintSession(bundle.name);
      const sessionB = await mintSession(bundle.name);
      const proxyOne = await createProxy(`activity-two-a-${Date.now()}`);
      const proxyTwo = await createProxy(`activity-two-b-${Date.now()}`);
      const sharedId = nextChunkId();
      await recordChunk(proxyOne, sessionA.id, chunkBody({ chunkId: sharedId }));
      await recordChunk(proxyTwo, sessionA.id);
      // The same chunk id under a different session is a different chunk, so a foreign proxy cannot squat one.
      await recordChunk(proxyTwo, sessionB.id, chunkBody({ chunkId: sharedId }));

      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: sessionA.id })).toHaveLength(2);
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: sessionB.id })).toHaveLength(1);
    });

    test("is refused with the named error while logging is off", async () => {
      await configure({ enabled: false });
      const bundle = await createAccessBundle(`activity-off-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-off-${Date.now()}`);

      const res = await proxy.postChunk(session.id, chunkBody());
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe(AgentVaultActivityErrorName.Disabled);
    });

    test("a session in another project is a 404 that reads like a missing one", async () => {
      await configure();
      const proxy = await createProxy(`activity-foreign-${Date.now()}`);

      const res = await proxy.postChunk(crypto.randomUUID(), chunkBody());
      expect(res.statusCode).toBe(404);
      expect(JSON.parse(res.payload).message).toBe("Session not found");
    });
  });

  describe("what resolve tells the proxy", () => {
    const configure = async (patch: Record<string, unknown> = {}) =>
      saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs",
        ...patch
      });

    const setup = async (label: string) => {
      const bundle = await createAccessBundle(`activity-resolve-${label}-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-resolve-${label}-${Date.now()}`);
      return { session, proxy };
    };

    test("hands the key over once, then trusts the proxy's cached copy", async () => {
      await configure();
      const { session, proxy } = await setup("key");

      const first = await proxy.resolve(session.token, false);
      expect(first.statusCode, first.payload).toBe(200);
      const firstBody = JSON.parse(first.payload) as {
        activity: { enabled: boolean; sessionKey: string | null; projectId: string };
      };
      expect(firstBody.activity.enabled).toBe(true);
      expect(firstBody.activity.projectId).toBe(projectId);
      expect(Buffer.from(firstBody.activity.sessionKey!, "base64")).toHaveLength(32);

      // Unwrapping derives the project data key, so a proxy that already holds it is not charged for it
      // on every poll. Getting this backwards would silently stop all logging after the first poll.
      const second = await proxy.resolve(session.token, true);
      const secondBody = JSON.parse(second.payload) as { activity: { enabled: boolean; sessionKey: string | null } };
      expect(secondBody.activity.enabled).toBe(true);
      expect(secondBody.activity.sessionKey).toBeNull();

      // The key is stable, so a proxy that lost its cache gets the same one back.
      const third = await proxy.resolve(session.token, false);
      expect(JSON.parse(third.payload).activity.sessionKey).toBe(firstBody.activity.sessionKey);
    });

    test("reports logging as off, with no key, when the project has no destination", async () => {
      const { session, proxy } = await setup("off");

      const res = await proxy.resolve(session.token, false);
      expect(res.statusCode, res.payload).toBe(200);
      expect(JSON.parse(res.payload).activity).toMatchObject({ enabled: false, sessionKey: null, projectId });
    });

    test("turning logging off reaches a running proxy on its next poll", async () => {
      await configure();
      const { session, proxy } = await setup("flip");
      expect(JSON.parse((await proxy.resolve(session.token, false)).payload).activity.enabled).toBe(true);

      expect((await saveConfig({ enabled: false })).statusCode).toBe(200);

      expect(JSON.parse((await proxy.resolve(session.token, true)).payload).activity.enabled).toBe(false);
    });

    test("a proxy that predates activity logging sends no body and still resolves", async () => {
      await configure();
      const { session, proxy } = await setup("legacy");

      const res = await proxy.resolve(session.token);
      expect(res.statusCode, res.payload).toBe(200);
      // No claim to a cached key, so it is treated as not holding one.
      expect(Buffer.from(JSON.parse(res.payload).activity.sessionKey as string, "base64")).toHaveLength(32);
    });
  });

  describe("what the write endpoint refuses", () => {
    const configure = async () =>
      saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });

    const setup = async (label: string) => {
      const bundle = await createAccessBundle(`activity-refuse-${label}-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-refuse-${label}-${Date.now()}`);
      return { session, proxy };
    };

    test.each([
      { why: "the chunk id is not a ULID", patch: { chunkId: "nope" } },
      { why: "the record count is over the slice size", patch: { recordCount: 1001 } },
      { why: "the record count is zero", patch: { recordCount: 0 } },
      { why: "the IV is the wrong width", patch: { iv: "short" } },
      { why: "the ciphertext is smaller than an empty sealed array", patch: { ciphertextBytes: 4 } }
    ])("rejects a malformed chunk when $why", async ({ patch }) => {
      await configure();
      const { session, proxy } = await setup("schema");

      const res = await proxy.postChunk(session.id, chunkBody(patch));
      expect(res.statusCode).toBe(422);
    });

    test.each([
      { why: "endedAt precedes startedAt", patch: { startedAt: new Date(), endedAt: new Date(Date.now() - 60_000) } },
      { why: "endedAt is far in the future", patch: { endedAt: new Date(Date.now() + 10 * 60_000) } },
      { why: "the sequence range cannot hold the records", patch: { firstSeq: 0, lastSeq: 2, recordCount: 10 } }
    ])("rejects a chunk that cannot be true when $why", async ({ patch }) => {
      await configure();
      const { session, proxy } = await setup("semantic");

      const res = await proxy.postChunk(session.id, chunkBody(patch));
      expect(res.statusCode).toBe(400);
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: session.id })).toHaveLength(0);
    });

    test("refuses a session that retired more than a day ago", async () => {
      await configure();
      const { session, proxy } = await setup("retired");

      await testDb("agent_vault_sessions")
        .where({ id: session.id })
        .update({ revokedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });

      const res = await proxy.postChunk(session.id, chunkBody());
      expect(res.statusCode).toBe(401);
    });

    test("still accepts a chunk from a session revoked minutes ago", async () => {
      await configure();
      const { session, proxy } = await setup("grace");

      expect((await inject("POST", `/api/v1/agent-vault/sessions/${session.id}/revoke`)).statusCode).toBe(200);

      const res = await proxy.postChunk(session.id, chunkBody());
      expect(res.statusCode, res.payload).toBe(200);
    });

    test("refuses an unauthenticated write", async () => {
      await configure();
      const { session } = await setup("anon");

      const res = await testServer.inject({
        method: "POST",
        url: `/api/v1/agent-vault/proxy/sessions/${session.id}/activity/chunks`,
        body: chunkBody()
      });
      expect(res.statusCode).toBe(401);
    });

    test("refuses a user token: this endpoint is for proxies only", async () => {
      await configure();
      const { session } = await setup("user");

      const res = await inject("POST", `/api/v1/agent-vault/proxy/sessions/${session.id}/activity/chunks`, chunkBody());
      // verifyAuth answers a wrong auth mode with 403, as it does on every proxy-only route.
      expect(res.statusCode).toBe(403);
    });
  });

  describe("reading a session's activity", () => {
    const configure = async () =>
      saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });

    const seedChunks = async (count: number) => {
      const bundle = await createAccessBundle(`activity-read-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-read-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
      for (let i = 0; i < count; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        const { uploadUrl } = await recordChunk(
          proxy,
          session.id,
          chunkBody({ firstSeq: i * 10, lastSeq: i * 10 + 9 })
        );
        fakeActivityStorage.put(uploadUrl, Buffer.alloc(CHUNK_BYTES));
      }
      return { session, proxy };
    };

    test("returns the newest chunks first, each with a presigned url and the key to open them", async () => {
      await configure();
      const { session, proxy } = await seedChunks(3);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload) as {
        enabled: boolean;
        sessionKey: string;
        projectId: string;
        chunks: { chunkId: string; proxyId: string; presignedGetUrl: string | null; recordCount: number }[];
        nextCursor: string | null;
      };

      expect(body.enabled).toBe(true);
      expect(body.projectId).toBe(projectId);
      expect(Buffer.from(body.sessionKey, "base64")).toHaveLength(32);
      expect(body.chunks).toHaveLength(3);
      expect(body.chunks.every((chunk) => chunk.proxyId === proxy.id)).toBe(true);

      // Newest first.
      const ids = body.chunks.map((chunk) => chunk.chunkId);
      expect([...ids].sort().reverse()).toEqual(ids);

      // Every url resolves to the object the proxy uploaded.
      body.chunks.forEach((chunk) => {
        expect(fakeActivityStorage.get(chunk.presignedGetUrl!)).toHaveLength(CHUNK_BYTES);
      });
    });

    test("pages with a cursor, and the last page reports no more", async () => {
      await configure();
      const { session } = await seedChunks(5);

      const first = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity?limit=2`);
      const firstBody = JSON.parse(first.payload) as { chunks: { chunkId: string }[]; nextCursor: string | null };
      expect(firstBody.chunks).toHaveLength(2);
      expect(firstBody.nextCursor).toBe(firstBody.chunks[1].chunkId);

      const second = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/activity?limit=2&before=${firstBody.nextCursor}`
      );
      const secondBody = JSON.parse(second.payload) as { chunks: { chunkId: string }[]; nextCursor: string | null };
      expect(secondBody.chunks).toHaveLength(2);
      // The pages do not overlap.
      expect(secondBody.chunks.map((c) => c.chunkId)).not.toContain(firstBody.chunks[1].chunkId);

      const third = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/activity?limit=2&before=${secondBody.nextCursor}`
      );
      const thirdBody = JSON.parse(third.payload) as { chunks: unknown[]; nextCursor: string | null };
      expect(thirdBody.chunks).toHaveLength(1);
      expect(thirdBody.nextCursor).toBeNull();
    });

    /**
     * The page is ordered and cursored on the same column, so no row can fall between two pages. This
     * broke when the query ordered by startedAt and filtered on chunkId: a chunk sealed late but
     * covering an early window sorts differently under the two, and the cursor dropped it for good.
     * The short page then read as the end of the session, which is the worst failure an audit log has.
     */
    test("pages cover every chunk when seal order and record order disagree", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-order-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const slow = await createProxy(`activity-order-slow-${Date.now()}`);
      const quick = await createProxy(`activity-order-quick-${Date.now()}`);

      const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

      // Interleaved on purpose: the chunk ids ascend with the order they are written, while startedAt
      // descends, so the two orderings are exact opposites.
      const written: string[] = [];
      for (let i = 0; i < 6; i += 1) {
        const startedAt = hoursAgo(i + 1);
        // eslint-disable-next-line no-await-in-loop
        const { chunkId } = await recordChunk(
          i % 2 === 0 ? slow : quick,
          session.id,
          chunkBody({ startedAt, endedAt: startedAt, firstSeq: i * 10, lastSeq: i * 10 + 9 })
        );
        written.push(chunkId);
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 6; page += 1) {
        // eslint-disable-next-line no-await-in-loop
        const res = await inject(
          "GET",
          `/api/v1/agent-vault/sessions/${session.id}/activity?limit=2${cursor ? `&before=${cursor}` : ""}`
        );
        const body = JSON.parse(res.payload) as { chunks: { chunkId: string }[]; nextCursor: string | null };
        seen.push(...body.chunks.map((chunk) => chunk.chunkId));
        if (!body.nextCursor) break;
        cursor = body.nextCursor;
      }

      expect(seen.sort()).toEqual([...written].sort());
      expect(new Set(seen).size).toBe(written.length);
    });

    test("a chunk written before the destination moved is reported unreachable rather than presigned", async () => {
      await configure();
      const { session } = await seedChunks(1);

      expect((await saveConfig({ bucket: "a-different-bucket" })).statusCode).toBe(200);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      const body = JSON.parse(res.payload) as {
        configVersion: number;
        chunks: { configVersion: number; presignedGetUrl: string | null }[];
      };
      expect(body.configVersion).toBe(2);
      expect(body.chunks[0].configVersion).toBe(1);
      expect(body.chunks[0].presignedGetUrl).toBeNull();
    });

    test("turning logging off still serves what was already written", async () => {
      await configure();
      const { session } = await seedChunks(2);

      expect((await saveConfig({ enabled: false })).statusCode).toBe(200);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      const body = JSON.parse(res.payload) as { enabled: boolean; chunks: unknown[] };
      expect(body.enabled).toBe(false);
      expect(body.chunks).toHaveLength(2);
    });

    test("a session with no activity comes back empty rather than erroring", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-empty-${Date.now()}`);
      const session = await mintSession(bundle.name);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toMatchObject({ chunks: [], nextCursor: null, sessionKey: null });
    });

    test("an unknown session is a 404", async () => {
      await configure();
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${crypto.randomUUID()}/activity`);
      expect(res.statusCode).toBe(404);
    });

    test.each([
      { limit: "0", why: "below the floor" },
      { limit: "101", why: "above the ceiling" },
      { limit: "abc", why: "not a number" }
    ])("rejects a limit that is $why", async ({ limit }) => {
      await configure();
      const bundle = await createAccessBundle(`activity-limit-${Date.now()}-${limit}`);
      const session = await mintSession(bundle.name);
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity?limit=${limit}`);
      expect(res.statusCode).toBe(422);
    });
  });

  describe("the retention sweep", () => {
    const configure = async () =>
      saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });

    const retire = async (sessionId: string, daysAgo: number) =>
      testDb("agent_vault_sessions")
        .where({ id: sessionId })
        .update({ revokedAt: new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000) });

    test("deletes the objects, gives back the count and removes the rows", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-sweep-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-sweep-${Date.now()}`);
      const { uploadUrl } = await recordChunk(proxy, session.id);
      fakeActivityStorage.put(uploadUrl, Buffer.alloc(CHUNK_BYTES));
      expect(fakeActivityStorage.objectKeys(BUCKET)).toHaveLength(1);

      await retire(session.id, 31);
      await buildSweepService().sweepRetiredSessions();

      expect(fakeActivityStorage.objectKeys(BUCKET)).toEqual([]);
      expect(await testDb("agent_vault_sessions").where({ id: session.id }).first()).toBeUndefined();
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: session.id })).toHaveLength(0);
      expect(
        Number((await testDb("agent_vault_activity_configs").where({ projectId }).first()).storedRecordCount)
      ).toBe(0);
    });

    test("leaves a session that is still inside the retention window alone", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-sweep-recent-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-sweep-recent-${Date.now()}`);

      const { uploadUrl } = await recordChunk(proxy, session.id);
      fakeActivityStorage.put(uploadUrl, Buffer.alloc(CHUNK_BYTES));

      await retire(session.id, 2);
      await buildSweepService().sweepRetiredSessions();

      expect(await testDb("agent_vault_sessions").where({ id: session.id }).first()).toBeTruthy();
      expect(fakeActivityStorage.objectKeys(BUCKET)).toHaveLength(1);
    });

    /**
     * The bulk prune and the activity sweep have to agree about which sessions hold chunks. If the prune
     * ever deletes one that does, the chunk rows cascade away with it and their objectKeys go with them,
     * stranding the objects in the customer's bucket and leaving storedRecordCount permanently high.
     */
    test("a retired session holding chunks is never taken by the bulk prune", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-prune-${Date.now()}`);
      const withChunks = await mintSession(bundle.name);
      const withoutChunks = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-prune-${Date.now()}`);

      await recordChunk(proxy, withChunks.id);

      await retire(withChunks.id, 31);
      await retire(withoutChunks.id, 31);

      const pruned = await agentVaultSessionDALFactory(testDb).pruneRetiredBefore(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      );

      expect(pruned).toBeGreaterThanOrEqual(1);
      expect(await testDb("agent_vault_sessions").where({ id: withoutChunks.id }).first()).toBeUndefined();
      expect(await testDb("agent_vault_sessions").where({ id: withChunks.id }).first()).toBeTruthy();
    });

    test("a bucket that refuses the delete keeps the rows, so tomorrow's run tries again", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-sweep-fail-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-sweep-fail-${Date.now()}`);

      await recordChunk(proxy, session.id);
      await retire(session.id, 31);

      fakeActivityStorage.failsDeleteWith("AccessDenied");
      await buildSweepService().sweepRetiredSessions();

      expect(await testDb("agent_vault_sessions").where({ id: session.id }).first()).toBeTruthy();
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: session.id })).toHaveLength(1);
    });
  });
});
