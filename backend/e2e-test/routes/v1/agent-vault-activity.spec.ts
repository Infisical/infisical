import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { fakeActivityStorage } from "e2e-test/fakes/agent-vault-activity-storage";
import { createAwsAppConnection, deleteAppConnection } from "e2e-test/testUtils/secret-syncs";

import { OrgMembershipRole, ProjectMembershipRole } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import { AgentVaultActivityErrorName } from "@app/ee/services/agent-vault-activity/agent-vault-activity-constants";
import {
  encodeHistoryCursor,
  encodeTailCursor
} from "@app/ee/services/agent-vault-activity/agent-vault-activity-cursor";
import { agentVaultSessionDALFactory } from "@app/ee/services/agent-vault-session/agent-vault-session-dal";
import { initLogger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

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
  return (JSON.parse(res.payload) as { session: { id: string; token: string } }).session;
};

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

let ulidCounter = 0;
const nextChunkId = () => {
  ulidCounter += 1;
  return `01K5${ulidCounter.toString().padStart(22, "0")}`.toUpperCase();
};

const CHUNK_BYTES = 1024;
const CHUNK_SHA256 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU";

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
  ciphertextSha256: CHUNK_SHA256,
  ...overrides
});

const recordChunk = async (
  proxy: Awaited<ReturnType<typeof createProxy>>,
  sessionId: string,
  chunk: Record<string, unknown> = chunkBody()
) => {
  const res = await proxy.postChunk(sessionId, chunk);
  expect(res.statusCode, res.payload).toBe(200);
  return JSON.parse(res.payload) as { chunkId: string; uploadUrl: string; expiresInSeconds: number };
};

const BUCKET = "activity-bucket";

const SETTINGS_URL = "/api/v1/agent-vault/settings/activity-logging";

