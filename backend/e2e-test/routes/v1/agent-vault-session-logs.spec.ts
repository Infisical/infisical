import crypto from "node:crypto";

import * as x509 from "@peculiar/x509";
import { fakeAwsConnection } from "e2e-test/fakes/aws-connection-fns";
import { fakeS3Bucket } from "e2e-test/fakes/s3";
import { createAwsAppConnection, deleteAwsAppConnection } from "e2e-test/testUtils/app-connections";
import { v7 as uuidv7 } from "uuid";

import { OrgMembershipRole, ProjectMembershipRole, ProjectType } from "@app/db/schemas";
import { seedData1 } from "@app/db/seed-data";
import {
  AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES,
  AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES
} from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-constants";
import { AgentVaultSessionLogErrorName } from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-enums";
import {
  chunkIdTimeMs,
  encodeHistoryCursor,
  encodeTailCursor,
  toRev
} from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-fns";
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
        url: `/api/v1/agent-vault/proxy/sessions/${sessionId}/logs/chunks`,
        headers: { authorization: `Bearer ${accessToken}` },
        body: chunk
      }),
    resolve: (sessionToken: string, hasSessionLogKey?: boolean) =>
      testServer.inject({
        method: "POST",
        url: "/api/v1/agent-vault/proxy/resolve",
        headers: { authorization: `Bearer ${accessToken}`, "x-infisical-agent-session": sessionToken },
        ...(hasSessionLogKey === undefined ? {} : { body: { hasSessionLogKey } })
      })
  };
};

const nextChunkId = () => uuidv7();

const CHUNK_BYTES = 1024;
const CHUNK_SHA256 = "47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU";

const chunkBody = (overrides: Record<string, unknown> = {}) => ({
  chunkId: nextChunkId(),
  endedAt: new Date(Date.now() - 1_000),
  ciphertextBytes: CHUNK_BYTES,
  ciphertextSha256: CHUNK_SHA256,
  ...overrides
});

const requestUploadUrl = async (
  proxy: Awaited<ReturnType<typeof createProxy>>,
  sessionId: string,
  chunk: Record<string, unknown> = chunkBody()
) => {
  const res = await proxy.postChunk(sessionId, chunk);
  expect(res.statusCode, res.payload).toBe(200);
  return JSON.parse(res.payload) as { chunkId: string; uploadUrl: string; expiresInSeconds: number };
};

const BUCKET = "session-logs-bucket";

const SETTINGS_URL = "/api/v1/agent-vault/settings/session-logs";

const saveConfig = async (patch: Record<string, unknown>) => inject("PATCH", SETTINGS_URL, patch);

