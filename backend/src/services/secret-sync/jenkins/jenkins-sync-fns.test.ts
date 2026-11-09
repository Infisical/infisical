/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.mock` factories are hoisted above imports, so the spies they reference must come from `vi.hoisted`.
const { safeRequestMock } = vi.hoisted(() => ({
  safeRequestMock: vi.fn()
}));

vi.mock("@app/lib/validator/safe-request", () => ({
  safeRequest: { request: (...args: unknown[]) => (safeRequestMock as any)(...args) },
  getSharedHttpsAgent: vi.fn()
}));
vi.mock("@app/lib/config/request", () => ({ request: { request: vi.fn() } }));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
  sanitizeUrlForLog: (url: string) => url
}));
vi.mock("@app/lib/crypto", () => ({ crypto: {} }));
vi.mock("@app/lib/gateway-v2/types", () => ({ GatewayProxyProtocol: { Tcp: "tcp", Http: "http" } }));
vi.mock("@app/lib/gateway-v2/gateway-v2", () => ({ withGatewayV2Proxy: vi.fn() }));
vi.mock("@app/ee/services/dynamic-secret/dynamic-secret-fns", () => ({
  verifyHostInputValidity: vi.fn(async () => ["host"])
}));
// A key schema of "INF_{{secretKey}}" owns every credential starting with "INF_"; without one, every credential
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: (key: string, _environment: string, schema?: string) =>
    !schema || key.startsWith(schema.replace("{{secretKey}}", ""))
}));

/* eslint-disable import/first */
import { GatewayTransportError } from "@app/lib/errors";

import { SecretSyncError } from "../secret-sync-errors";
import { JenkinsSyncScope } from "./jenkins-sync-enums";
import { buildJenkinsSecretTextCredentialXml, getJenkinsCredentialStorePath, JenkinsSyncFns } from "./jenkins-sync-fns";
/* eslint-enable import/first */

const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() };
const gatewayPoolService = { resolveEffectiveGatewayId: vi.fn() };

const INSTANCE_URL = "https://ci.example.com/jenkins";
const GLOBAL_STORE = `${INSTANCE_URL}/credentials/store/system/domain/_`;

const syncWith = ({
  destinationConfig = { scope: JenkinsSyncScope.Global },
  syncOptions = {}
}: { destinationConfig?: Record<string, unknown>; syncOptions?: Record<string, unknown> } = {}) =>
  ({
    destination: "jenkins",
    connection: {
      credentials: { instanceUrl: `${INSTANCE_URL}/`, username: "infisical", apiToken: "token" },
      gatewayId: null,
      gatewayPoolId: null
    },
    destinationConfig,
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions }
  }) as any;

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as any;

const stubJenkins = (credentials: { id: string; typeName: string }[]) =>
  safeRequestMock.mockImplementation(async (config: { method: string; url: string }) =>
    config.method === "GET" ? { data: { credentials } } : { data: "" }
  );

const requestsWith = (method: string) =>
  safeRequestMock.mock.calls.map(([config]) => config).filter((config) => config.method === method);

const sync = (secretSync: any, payload: any) =>
  JenkinsSyncFns.syncSecrets(secretSync, payload, gatewayV2Service as any, gatewayPoolService as any);

describe("JenkinsSyncFns.syncSecrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects a key Jenkins would not accept as a credential ID before sending any request", async () => {
    await expect(sync(syncWith(), payloadOf({ VALID: "a", "team/DB_PASSWORD": "b" }))).rejects.toThrow(
      "'team/DB_PASSWORD' is not a valid Jenkins credential ID"
    );

    expect(safeRequestMock).not.toHaveBeenCalled();
  });

  it("creates missing credentials, updates existing ones and deletes stale Secret text credentials", async () => {
    stubJenkins([
      { id: "EXISTING", typeName: "Secret text" },
      { id: "STALE", typeName: "Secret text" },
      { id: "DEPLOY_KEY", typeName: "SSH Username with private key" }
    ]);

    await sync(syncWith(), payloadOf({ NEW: "new-value", EXISTING: "updated-value" }));

    const [list] = requestsWith("GET");
    expect(list.url).toBe(`${GLOBAL_STORE}/api/json`);
    expect(list.headers.Authorization).toBe(`Basic ${Buffer.from("infisical:token").toString("base64")}`);

    expect(requestsWith("POST").map(({ url, data }) => [url, data])).toEqual([
      [`${GLOBAL_STORE}/createCredentials`, buildJenkinsSecretTextCredentialXml("NEW", "new-value")],
      [
        `${GLOBAL_STORE}/credential/EXISTING/config.xml`,
        buildJenkinsSecretTextCredentialXml("EXISTING", "updated-value")
      ]
    ]);
    expect(requestsWith("DELETE").map(({ url }) => url)).toEqual([`${GLOBAL_STORE}/credential/STALE/config.xml`]);
  });

  it("refuses a key that belongs to a credential of another type without writing anything", async () => {
    stubJenkins([{ id: "DEPLOY_KEY", typeName: "SSH Username with private key" }]);

    const error = await sync(syncWith(), payloadOf({ NEW: "a", DEPLOY_KEY: "b" })).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).message).toContain(
      "A Jenkins credential with ID 'DEPLOY_KEY' already exists as 'SSH Username with private key'"
    );
    expect(requestsWith("POST")).toHaveLength(0);
  });

  it("only deletes credentials the key schema owns", async () => {
    stubJenkins([
      { id: "INF_STALE", typeName: "Secret text" },
      { id: "MANUAL", typeName: "Secret text" }
    ]);

    await sync(syncWith({ syncOptions: { keySchema: "INF_{{secretKey}}" } }), payloadOf({ INF_KEEP: "a" }));

    expect(requestsWith("DELETE").map(({ url }) => url)).toEqual([`${GLOBAL_STORE}/credential/INF_STALE/config.xml`]);
  });

  it("ignores credentials whose IDs could not have been written by Infisical", async () => {
    stubJenkins([
      { id: "..", typeName: "Secret text" },
      { id: "team/key", typeName: "Secret text" },
      { id: "STALE", typeName: "Secret text" }
    ]);

    await sync(syncWith(), payloadOf({ NEW: "a" }));
    await JenkinsSyncFns.removeSecrets(
      syncWith(),
      payloadOf({ "..": "a", STALE: "b" }),
      gatewayV2Service as any,
      gatewayPoolService as any
    );

    expect(requestsWith("DELETE").map(({ url }) => url)).toEqual([
      `${GLOBAL_STORE}/credential/STALE/config.xml`,
      `${GLOBAL_STORE}/credential/STALE/config.xml`
    ]);
  });

  it("deletes nothing when secret deletion is disabled", async () => {
    stubJenkins([{ id: "STALE", typeName: "Secret text" }]);

    await sync(syncWith({ syncOptions: { disableSecretDeletion: true } }), payloadOf({ NEW: "a" }));

    expect(requestsWith("DELETE")).toHaveLength(0);
  });

  it("does not retry when Jenkins rejects the API token", async () => {
    safeRequestMock.mockRejectedValue(
      new AxiosError("Request failed with status code 401", "ERR_BAD_REQUEST", undefined, undefined, {
        status: 401,
        statusText: "Unauthorized",
        data: "<html></html>",
        headers: {},
        config: { headers: new AxiosHeaders() }
      })
    );

    const error = await sync(syncWith(), payloadOf({ NEW: "a" })).catch((err: unknown) => err);

    expect((error as SecretSyncError).message).toBe(
      "Failed to list Jenkins credentials: Jenkins rejected the username or API token"
    );
    expect((error as SecretSyncError).shouldRetry).toBe(false);
  });

  it("leaves a gateway tunnel failure to the queue's retries", async () => {
    safeRequestMock.mockRejectedValue(new GatewayTransportError({ message: "Failed to reach the gateway" }));

    const error = await sync(syncWith(), payloadOf({ NEW: "a" })).catch((err: unknown) => err);

    expect((error as SecretSyncError).message).toBe("Failed to list Jenkins credentials: Failed to reach the gateway");
    expect((error as SecretSyncError).shouldRetry).toBe(true);
  });
});

describe("JenkinsSyncFns.removeSecrets", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes only Secret text credentials whose ID is in the payload", async () => {
    stubJenkins([
      { id: "SYNCED", typeName: "Secret text" },
      { id: "OTHER", typeName: "Secret text" },
      { id: "DEPLOY_KEY", typeName: "SSH Username with private key" }
    ]);

    await JenkinsSyncFns.removeSecrets(
      syncWith(),
      payloadOf({ SYNCED: "a", DEPLOY_KEY: "b" }),
      gatewayV2Service as any,
      gatewayPoolService as any
    );

    expect(requestsWith("DELETE").map(({ url }) => url)).toEqual([`${GLOBAL_STORE}/credential/SYNCED/config.xml`]);
  });

  it("does not treat inherited object properties as synced secrets", async () => {
    stubJenkins([
      { id: "constructor", typeName: "Secret text" },
      { id: "toString", typeName: "Secret text" }
    ]);

    await JenkinsSyncFns.removeSecrets(syncWith(), payloadOf({}), gatewayV2Service as any, gatewayPoolService as any);

    expect(requestsWith("DELETE")).toHaveLength(0);
  });
});

describe("getJenkinsCredentialStorePath", () => {
  it("uses the system store for the global scope", () => {
    expect(getJenkinsCredentialStorePath({ scope: JenkinsSyncScope.Global })).toBe(
      "/credentials/store/system/domain/_"
    );
  });

  it("walks nested folders and encodes each segment", () => {
    expect(getJenkinsCredentialStorePath({ scope: JenkinsSyncScope.Folder, folderPath: "team a/app" })).toBe(
      "/job/team%20a/job/app/credentials/store/folder/domain/_"
    );
  });
});

describe("buildJenkinsSecretTextCredentialXml", () => {
  it("escapes XML in the secret so it cannot break out of the element", () => {
    expect(buildJenkinsSecretTextCredentialXml("ID", `a<b>&"c'\r\nd`)).toBe(
      "<org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>" +
        "<scope>GLOBAL</scope><id>ID</id><description>Managed by Infisical</description>" +
        "<secret>a&lt;b&gt;&amp;&quot;c&apos;&#13;\nd</secret>" +
        "</org.jenkinsci.plugins.plaincredentials.impl.StringCredentialsImpl>"
    );
  });
});