const saveConfig = async (patch: Record<string, unknown>) => inject("PATCH", SETTINGS_URL, patch);

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

  // This file sorts before agent-vault.spec.ts, which asserts the Agent Vault project bootstraps with no members.
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
    // Tests create their own proxies, and an org can hold only AGENT_VAULT_MAX_PROXIES_PER_ORG.
    await testDb("agent_vault_proxies").where({ projectId }).del();
  });

  describe("settings", () => {
    test("reads as off, with no destination, before anything is configured", async () => {
      const res = await inject("GET", SETTINGS_URL);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload) as { settings: Record<string, unknown> };
      expect(body.settings).toMatchObject({ enabled: false, bucket: null, appConnectionId: null });
      expect(body).not.toHaveProperty("usage");

      const health = await inject("GET", `${SETTINGS_URL}/health`);
      expect(health.statusCode).toBe(200);
      expect(JSON.parse(health.payload).health).toMatchObject({ isStorageFull: false });

      const probe = await inject("GET", `${SETTINGS_URL}/cors-probe`);
      expect(probe.statusCode).toBe(200);
      expect(JSON.parse(probe.payload).probe).toBeNull();
    });

    test("saving a destination validates the bucket, and the CORS probe then points at it", async () => {
      const res = await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });
      expect(res.statusCode, res.payload).toBe(200);

      const body = JSON.parse(res.payload) as { settings: Record<string, unknown> };
      expect(body.settings).toMatchObject({ enabled: true, bucket: BUCKET, region: "us-east-1", keyPrefix: "logs/" });

      const probe = await inject("GET", `${SETTINGS_URL}/cors-probe`);
      expect(probe.statusCode).toBe(200);
      const probeBody = JSON.parse(probe.payload) as { probe: { url: string; expiresInSeconds: number } | null };
      expect(probeBody.probe?.url).toContain("cors-probe");
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

    test("turning logging off is never blocked by a destination that has gone bad", async () => {
      await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1"
      });

      fakeActivityStorage.failsValidationWith("Unable to reach bucket");

      const res = await saveConfig({ enabled: false });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).settings.enabled).toBe(false);

      expect((await saveConfig({ enabled: true })).statusCode).toBe(400);
    });

    test("a connection that can't be used says why, on the page and when saving", async () => {
      expect(
        (await saveConfig({ enabled: true, appConnectionId: connectionId, bucket: BUCKET, region: "us-east-1" }))
          .statusCode
      ).toBe(200);
      fakeActivityStorage.failsBuildWith("AWS refused to assume the role");

      const health = await inject("GET", `${SETTINGS_URL}/health`);
      expect(JSON.parse(health.payload).health.connectionError).toBe("AWS refused to assume the role");

      const save = await saveConfig({ keyPrefix: "elsewhere" });
      expect(save.statusCode).toBe(400);
      expect(JSON.parse(save.payload).message).toBe("AWS refused to assume the role");
    });

    test("turning logging on without a complete destination names what is missing", async () => {
      const res = await saveConfig({ enabled: true });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("an AWS connection");
      expect(JSON.parse(res.payload).message).toContain("a bucket");
    });

    test("a connection activity logging uses cannot be deleted, and the refusal says why", async () => {
      await saveConfig({ enabled: true, appConnectionId: connectionId, bucket: BUCKET, region: "us-east-1" });

      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/app-connections/aws/${connectionId}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("Agent Vault activity logging");

      const config = await testDb("agent_vault_activity_configs").where({ projectId }).first();
      expect(config.appConnectionId).toBe(connectionId);
    });

    test("the connection can be detached only with recording off, and the destination is kept", async () => {
      await saveConfig({ enabled: true, appConnectionId: connectionId, bucket: BUCKET, region: "us-east-1" });

      const whileOn = await saveConfig({ appConnectionId: null });
      expect(whileOn.statusCode).toBe(400);
      expect(JSON.parse(whileOn.payload).message).toContain("Turn off activity logging");

      const whileOff = await saveConfig({ enabled: false, appConnectionId: null });
      expect(whileOff.statusCode).toBe(200);
      expect(JSON.parse(whileOff.payload).settings).toMatchObject({
        enabled: false,
        appConnectionId: null,
        bucket: BUCKET
      });
    });

    test("a save that puts the connection to a new use checks it again; turning recording off does not", async () => {
      await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });

      await testDb("app_connections").where({ id: connectionId }).update({ app: AppConnection.GCP });
      try {
        expect((await saveConfig({ enabled: false })).statusCode).toBe(200);
        expect((await saveConfig({ enabled: false })).statusCode).toBe(200);
        expect((await saveConfig({ enabled: true })).statusCode).toBe(400);
        expect((await saveConfig({ bucket: "a-different-bucket" })).statusCode).toBe(400);
        expect((await saveConfig({ region: "us-west-2" })).statusCode).toBe(400);
        expect((await saveConfig({ keyPrefix: "elsewhere" })).statusCode).toBe(400);
      } finally {
        await testDb("app_connections").where({ id: connectionId }).update({ app: AppConnection.AWS });
      }
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
      expect(JSON.parse(off.payload).settings).toMatchObject({ enabled: false, bucket: BUCKET, keyPrefix: "logs/" });
    });

    test("the key prefix is normalised, so two spellings of one prefix are one destination", async () => {
      const res = await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "/logs/"
      });
      expect(JSON.parse(res.payload).settings.keyPrefix).toBe("logs/");
    });

    test("a non-admin member cannot read or change the settings", async () => {
      const member = await createMemberIdentity(`activity-member-${Date.now()}`);
      try {
        expect((await member.as("GET", SETTINGS_URL)).statusCode).toBe(403);
        expect((await member.as("GET", `${SETTINGS_URL}/health`)).statusCode).toBe(403);
        expect((await member.as("PATCH", SETTINGS_URL, { enabled: false })).statusCode).toBe(403);
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

      expect(fakeActivityStorage.objectKeys(BUCKET)).toEqual([]);

      fakeActivityStorage.put(result.uploadUrl, Buffer.alloc(CHUNK_BYTES));
      expect(fakeActivityStorage.objectKeys(BUCKET)).toEqual([row.objectKey]);

      expect(() => fakeActivityStorage.put(result.uploadUrl, Buffer.alloc(CHUNK_BYTES + 1))).toThrow();
    });

    test("counts each chunk once against the org, whatever it holds", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-count-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-count-${Date.now()}`);
      await recordChunk(proxy, session.id);
      await recordChunk(proxy, session.id, chunkBody({ firstSeq: 10, lastSeq: 19 }));

      const config = await testDb("agent_vault_activity_configs").where({ projectId }).first();
      expect(Number(config.storedChunkCount)).toBe(2);
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
      expect(second.uploadUrl).not.toBe(first.uploadUrl);
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: session.id }).count()).toEqual([
        { count: "1" }
      ]);
      expect(Number((await testDb("agent_vault_activity_configs").where({ projectId }).first()).storedChunkCount)).toBe(
        1
      );
    });

    test("a re-sent chunk gets a fresh upload link that cannot replace what is already stored", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-overwrite-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-overwrite-${Date.now()}`);
      const chunk = chunkBody();

      const first = await recordChunk(proxy, session.id, chunk);
      const stored = Buffer.alloc(CHUNK_BYTES, 1);
      fakeActivityStorage.put(first.uploadUrl, stored);

      const second = await recordChunk(proxy, session.id, chunk);
      expect(() => fakeActivityStorage.put(second.uploadUrl, Buffer.alloc(CHUNK_BYTES, 2))).toThrow(/create-only/);

      const read = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      const [only] = (JSON.parse(read.payload) as { chunks: { presignedGetUrl: string }[] }).chunks;
      expect(fakeActivityStorage.get(only.presignedGetUrl)).toEqual(stored);
    });

    test("a chunk re-sent after the destination moved is uploaded to the new one and reads back", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-moved-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-moved-${Date.now()}`);
      const chunk = chunkBody();
      await recordChunk(proxy, session.id, chunk);

      const movedBucket = `${BUCKET}-moved`;
      await configure({ bucket: movedBucket, keyPrefix: "moved" });

      const resent = await recordChunk(proxy, session.id, chunk);
      const stored = Buffer.alloc(CHUNK_BYTES, 3);
      fakeActivityStorage.put(resent.uploadUrl, stored);

      const row = await testDb("agent_vault_activity_chunks").where({ sessionId: session.id }).first();
      expect(row.bucket).toBe(movedBucket);
      expect(row.objectKey).toMatch(/^moved\//);
      expect(fakeActivityStorage.objectKeys(movedBucket)).toEqual([row.objectKey]);

      const read = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      const [only] = (JSON.parse(read.payload) as { chunks: { presignedGetUrl: string | null }[] }).chunks;
      expect(fakeActivityStorage.get(only.presignedGetUrl as string)).toEqual(stored);
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
      await recordChunk(proxyTwo, sessionB.id, chunkBody({ chunkId: sharedId }));

      const claimed = await proxyTwo.postChunk(sessionA.id, chunkBody({ chunkId: sharedId }));
      expect(claimed.statusCode, claimed.payload).toBe(409);
      await recordChunk(proxyOne, sessionA.id, chunkBody({ chunkId: sharedId }));

      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: sessionA.id })).toHaveLength(2);
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: sessionB.id })).toHaveLength(1);
    });

    test("a connection that can't be used refuses the chunk as retryable and writes no row", async () => {
      await configure();
      fakeActivityStorage.failsBuildWith("AWS refused to assume the role");
      const bundle = await createAccessBundle(`activity-unusable-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-unusable-${Date.now()}`);

      const res = await proxy.postChunk(session.id, chunkBody());
      expect(res.statusCode).toBe(500);
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: session.id })).toHaveLength(0);
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

      const second = await proxy.resolve(session.token, true);
      const secondBody = JSON.parse(second.payload) as { activity: { enabled: boolean; sessionKey: string | null } };
      expect(secondBody.activity.enabled).toBe(true);
      expect(secondBody.activity.sessionKey).toBeNull();

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
      { why: "the digest is not a SHA-256", patch: { ciphertextSha256: "short" } },
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

    test("returns the newest chunks first, each with a presigned url and the key to open them, and is never cached", async () => {
      await configure();
      const { session, proxy } = await seedChunks(3);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect(res.statusCode).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store, no-cache, must-revalidate, proxy-revalidate");

      const body = JSON.parse(res.payload) as {
        activity: { enabled: boolean; sessionKey: string; projectId: string };
        chunks: {
          chunkId: string;
          proxyId: string;
          presignedGetUrl: string | null;
          recordCount: number;
          ciphertextSha256: string;
        }[];
        nextCursor: string | null;
      };

      expect(body.activity.enabled).toBe(true);
      expect(body.chunks.every((chunk) => chunk.ciphertextSha256 === CHUNK_SHA256)).toBe(true);
      expect(body.activity.projectId).toBe(projectId);
      expect(Buffer.from(body.activity.sessionKey, "base64")).toHaveLength(32);
      expect(body.chunks).toHaveLength(3);
      expect(body.chunks.every((chunk) => chunk.proxyId === proxy.id)).toBe(true);

      const ids = body.chunks.map((chunk) => chunk.chunkId);
      expect([...ids].sort().reverse()).toEqual(ids);

      body.chunks.forEach((chunk) => {
        expect(fakeActivityStorage.get(chunk.presignedGetUrl!)).toHaveLength(CHUNK_BYTES);
      });
    });

    test("a time window narrows the chunks without disturbing the cursor", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-range-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-range-${Date.now()}`);

      const hour = 60 * 60 * 1000;
      const startedAts = [new Date(Date.now() - 3 * hour), new Date(Date.now() - 2 * hour), new Date()];
      for (const startedAt of startedAts) {
        // eslint-disable-next-line no-await-in-loop
        const { uploadUrl } = await recordChunk(proxy, session.id, chunkBody({ startedAt, endedAt: startedAt }));
        fakeActivityStorage.put(uploadUrl, Buffer.alloc(CHUNK_BYTES));
      }

      const windowed = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/activity` +
          `?from=${new Date(Date.now() - 2.5 * hour).toISOString()}` +
          `&to=${new Date(Date.now() - 1.5 * hour).toISOString()}`
      );
      expect(windowed.statusCode).toBe(200);
      const body = JSON.parse(windowed.payload) as { chunks: { startedAt: string }[] };
      expect(body.chunks).toHaveLength(1);
      expect(new Date(body.chunks[0].startedAt).getTime()).toBe(startedAts[1].getTime());

      const straddling = await recordChunk(
        proxy,
        session.id,
        chunkBody({
          startedAt: new Date(Date.now() - 5 * hour),
          endedAt: new Date(Date.now() - 2 * hour)
        })
      );
      fakeActivityStorage.put(straddling.uploadUrl, Buffer.alloc(CHUNK_BYTES));

      const overlapping = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/activity` +
          `?from=${new Date(Date.now() - 2.5 * hour).toISOString()}` +
          `&to=${new Date(Date.now() - 1.5 * hour).toISOString()}`
      );
      expect((JSON.parse(overlapping.payload) as { chunks: unknown[] }).chunks).toHaveLength(2);

      const all = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect((JSON.parse(all.payload) as { chunks: unknown[] }).chunks).toHaveLength(4);
    });

    test("pages with a cursor, and the last page reports no more", async () => {
      await configure();
      const { session } = await seedChunks(5);

      const budget = 20;

      const first = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity?limit=${budget}`);
      const firstBody = JSON.parse(first.payload) as { chunks: { chunkId: string }[]; nextCursor: string | null };
      expect(firstBody.chunks).toHaveLength(2);
      expect(firstBody.nextCursor).toBe(encodeHistoryCursor(firstBody.chunks[1].chunkId));

      const second = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/activity?limit=${budget}&cursor=${firstBody.nextCursor}`
      );
      const secondBody = JSON.parse(second.payload) as { chunks: { chunkId: string }[]; nextCursor: string | null };
      expect(secondBody.chunks).toHaveLength(2);
      expect(secondBody.chunks.map((c) => c.chunkId)).not.toContain(firstBody.chunks[1].chunkId);

      const third = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/activity?limit=${budget}&cursor=${secondBody.nextCursor}`
      );
      const thirdBody = JSON.parse(third.payload) as { chunks: unknown[]; nextCursor: string | null };
      expect(thirdBody.chunks).toHaveLength(1);
      expect(thirdBody.nextCursor).toBeNull();
    });

    test("a page stops at its byte budget as well as its record budget", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-bytes-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-bytes-${Date.now()}`);

      for (let i = 0; i < 3; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await recordChunk(
          proxy,
          session.id,
          chunkBody({ firstSeq: i, lastSeq: i, recordCount: 1, ciphertextBytes: 8 * 1024 * 1024 })
        );
      }

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload) as { chunks: unknown[]; nextCursor: string | null };
      expect(body.chunks).toHaveLength(2);
      expect(body.nextCursor).not.toBeNull();
    });

    test("pages cover every chunk when seal order and record order disagree", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-order-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const slow = await createProxy(`activity-order-slow-${Date.now()}`);
      const quick = await createProxy(`activity-order-quick-${Date.now()}`);

      const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

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
          `/api/v1/agent-vault/sessions/${session.id}/activity?limit=1${cursor ? `&cursor=${cursor}` : ""}`
        );
        const body = JSON.parse(res.payload) as { chunks: { chunkId: string }[]; nextCursor: string | null };
        seen.push(...body.chunks.map((chunk) => chunk.chunkId));
        if (!body.nextCursor) break;
        cursor = body.nextCursor;
      }

      expect(seen.sort()).toEqual([...written].sort());
      expect(new Set(seen).size).toBe(written.length);
    });

    type THistoryBody = {
      chunks: { chunkId: string }[];
      nextCursor: string | null;
      liveCursor: string;
    };

    type TTailBody = {
      chunks: { chunkId: string }[];
      nextCursor: string;
      hasMore: boolean;
    };

    test("the tail returns a late chunk that a page would sort among old ones", async () => {
      await configure();
      const { session, proxy } = await seedChunks(3);

      const first = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity?limit=20`);
      const firstBody = JSON.parse(first.payload) as THistoryBody;
      expect(firstBody.chunks).toHaveLength(2);
      expect(typeof firstBody.liveCursor).toBe("string");

      const late = await recordChunk(proxy, session.id, chunkBody({ chunkId: `01K4${"0".repeat(21)}1` }));
      fakeActivityStorage.put(late.uploadUrl, Buffer.alloc(CHUNK_BYTES));

      const newest = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity?limit=20`);
      expect((JSON.parse(newest.payload) as THistoryBody).chunks.map((c) => c.chunkId)).not.toContain(late.chunkId);

      const received = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/activity/tail?cursor=${firstBody.liveCursor}`
      );
      expect(received.statusCode).toBe(200);
      const body = JSON.parse(received.payload) as TTailBody;
      const ids = body.chunks.map((c) => c.chunkId);

      expect(ids[ids.length - 1]).toBe(late.chunkId);
      expect(ids).toEqual(expect.arrayContaining(firstBody.chunks.map((c) => c.chunkId)));
      expect(typeof body.nextCursor).toBe("string");
      expect(body.hasMore).toBe(false);
    });

    test("a tail read cut short resumes after its last chunk, so a backlog is worked through", async () => {
      await configure();
      const { session } = await seedChunks(3);

      let cursor = encodeTailCursor(new Date(Date.now() - 60 * 60 * 1000));
      const seen = new Set<string>();
      let reads = 0;
      let hasMore = true;
      while (hasMore && reads < 10) {
        // eslint-disable-next-line no-await-in-loop
        const res = await inject(
          "GET",
          `/api/v1/agent-vault/sessions/${session.id}/activity/tail?limit=10&cursor=${cursor}`
        );
        const body = JSON.parse(res.payload) as TTailBody;
        body.chunks.forEach((chunk) => seen.add(chunk.chunkId));
        ({ hasMore } = body);
        cursor = body.nextCursor;
        reads += 1;
      }

      expect(hasMore).toBe(false);
      expect(seen.size).toBe(3);
      expect(reads).toBeLessThan(10);
    });

    test("the tail can start without a cursor", async () => {
      await configure();
      const { session } = await seedChunks(1);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity/tail`);
      expect(res.statusCode).toBe(200);
      expect(typeof (JSON.parse(res.payload) as TTailBody).nextCursor).toBe("string");
    });

    test.each([
      { why: "a live cursor passed to history", path: "activity", cursor: () => encodeTailCursor(new Date()) },
      {
        why: "a history cursor passed to the tail",
        path: "activity/tail",
        cursor: () => encodeHistoryCursor(nextChunkId())
      },
      { why: "a garbage cursor passed to history", path: "activity", cursor: () => "not-a-cursor" },
      { why: "a garbage cursor passed to the tail", path: "activity/tail", cursor: () => "not-a-cursor" }
    ])("rejects $why", async ({ path, cursor }) => {
      await configure();
      const { session } = await seedChunks(1);
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/${path}?cursor=${cursor()}`);
      expect(res.statusCode).toBe(422);
    });

    const readLink = async (sessionId: string) => {
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${sessionId}/activity`);
      return (JSON.parse(res.payload) as { chunks: { presignedGetUrl: string | null }[] }).chunks[0].presignedGetUrl;
    };

    test("a chunk in a bucket the project no longer uses is not presigned, and is again once the bucket is switched back", async () => {
      await configure();
      const { session } = await seedChunks(1);

      expect((await saveConfig({ bucket: "a-different-bucket" })).statusCode).toBe(200);
      expect(await readLink(session.id)).toBeNull();

      expect((await saveConfig({ bucket: BUCKET })).statusCode).toBe(200);
      expect(fakeActivityStorage.get((await readLink(session.id)) as string)).toEqual(Buffer.alloc(CHUNK_BYTES));
    });

    test("a chunk keeps its link after only the prefix changes", async () => {
      await configure();
      const { session } = await seedChunks(1);

      expect((await saveConfig({ keyPrefix: "other" })).statusCode).toBe(200);
      expect(fakeActivityStorage.get((await readLink(session.id)) as string)).toEqual(Buffer.alloc(CHUNK_BYTES));
    });

    test("a key copied from another session is refused rather than handed out", async () => {
      await configure();
      const { session } = await seedChunks(1);
      const other = await mintSession((await createAccessBundle(`activity-other-${Date.now()}`)).name);

      const { encryptedActivityKey } = await testDb("agent_vault_sessions").where({ id: other.id }).first();
      await testDb("agent_vault_sessions").where({ id: session.id }).update({ encryptedActivityKey });

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect(res.statusCode).toBe(500);
      expect(res.payload).not.toContain("sessionKey");
    });

    test("turning logging off still serves what was already written", async () => {
      await configure();
      const { session } = await seedChunks(2);

      expect((await saveConfig({ enabled: false })).statusCode).toBe(200);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      const body = JSON.parse(res.payload) as { activity: { enabled: boolean }; chunks: unknown[] };
      expect(body.activity.enabled).toBe(false);
      expect(body.chunks).toHaveLength(2);
    });

    test("without a connection, a session lists what it recorded as unreadable rather than as nothing", async () => {
      await configure();
      const { session } = await seedChunks(2);

      expect((await saveConfig({ enabled: false, appConnectionId: null })).statusCode).toBe(200);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload) as {
        activity: {
          sessionKey: string | null;
          storageUnavailable: { reason: string; message: string | null } | null;
        };
        chunks: { presignedGetUrl: string | null }[];
      };
      expect(body.activity.storageUnavailable).toEqual({ reason: "no-connection", message: null });
      expect(body.activity.sessionKey).toBeNull();
      expect(body.chunks.map((chunk) => chunk.presignedGetUrl)).toEqual([null, null]);

      const since = new Date(Date.now() - 60 * 60_000);
      const live = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/activity/tail?cursor=${encodeTailCursor(since)}`
      );
      const liveBody = JSON.parse(live.payload) as {
        activity: { storageUnavailable: { reason: string } | null };
        chunks: unknown[];
        nextCursor: string;
      };
      expect(liveBody.chunks).toEqual([]);
      expect(liveBody.nextCursor).toBe(encodeTailCursor(since));
      expect(liveBody.activity.storageUnavailable?.reason).toBe("no-connection");
    });

    test("when the connection can't be used, a session lists what it recorded and says why", async () => {
      await configure();
      const { session } = await seedChunks(1);
      // A successful save empties the storage cache the seeding filled, so the next read builds it again.
      expect((await saveConfig({ enabled: false })).statusCode).toBe(200);
      fakeActivityStorage.failsBuildWith("AWS refused to assume the role");

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload) as {
        activity: { storageUnavailable: { reason: string; message: string | null } | null };
        chunks: { presignedGetUrl: string | null }[];
      };
      expect(body.activity.storageUnavailable).toEqual({
        reason: "connection-unusable",
        message: "AWS refused to assume the role"
      });
      expect(body.chunks.map((chunk) => chunk.presignedGetUrl)).toEqual([null]);
    });

    test("a session with no activity comes back empty rather than erroring", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-empty-${Date.now()}`);
      const session = await mintSession(bundle.name);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity`);
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload)).toMatchObject({ chunks: [], nextCursor: null, activity: { sessionKey: null } });
    });

    test("an unknown session is a 404", async () => {
      await configure();
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${crypto.randomUUID()}/activity`);
      expect(res.statusCode).toBe(404);
    });

    test.each([
      { limit: "0", why: "below the floor" },
      { limit: "5001", why: "above the ceiling" },
      { limit: "abc", why: "not a number" }
    ])("rejects a limit that is $why", async ({ limit }) => {
      await configure();
      const bundle = await createAccessBundle(`activity-limit-${Date.now()}-${limit}`);
      const session = await mintSession(bundle.name);
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/activity?limit=${limit}`);
      expect(res.statusCode).toBe(422);
    });
  });

  describe("retention", () => {
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

    test("the daily prune keeps a retired session that recorded activity, and removes one that did not", async () => {
      await configure();
      const bundle = await createAccessBundle(`activity-prune-${Date.now()}`);
      const withChunks = await mintSession(bundle.name);
      const withoutChunks = await mintSession(bundle.name);
      const proxy = await createProxy(`activity-prune-${Date.now()}`);

      const { uploadUrl } = await recordChunk(proxy, withChunks.id);
      fakeActivityStorage.put(uploadUrl, Buffer.alloc(CHUNK_BYTES));

      await retire(withChunks.id, 31);
      await retire(withoutChunks.id, 31);

      const pruned = await agentVaultSessionDALFactory(testDb).pruneRetiredBefore(
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      );

      expect(pruned).toBeGreaterThanOrEqual(1);
      expect(await testDb("agent_vault_sessions").where({ id: withoutChunks.id }).first()).toBeUndefined();
      expect(await testDb("agent_vault_sessions").where({ id: withChunks.id }).first()).toBeTruthy();
      expect(await testDb("agent_vault_activity_chunks").where({ sessionId: withChunks.id })).toHaveLength(1);
      expect(fakeActivityStorage.objectKeys(BUCKET)).toHaveLength(1);
    });
  });
});