describe("Agent Vault session logs", async () => {
  let connectionId: string;
  let connectionName: string;
  let projectId: string;

  beforeAll(async () => {
    projectId = await getProjectId();
    expect(
      (await inject("POST", `/api/v1/organization-admin/projects/${projectId}/grant-admin-access`)).statusCode
    ).toBe(200);
    connectionName = `session-logs-aws-${Date.now()}`;
    connectionId = await createAwsAppConnection({ name: connectionName, authToken: jwtAuthToken });
  });

  // This file sorts before agent-vault.spec.ts, which asserts the Agent Vault project bootstraps with no members.
  afterAll(async () => {
    await testDb("agent_vault_session_log_configs").where({ projectId }).del();
    await testDb("agent_vault_sessions").where({ projectId }).del();
    await testDb("agent_vault_proxies").where({ projectId }).del();
    await testDb("agent_vault_access_bundles").where({ projectId }).del();
    await testDb("memberships").where({ scopeProjectId: projectId }).del();
    await deleteAwsAppConnection({ connectionId, authToken: jwtAuthToken });
  });

  beforeEach(async () => {
    fakeS3Bucket.reset();
    fakeAwsConnection.reset();
    await testDb("agent_vault_session_log_configs").where({ projectId }).del();
    // Tests create their own proxies, and an org can hold only AGENT_VAULT_MAX_PROXIES_PER_ORG.
    await testDb("agent_vault_proxies").where({ projectId }).del();
  });

  describe("settings", () => {
    test("reads as off, with no destination, before anything is configured", async () => {
      const res = await inject("GET", SETTINGS_URL);
      expect(res.statusCode).toBe(200);

      const body = JSON.parse(res.payload) as { settings: Record<string, unknown> };
      expect(body.settings).toMatchObject({ enabled: false, bucket: null, appConnectionId: null });

      const health = await inject("GET", `${SETTINGS_URL}/health`);
      expect(health.statusCode).toBe(200);
      expect(JSON.parse(health.payload).health).toMatchObject({ connectionError: null });

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
      expect(body.settings).toMatchObject({ enabled: true, bucket: BUCKET, region: "us-east-1", keyPrefix: "logs" });

      const probe = await inject("GET", `${SETTINGS_URL}/cors-probe`);
      expect(probe.statusCode).toBe(200);
      const probeBody = JSON.parse(probe.payload) as { probe: { url: string; expiresInSeconds: number } | null };
      expect(new URL(probeBody.probe?.url as string).pathname).toBe("/logs/.cors-probe");
    });

    test("a bucket it cannot write to is refused with the actionable message, and nothing is saved", async () => {
      fakeS3Bucket.failsAccessCheckWith("unwritable");

      const res = await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: "nope",
        region: "us-east-1"
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toBe(
        "Bucket 'nope' is reachable but writing to it failed. Grant s3:PutObject on the configured key prefix"
      );

      expect(await testDb("agent_vault_session_log_configs").where({ projectId }).first()).toBeUndefined();
    });

    test("turning session logs off is never blocked by a destination that has gone bad", async () => {
      await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1"
      });

      fakeS3Bucket.failsAccessCheckWith("unreachable");

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
      fakeAwsConnection.failsConfigWith("AWS refused to assume the role");

      const health = await inject("GET", `${SETTINGS_URL}/health`);
      const refused = `Couldn't use the AWS connection '${connectionName}' for session logs: AWS refused to assume the role`;
      expect(JSON.parse(health.payload).health.connectionError).toBe(refused);

      const save = await saveConfig({ keyPrefix: "elsewhere" });
      expect(save.statusCode).toBe(400);
      expect(JSON.parse(save.payload).message).toBe(refused);
    });

    test("a bucket the connection can't reach shows as a connection error", async () => {
      expect(
        (await saveConfig({ enabled: true, appConnectionId: connectionId, bucket: BUCKET, region: "us-east-1" }))
          .statusCode
      ).toBe(200);
      fakeS3Bucket.failsAccessCheckWith("unreachable");

      const health = await inject("GET", `${SETTINGS_URL}/health`);
      expect(JSON.parse(health.payload).health.connectionError).toBe(
        `Unable to reach bucket '${BUCKET}'. Check the bucket name, the region, and that the connection's credentials allow s3:ListBucket on it`
      );
    });

    test("turning session logs on without a complete destination names what is missing", async () => {
      const res = await saveConfig({ enabled: true });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("an AWS connection");
      expect(JSON.parse(res.payload).message).toContain("a bucket");
    });

    test("a connection session logs use cannot be deleted", async () => {
      await saveConfig({ enabled: true, appConnectionId: connectionId, bucket: BUCKET, region: "us-east-1" });

      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/app-connections/aws/${connectionId}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain("Cannot delete App Connection with existing connections");

      const config = await testDb("agent_vault_session_log_configs").where({ projectId }).first();
      expect(config.appConnectionId).toBe(connectionId);
    });

    test("the connection can be detached only with recording off, and the destination is kept", async () => {
      await saveConfig({ enabled: true, appConnectionId: connectionId, bucket: BUCKET, region: "us-east-1" });

      const whileOn = await saveConfig({ appConnectionId: null });
      expect(whileOn.statusCode).toBe(400);
      expect(JSON.parse(whileOn.payload).message).toContain("Turn off session logs");

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
      expect(JSON.parse(off.payload).settings).toMatchObject({ enabled: false, bucket: BUCKET, keyPrefix: "logs" });
    });

    test("the key prefix is saved as typed, and one with a slash at either end is refused", async () => {
      const saved = await saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs/agent-vault"
      });
      expect(JSON.parse(saved.payload).settings.keyPrefix).toBe("logs/agent-vault");

      const refused = await Promise.all(
        ["/logs", "logs/", "logs//agent-vault"].map((keyPrefix) => saveConfig({ keyPrefix }))
      );
      expect(refused.map((res) => res.statusCode)).toEqual([422, 422, 422]);
    });

    test("a non-admin member cannot read or change the settings", async () => {
      const member = await createMemberIdentity(`session-logs-member-${Date.now()}`);
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

    const tailedChunks = async (sessionId: string) =>
      (await inject("GET", `/api/v1/agent-vault/sessions/${sessionId}/logs/tail`)).json().chunks as unknown[];

    test("presigns an upload for exactly that many bytes, named under the session's folder", async () => {
      await configure();
      const bundle = await createAccessBundle(`session-logs-write-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-write-${Date.now()}`);

      const chunk = chunkBody();
      const result = await requestUploadUrl(proxy, session.id, chunk);

      expect(fakeS3Bucket.objectKeys(BUCKET)).toEqual([]);

      fakeS3Bucket.put(result.uploadUrl, Buffer.alloc(CHUNK_BYTES));
      expect(fakeS3Bucket.objectKeys(BUCKET)).toEqual([
        `logs/${projectId}/${session.id}/${toRev(chunkIdTimeMs(chunk.chunkId))}_${chunk.chunkId}.${proxy.id}.json.enc`
      ]);
    });

    test("a re-sent chunk is signed for the same name, which cannot replace what is already stored", async () => {
      await configure();
      const bundle = await createAccessBundle(`session-logs-overwrite-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-overwrite-${Date.now()}`);
      const chunk = chunkBody();

      const first = await requestUploadUrl(proxy, session.id, chunk);
      const stored = Buffer.alloc(CHUNK_BYTES, 1);
      fakeS3Bucket.put(first.uploadUrl, stored);

      const second = await requestUploadUrl(proxy, session.id, chunk);
      expect(() => fakeS3Bucket.put(second.uploadUrl, Buffer.alloc(CHUNK_BYTES, 2))).toThrow(/create-only/);

      const read = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/logs`);
      const [only] = (JSON.parse(read.payload) as { chunks: { presignedGetUrl: string }[] }).chunks;
      expect(fakeS3Bucket.get(only.presignedGetUrl)).toEqual(stored);
    });

    test("with no key prefix, a chunk lands at the bucket root and reads back", async () => {
      await configure({ keyPrefix: "" });
      const bundle = await createAccessBundle(`session-logs-root-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-root-${Date.now()}`);

      const { uploadUrl } = await requestUploadUrl(proxy, session.id, chunkBody());
      const stored = Buffer.alloc(CHUNK_BYTES, 3);
      fakeS3Bucket.put(uploadUrl, stored);

      const [key] = fakeS3Bucket.objectKeys(BUCKET);
      expect(key.startsWith(`${projectId}/${session.id}/`)).toBe(true);

      const read = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/logs`);
      const [only] = (JSON.parse(read.payload) as { chunks: { presignedGetUrl: string }[] }).chunks;
      expect(fakeS3Bucket.get(only.presignedGetUrl)).toEqual(stored);
    });

    test("two proxies can send the same chunk id to one session, and each lands under its own name", async () => {
      await configure();
      const bundle = await createAccessBundle(`session-logs-two-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxyOne = await createProxy(`session-logs-two-a-${Date.now()}`);
      const proxyTwo = await createProxy(`session-logs-two-b-${Date.now()}`);
      const sharedId = nextChunkId();

      const one = await requestUploadUrl(proxyOne, session.id, chunkBody({ chunkId: sharedId }));
      const two = await requestUploadUrl(proxyTwo, session.id, chunkBody({ chunkId: sharedId }));
      fakeS3Bucket.put(one.uploadUrl, Buffer.alloc(CHUNK_BYTES));
      fakeS3Bucket.put(two.uploadUrl, Buffer.alloc(CHUNK_BYTES));

      const read = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/logs`);
      const { chunks } = JSON.parse(read.payload) as { chunks: { chunkId: string; proxyId: string }[] };
      expect(chunks.map((chunk) => chunk.proxyId).sort()).toEqual([proxyOne.id, proxyTwo.id].sort());
      expect(chunks.every((chunk) => chunk.chunkId === sharedId)).toBe(true);
    });

    test("a connection that can't be used refuses the chunk as retryable and records nothing", async () => {
      await configure();
      fakeAwsConnection.failsConfigWith("AWS refused to assume the role");
      const bundle = await createAccessBundle(`session-logs-unusable-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-unusable-${Date.now()}`);

      const res = await proxy.postChunk(session.id, chunkBody());
      expect(res.statusCode).toBe(500);
      fakeAwsConnection.reset();
      expect(await tailedChunks(session.id)).toEqual([]);
    });

    test("is refused with the named error while session logs are off", async () => {
      await configure({ enabled: false });
      const bundle = await createAccessBundle(`session-logs-off-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-off-${Date.now()}`);

      const res = await proxy.postChunk(session.id, chunkBody());
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).error).toBe(AgentVaultSessionLogErrorName.Disabled);
    });

    test("a session in another organization is a 404 that reads like a missing one", async () => {
      await configure();
      const proxy = await createProxy(`session-logs-foreign-${Date.now()}`);

      const [foreignOrg] = (await testDb("organizations")
        .insert({ name: "foreign org", slug: `foreign-org-${Date.now()}`, customerId: null })
        .returning("*")) as { id: string }[];
      try {
        const [foreignProject] = (await testDb("projects")
          .insert({
            name: "foreign agent vault",
            slug: `foreign-agent-vault-${Date.now()}`,
            type: ProjectType.AgentVault,
            orgId: foreignOrg.id,
            version: 3
          })
          .returning("*")) as { id: string }[];
        const [foreignSession] = (await testDb("agent_vault_sessions")
          .insert({
            projectId: foreignProject.id,
            actorType: "user",
            actorName: "foreign actor",
            tokenHash: `foreign-${Date.now()}`
          })
          .returning("*")) as { id: string }[];

        const foreign = await proxy.postChunk(foreignSession.id, chunkBody());
        const missing = await proxy.postChunk(crypto.randomUUID(), chunkBody());

        expect([foreign.statusCode, missing.statusCode]).toEqual([404, 404]);
        expect(JSON.parse(foreign.payload).message).toBe(JSON.parse(missing.payload).message);
      } finally {
        await testDb("organizations").where({ id: foreignOrg.id }).delete();
      }
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
      const bundle = await createAccessBundle(`session-logs-resolve-${label}-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-resolve-${label}-${Date.now()}`);
      return { session, proxy };
    };

    test("hands the key over once, then trusts the proxy's cached copy", async () => {
      await configure();
      const { session, proxy } = await setup("key");

      const first = await proxy.resolve(session.token, false);
      expect(first.statusCode, first.payload).toBe(200);
      const firstBody = JSON.parse(first.payload) as {
        sessionLogs: { enabled: boolean; sessionKey: string | null };
      };
      expect(firstBody.sessionLogs.enabled).toBe(true);
      expect(Buffer.from(firstBody.sessionLogs.sessionKey!, "base64")).toHaveLength(32);

      const second = await proxy.resolve(session.token, true);
      const secondBody = JSON.parse(second.payload) as { sessionLogs: { enabled: boolean; sessionKey: string | null } };
      expect(secondBody.sessionLogs.enabled).toBe(true);
      expect(secondBody.sessionLogs.sessionKey).toBeNull();

      const third = await proxy.resolve(session.token, false);
      expect(JSON.parse(third.payload).sessionLogs.sessionKey).toBe(firstBody.sessionLogs.sessionKey);
    });

    test("reports session logs as off, with no key, when the project has no destination", async () => {
      const { session, proxy } = await setup("off");

      const res = await proxy.resolve(session.token, false);
      expect(res.statusCode, res.payload).toBe(200);
      expect(JSON.parse(res.payload).sessionLogs).toMatchObject({ enabled: false, sessionKey: null });
    });

    test("turning session logs off reaches a running proxy on its next poll", async () => {
      await configure();
      const { session, proxy } = await setup("flip");
      expect(JSON.parse((await proxy.resolve(session.token, false)).payload).sessionLogs.enabled).toBe(true);

      expect((await saveConfig({ enabled: false })).statusCode).toBe(200);

      expect(JSON.parse((await proxy.resolve(session.token, true)).payload).sessionLogs.enabled).toBe(false);
    });

    test("a proxy that predates session logs sends no body, still resolves, and isn't sent a key it can't use", async () => {
      await configure();
      const { session, proxy } = await setup("legacy");

      const res = await proxy.resolve(session.token);
      expect(res.statusCode, res.payload).toBe(200);
      expect(JSON.parse(res.payload).sessionLogs).toEqual({ enabled: true, sessionKey: null });
    });

    test("a session log key that can't be opened turns logs off for the session, and its services still resolve", async () => {
      await configure();
      const bundle = await createAccessBundle(`session-logs-resolve-badkey-${Date.now()}`);
      const created = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/services`, {
        name: "datadog",
        hostPattern: "api.datadoghq.com",
        credential: { type: "bearer", headerName: "DD-API-KEY", headerPrefix: "", value: "abc123" }
      });
      expect(created.statusCode, created.payload).toBe(200);
      const session = await mintSession(bundle.name);
      const other = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-resolve-badkey-${Date.now()}`);

      const { encryptedSessionLogKey } = await testDb("agent_vault_sessions").where({ id: other.id }).first();
      await testDb("agent_vault_sessions").where({ id: session.id }).update({ encryptedSessionLogKey });

      const res = await proxy.resolve(session.token, false);
      expect(res.statusCode, res.payload).toBe(200);
      const body = JSON.parse(res.payload) as {
        services: { name: string }[];
        sessionLogs: { enabled: boolean; sessionKey: string | null };
      };
      expect(body.services.map((service) => service.name)).toEqual(["datadog"]);
      expect(body.sessionLogs).toEqual({ enabled: false, sessionKey: null });
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
      const bundle = await createAccessBundle(`session-logs-refuse-${label}-${Date.now()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-refuse-${label}-${Date.now()}`);
      return { session, proxy };
    };

    test.each([
      { why: "the chunk id is not a UUID", patch: { chunkId: "nope" } },
      { why: "the chunk id is a v4 UUID", patch: { chunkId: crypto.randomUUID() } },
      { why: "the digest is not a SHA-256", patch: { ciphertextSha256: "short" } },
      { why: "the ciphertext is smaller than an empty sealed array", patch: { ciphertextBytes: 4 } }
    ])("rejects a malformed chunk when $why", async ({ patch }) => {
      await configure();
      const { session, proxy } = await setup("schema");

      const res = await proxy.postChunk(session.id, chunkBody(patch));
      expect(res.statusCode).toBe(422);
    });

    test.each([
      { why: "endedAt is far in the future", patch: { endedAt: new Date(Date.now() + 10 * 60_000) } },
      { why: "endedAt is more than 30 days ago", patch: { endedAt: new Date(Date.now() - 31 * 24 * 60 * 60_000) } }
    ])("rejects a chunk that cannot be true when $why", async ({ patch }) => {
      await configure();
      const { session, proxy } = await setup("semantic");

      const res = await proxy.postChunk(session.id, chunkBody(patch));
      expect(res.statusCode).toBe(400);
      const tailed = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/logs/tail`);
      expect(tailed.json().chunks).toEqual([]);
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
        url: `/api/v1/agent-vault/proxy/sessions/${session.id}/logs/chunks`,
        body: chunkBody()
      });
      expect(res.statusCode).toBe(401);
    });

    test("refuses a user token: this endpoint is for proxies only", async () => {
      await configure();
      const { session } = await setup("user");

      const res = await inject("POST", `/api/v1/agent-vault/proxy/sessions/${session.id}/logs/chunks`, chunkBody());
      expect(res.statusCode).toBe(403);
    });
  });

  describe("reading a session's logs", () => {
    const configure = async () =>
      saveConfig({
        enabled: true,
        appConnectionId: connectionId,
        bucket: BUCKET,
        region: "us-east-1",
        keyPrefix: "logs"
      });

    const uniqueLabel = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const seedSession = async () => {
      const bundle = await createAccessBundle(`session-logs-read-${uniqueLabel()}`);
      const session = await mintSession(bundle.name);
      const proxy = await createProxy(`session-logs-read-${uniqueLabel()}`);
      return { session, proxy };
    };

    // A millisecond apart, oldest first, so the order they list in is fixed.
    const upload = async (
      proxy: Awaited<ReturnType<typeof createProxy>>,
      sessionId: string,
      count: number,
      { sealedFrom = Date.now() - count, bytes = CHUNK_BYTES }: { sealedFrom?: number; bytes?: number } = {}
    ) => {
      const chunkIds: string[] = [];
      for (let i = 0; i < count; i += 1) {
        const chunkId = uuidv7({ msecs: sealedFrom + i });
        // eslint-disable-next-line no-await-in-loop
        const { uploadUrl } = await requestUploadUrl(proxy, sessionId, chunkBody({ chunkId, ciphertextBytes: bytes }));
        fakeS3Bucket.put(uploadUrl, Buffer.alloc(bytes));
        chunkIds.push(chunkId);
      }
      return chunkIds;
    };

    const seedChunks = async (count: number) => {
      const { session, proxy } = await seedSession();
      const chunkIds = await upload(proxy, session.id, count);
      return { session, proxy, chunkIds };
    };

    type TPage = {
      sessionLogs: {
        enabled: boolean;
        isRecordable: boolean;
        sessionKey: string | null;
      };
      chunks: {
        chunkId: string;
        proxyId: string;
        ciphertextBytes: number;
        presignedGetUrl: string;
      }[];
      nextCursor: string | null;
    };

    const read = async (sessionId: string, query = "") => {
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${sessionId}/logs${query}`);
      expect(res.statusCode, res.payload).toBe(200);
      return JSON.parse(res.payload) as TPage;
    };

    const tail = async (sessionId: string, cursor?: string) => {
      const res = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${sessionId}/logs/tail${cursor ? `?cursor=${cursor}` : ""}`
      );
      expect(res.statusCode, res.payload).toBe(200);
      return JSON.parse(res.payload) as Omit<TPage, "nextCursor"> & { nextCursor: string };
    };

    test("returns the newest chunks first, each with a presigned url and the key to open them, and is never cached", async () => {
      await configure();
      const { session, proxy, chunkIds } = await seedChunks(3);

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/logs`);
      expect(res.statusCode).toBe(200);
      expect(res.headers["cache-control"]).toBe("no-store, no-cache, must-revalidate, proxy-revalidate");

      const body = JSON.parse(res.payload) as TPage;
      expect(body.sessionLogs.enabled).toBe(true);
      expect(body.sessionLogs.isRecordable).toBe(true);
      expect(Buffer.from(body.sessionLogs.sessionKey as string, "base64")).toHaveLength(32);
      expect(body.chunks.map((chunk) => chunk.chunkId)).toEqual([...chunkIds].reverse());
      expect(body.chunks.every((chunk) => chunk.proxyId === proxy.id)).toBe(true);
      expect(body.chunks.every((chunk) => chunk.ciphertextBytes === CHUNK_BYTES)).toBe(true);
      expect(body.nextCursor).toBeNull();

      body.chunks.forEach((chunk) => {
        expect(fakeS3Bucket.get(chunk.presignedGetUrl)).toHaveLength(CHUNK_BYTES);
      });
    });

    test("a chunk that was registered but never uploaded is not listed", async () => {
      await configure();
      const { session, proxy } = await seedSession();
      await requestUploadUrl(proxy, session.id);

      expect((await read(session.id)).chunks).toEqual([]);
    });

    test("a session created before session logs reads as not recordable, on the list and the tail", async () => {
      await configure();
      const bundle = await createAccessBundle(`session-logs-keyless-${Date.now()}`);
      const session = await mintSession(bundle.name);
      await testDb("agent_vault_sessions").where({ id: session.id }).update({ encryptedSessionLogKey: null });

      expect((await read(session.id)).sessionLogs).toMatchObject({ enabled: true, isRecordable: false });
      expect((await tail(session.id)).sessionLogs).toMatchObject({ enabled: true, isRecordable: false });
    });

    test("a time window lists the chunks sealed in it, and those sealed shortly after its end", async () => {
      await configure();
      const { session, proxy } = await seedSession();

      const hour = 60 * 60 * 1000;
      const [threeHoursAgo] = await upload(proxy, session.id, 1, { sealedFrom: Date.now() - 3 * hour });
      const [twoHoursAgo] = await upload(proxy, session.id, 1, { sealedFrom: Date.now() - 2 * hour });
      const [justAfter] = await upload(proxy, session.id, 1, { sealedFrom: Date.now() - 1.5 * hour + 60_000 });
      await upload(proxy, session.id, 1, { sealedFrom: Date.now() });

      const windowed = await read(
        session.id,
        `?from=${new Date(Date.now() - 2.5 * hour).toISOString()}&to=${new Date(Date.now() - 1.5 * hour).toISOString()}`
      );
      expect(windowed.chunks.map((chunk) => chunk.chunkId)).toEqual([justAfter, twoHoursAgo]);
      expect(windowed.chunks.map((chunk) => chunk.chunkId)).not.toContain(threeHoursAgo);
      expect(windowed.nextCursor).toBeNull();

      expect((await read(session.id)).chunks).toHaveLength(4);
    });

    test("refuses a time window that ends before it starts", async () => {
      await configure();
      const { session } = await seedSession();
      const res = await inject(
        "GET",
        `/api/v1/agent-vault/sessions/${session.id}/logs?from=${new Date().toISOString()}&to=${new Date(Date.now() - 60_000).toISOString()}`
      );
      expect(res.statusCode).toBe(400);
    });

    test("pages by size with a cursor, newest first, and the last page reports no more", async () => {
      await configure();
      const { session, proxy } = await seedSession();
      const bytes = Math.floor(AGENT_VAULT_SESSION_LOG_MAX_PAGE_BYTES * 0.6);
      const chunkIds = await upload(proxy, session.id, 3, { bytes });

      const seen: string[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        // eslint-disable-next-line no-await-in-loop
        const page: TPage = await read(session.id, cursor ? `?cursor=${cursor}` : "");
        expect(page.chunks).toHaveLength(1);
        seen.push(...page.chunks.map((chunk) => chunk.chunkId));
        cursor = page.nextCursor;
        pages += 1;
      } while (cursor && pages < 5);

      expect(pages).toBe(3);
      expect(seen).toEqual([...chunkIds].reverse());
    });

    test("files someone else put in the session's folder are skipped", async () => {
      await configure();
      const { session, chunkIds } = await seedChunks(1);
      fakeS3Bucket.putDirect(BUCKET, `logs/${projectId}/${session.id}/0000000000000_notes.txt`, Buffer.from("hi"));

      expect((await read(session.id)).chunks.map((chunk) => chunk.chunkId)).toEqual(chunkIds);
    });

    test("the tail starts from the recent feed, so a chunk registered before the page opened still arrives", async () => {
      await configure();
      const { session, proxy } = await seedSession();
      const registered = await requestUploadUrl(proxy, session.id);

      expect((await read(session.id)).chunks).toEqual([]);

      fakeS3Bucket.put(registered.uploadUrl, Buffer.alloc(CHUNK_BYTES));
      const first = await tail(session.id);
      expect(first.chunks.map((chunk) => chunk.chunkId)).toEqual([registered.chunkId]);
      expect(fakeS3Bucket.get(first.chunks[0].presignedGetUrl)).toHaveLength(CHUNK_BYTES);
      expect(Buffer.from(first.sessionLogs.sessionKey as string, "base64")).toHaveLength(32);
    });

    test("each tail continues after the last entry it returned", async () => {
      await configure();
      const { session, proxy } = await seedSession();
      await requestUploadUrl(proxy, session.id);

      const first = await tail(session.id);
      expect(first.chunks).toHaveLength(1);

      const quiet = await tail(session.id, first.nextCursor);
      expect(quiet.chunks).toEqual([]);
      expect(quiet.nextCursor).toBe(first.nextCursor);

      const next = await requestUploadUrl(proxy, session.id);
      const later = await tail(session.id, quiet.nextCursor);
      expect(later.chunks.map((chunk) => chunk.chunkId)).toEqual([next.chunkId]);
    });

    test("the tail returns a chunk sealed long ago but registered now", async () => {
      await configure();
      const { session, proxy } = await seedSession();
      const late = await requestUploadUrl(
        proxy,
        session.id,
        chunkBody({ chunkId: uuidv7({ msecs: Date.now() - 60 * 60_000 }) })
      );

      expect((await tail(session.id)).chunks.map((chunk) => chunk.chunkId)).toEqual([late.chunkId]);
    });

    test("the feed keeps only the most recent chunks", async () => {
      await configure();
      const { session, proxy } = await seedSession();
      for (let i = 0; i < AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES + 2; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await requestUploadUrl(proxy, session.id);
      }

      expect((await tail(session.id)).chunks).toHaveLength(AGENT_VAULT_SESSION_LOG_FEED_MAX_ENTRIES);
    });

    test.each([
      { why: "a live cursor passed to history", path: "logs", cursor: () => encodeTailCursor("1791278402731-0") },
      {
        why: "a history cursor passed to the tail",
        path: "logs/tail",
        cursor: () => encodeHistoryCursor("8208694117999_x")
      },
      { why: "a garbage cursor passed to history", path: "logs", cursor: () => "not-a-cursor" },
      { why: "a garbage cursor passed to the tail", path: "logs/tail", cursor: () => "not-a-cursor" }
    ])("rejects $why", async ({ path, cursor }) => {
      await configure();
      const { session } = await seedSession();
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/${path}?cursor=${cursor()}`);
      expect(res.statusCode).toBe(422);
    });

    test("after a bucket change, older logs don't show until the bucket is switched back", async () => {
      await configure();
      const { session, chunkIds } = await seedChunks(1);

      expect((await saveConfig({ bucket: "a-different-bucket" })).statusCode).toBe(200);
      expect((await read(session.id)).chunks).toEqual([]);

      expect((await saveConfig({ bucket: BUCKET })).statusCode).toBe(200);
      const page = await read(session.id);
      expect(page.chunks.map((chunk) => chunk.chunkId)).toEqual(chunkIds);
      expect(fakeS3Bucket.get(page.chunks[0].presignedGetUrl)).toEqual(Buffer.alloc(CHUNK_BYTES));
    });

    test("after a prefix change, older logs don't show until the prefix is switched back", async () => {
      await configure();
      const { session, chunkIds } = await seedChunks(1);

      expect((await saveConfig({ keyPrefix: "other" })).statusCode).toBe(200);
      expect((await read(session.id)).chunks).toEqual([]);

      expect((await saveConfig({ keyPrefix: "logs" })).statusCode).toBe(200);
      expect((await read(session.id)).chunks.map((chunk) => chunk.chunkId)).toEqual(chunkIds);
    });

    test("the tail skips chunks registered before a bucket change, and still moves past them", async () => {
      await configure();
      const { session, proxy } = await seedSession();
      await requestUploadUrl(proxy, session.id);

      expect((await saveConfig({ bucket: "a-different-bucket" })).statusCode).toBe(200);
      const body = await tail(session.id);
      expect(body.chunks).toEqual([]);
      expect(body.nextCursor).not.toBe(encodeTailCursor("0-0"));
    });

    test("a key copied from another session is refused rather than handed out", async () => {
      await configure();
      const { session } = await seedChunks(1);
      const other = await mintSession((await createAccessBundle(`session-logs-other-${Date.now()}`)).name);

      const { encryptedSessionLogKey } = await testDb("agent_vault_sessions").where({ id: other.id }).first();
      await testDb("agent_vault_sessions").where({ id: session.id }).update({ encryptedSessionLogKey });

      const res = await inject("GET", `/api/v1/agent-vault/sessions/${session.id}/logs`);
      expect(res.statusCode).toBe(500);
      expect(res.payload).not.toContain("sessionKey");
    });

    test("turning session logs off still serves what was already written", async () => {
      await configure();
      const { session } = await seedChunks(2);

      expect((await saveConfig({ enabled: false })).statusCode).toBe(200);

      const body = await read(session.id);
      expect(body.sessionLogs.enabled).toBe(false);
      expect(body.chunks).toHaveLength(2);
    });

    const readFails = async (sessionId: string, path = "logs") => {
      const res = await inject("GET", `/api/v1/agent-vault/sessions/${sessionId}/${path}`);
      return { statusCode: res.statusCode, body: JSON.parse(res.payload) as { error: string; message: string } };
    };

    test("without a connection, a read and the tail fail with the named error and say why", async () => {
      await configure();
      const { session } = await seedChunks(2);

      expect((await saveConfig({ enabled: false, appConnectionId: null })).statusCode).toBe(200);

      for (const path of ["logs", "logs/tail"]) {
        // eslint-disable-next-line no-await-in-loop
        const { statusCode, body } = await readFails(session.id, path);
        expect(statusCode).toBe(400);
        expect(body).toMatchObject({
          error: "AgentVaultSessionLogStorageUnavailable",
          message: "No AWS connection is set for session logs. Choose one in Settings."
        });
      }
    });

    test("when the connection can't be used, a read fails with the named error and says why", async () => {
      await configure();
      const { session } = await seedChunks(1);
      fakeAwsConnection.failsConfigWith("AWS refused to assume the role");

      const { statusCode, body } = await readFails(session.id);
      expect(statusCode).toBe(400);
      expect(body).toMatchObject({
        error: "AgentVaultSessionLogStorageUnavailable",
        message: `Couldn't use the AWS connection '${connectionName}' for session logs: AWS refused to assume the role`
      });
    });

    test("when the bucket refuses to list, a read fails with the named error instead of looking empty", async () => {
      await configure();
      const { session } = await seedChunks(1);
      fakeS3Bucket.failsListWith(true);

      const { statusCode, body } = await readFails(session.id);
      expect(statusCode).toBe(400);
      expect(body.error).toBe("AgentVaultSessionLogStorageUnavailable");
      expect(body.message).toContain("s3:ListBucket");
    });

    test("a session with no logs comes back empty rather than erroring", async () => {
      await configure();
      const bundle = await createAccessBundle(`session-logs-empty-${Date.now()}`);
      const session = await mintSession(bundle.name);

      expect(await read(session.id)).toMatchObject({
        chunks: [],
        nextCursor: null,
        sessionLogs: { sessionKey: null }
      });
    });

    test("a member reads only their own session's logs; anyone else's is a 404 like a missing one", async () => {
      await configure();
      const { session: adminSession } = await seedChunks(1);

      const member = await createMemberIdentity(`session-logs-reader-${Date.now()}`);
      try {
        const missingId = crypto.randomUUID();
        for await (const suffix of ["logs", "logs/tail"]) {
          const somebodyElses = await member.as("GET", `/api/v1/agent-vault/sessions/${adminSession.id}/${suffix}`);
          const neverExisted = await member.as("GET", `/api/v1/agent-vault/sessions/${missingId}/${suffix}`);

          expect([suffix, somebodyElses.statusCode, neverExisted.statusCode]).toEqual([suffix, 404, 404]);
          expect(somebodyElses.json().message).toBe(`Session with ID '${adminSession.id}' not found`);
          expect(neverExisted.json().message).toBe(`Session with ID '${missingId}' not found`);
        }

        const bundle = await createAccessBundle(`session-logs-reader-${Date.now()}`);
        const granted = await inject("POST", `/api/v1/agent-vault/access-bundles/${bundle.id}/members`, {
          machineIdentityIds: [member.id]
        });
        expect(granted.statusCode).toBe(200);
        const minted = await member.as("POST", "/api/v1/agent-vault/sessions", {
          accessBundles: [bundle.name],
          ttl: "1h"
        });
        expect(minted.statusCode, minted.payload).toBe(200);
        const ownSession = minted.json().session as { id: string };

        const proxy = await createProxy(`session-logs-reader-${Date.now()}`);
        const { uploadUrl } = await requestUploadUrl(proxy, ownSession.id);
        fakeS3Bucket.put(uploadUrl, Buffer.alloc(CHUNK_BYTES));

        const own = await member.as("GET", `/api/v1/agent-vault/sessions/${ownSession.id}/logs`);
        expect(own.statusCode, own.payload).toBe(200);
        expect(own.json().chunks).toHaveLength(1);
        expect(typeof own.json().sessionLogs.sessionKey).toBe("string");
      } finally {
        await member.cleanup();
      }
    });
  });
});
