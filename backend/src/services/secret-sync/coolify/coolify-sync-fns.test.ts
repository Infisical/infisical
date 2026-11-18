/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { AxiosError, AxiosResponse } from "axios";
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
// A key schema of "INF_{{secretKey}}" owns every variable starting with "INF_"; without one, every variable
vi.mock("@app/services/secret-sync/secret-sync-fns", () => ({
  matchesSchema: (key: string, _environment: string, schema?: string) =>
    !schema || key.startsWith(schema.replace("{{secretKey}}", ""))
}));

/* eslint-disable import/first */
import { GatewayTransportError } from "@app/lib/errors";
import { CoolifyResourceType } from "@app/services/app-connection/coolify/coolify-connection-enums";

import { SecretSyncError } from "../secret-sync-errors";
import { CoolifySyncScope } from "./coolify-sync-enums";
import { CoolifySyncFns } from "./coolify-sync-fns";
/* eslint-enable import/first */

const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() };
const gatewayPoolService = { resolveEffectiveGatewayId: vi.fn() };

const API_URL = "https://app.coolify.io/api/v1";
const APPLICATION_ENVS = `${API_URL}/applications/res-uuid/envs`;

const PLACEHOLDER = "infisical-sync-pending";

const syncWith = (
  resourceType: CoolifyResourceType = CoolifyResourceType.Application,
  syncOptions: Record<string, unknown> = {},
  scope: CoolifySyncScope = CoolifySyncScope.Production
) =>
  ({
    destination: "coolify",
    connection: {
      credentials: { instanceUrl: "https://app.coolify.io/", apiToken: "1|token" },
      gatewayId: null,
      gatewayPoolId: null
    },
    destinationConfig: { resourceType, resourceId: "res-uuid", resourceName: "api", scope },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions }
  }) as any;

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as any;

// Leaving `value` undefined stands for a variable whose value Coolify did not return
const envVar = (key: string, value?: string | null, { isPreview = false, isLiteral = true } = {}) => ({
  uuid: `${isPreview ? "preview" : "main"}-${key}`,
  key,
  ...(value !== undefined && { value }),
  is_preview: isPreview,
  is_literal: isLiteral
});

// Listings made after a write return `afterWrite`, the way Coolify adds preview copies of new production variables
const stubCoolify = (envVars: ReturnType<typeof envVar>[], afterWrite = envVars) => {
  let written = false;
  safeRequestMock.mockImplementation(async (config: { method: string }) => {
    if (config.method === "PATCH") written = true;
    if (config.method !== "GET") return { data: {} };
    return { data: written ? afterWrite : envVars };
  });
};

const axiosErrorWithStatus = (status: number, data?: unknown) =>
  new AxiosError("Request failed", undefined, undefined, undefined, { status, data } as AxiosResponse);

const requestsWith = (method: string) =>
  safeRequestMock.mock.calls.map(([config]) => config).filter((config) => config.method === method);

const requestMethods = () => safeRequestMock.mock.calls.map(([config]) => config.method);

const deletedUrls = () => requestsWith("DELETE").map(({ url }) => url);

const sync = (secretSync: any, payload: any) =>
  CoolifySyncFns.syncSecrets(secretSync, payload, gatewayV2Service as any, gatewayPoolService as any);

const remove = (secretSync: any, payload: any) =>
  CoolifySyncFns.removeSecrets(secretSync, payload, gatewayV2Service as any, gatewayPoolService as any);

const importSecrets = (secretSync: any) =>
  CoolifySyncFns.getSecrets(secretSync, gatewayV2Service as any, gatewayPoolService as any);

describe("CoolifySyncFns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects every key Coolify would refuse or that Coolify manages before sending any request", async () => {
    await expect(sync(syncWith(), payloadOf({ VALID: "a", "my-key": "b", SERVICE_PASSWORD_DB: "c" }))).rejects.toThrow(
      "2 secret keys are not a valid Coolify environment variable name: my-key, SERVICE_PASSWORD_DB"
    );

    expect(safeRequestMock).not.toHaveBeenCalled();
  });

  it("writes new and changed production variables as literals in one batch", async () => {
    stubCoolify([
      envVar("UNCHANGED", "same"),
      envVar("CHANGED", "old"),
      envVar("NOT_LITERAL", "x", { isLiteral: false })
    ]);

    await sync(syncWith(), payloadOf({ UNCHANGED: "same", CHANGED: "new", NEW: "$HOME", NOT_LITERAL: "x" }));

    const [list] = requestsWith("GET");
    expect(list.url).toBe(APPLICATION_ENVS);
    expect(list.headers.Authorization).toBe("Bearer 1|token");

    const [, write] = requestsWith("PATCH");
    expect(write.url).toBe(`${APPLICATION_ENVS}/bulk`);
    expect(write.data).toEqual({
      data: [
        { key: "CHANGED", value: "new", is_literal: true },
        { key: "NEW", value: "$HOME", is_literal: true },
        { key: "NOT_LITERAL", value: "x", is_literal: true }
      ]
    });
  });

  it("creates a new production variable with a placeholder and deletes Coolify's preview copy before writing its value", async () => {
    stubCoolify(
      [envVar("USER_PREVIEW", "p", { isPreview: true })],
      [
        envVar("NEW", PLACEHOLDER),
        envVar("NEW", PLACEHOLDER, { isPreview: true }),
        envVar("USER_PREVIEW", "p", { isPreview: true })
      ]
    );

    await sync(syncWith(), payloadOf({ NEW: "secret" }));

    expect(requestMethods()).toEqual(["GET", "PATCH", "GET", "DELETE", "PATCH"]);
    expect(requestsWith("PATCH").map(({ data }) => data)).toEqual([
      { data: [{ key: "NEW", value: PLACEHOLDER, is_literal: true }] },
      { data: [{ key: "NEW", value: "secret", is_literal: true }] }
    ]);
    expect(deletedUrls()).toEqual([`${APPLICATION_ENVS}/preview-NEW`]);
  });

  it("deletes the placeholder copy a stopped run left behind before writing the value", async () => {
    stubCoolify([envVar("KEY", PLACEHOLDER), envVar("KEY", PLACEHOLDER, { isPreview: true })]);

    await sync(syncWith(), payloadOf({ KEY: "secret" }));

    expect(requestMethods()).toEqual(["GET", "DELETE", "PATCH"]);
    expect(deletedUrls()).toEqual([`${APPLICATION_ENVS}/preview-KEY`]);
  });

  it("never deletes a preview variable that isn't a placeholder copy, such as a locked or empty one", async () => {
    stubCoolify([
      envVar("LOCKED", "x"),
      envVar("LOCKED", undefined, { isPreview: true }),
      envVar("EMPTY", null),
      envVar("EMPTY", null, { isPreview: true })
    ]);

    await sync(syncWith(), payloadOf({ LOCKED: "x", EMPTY: "now-set" }));

    expect(requestMethods()).toEqual(["GET", "PATCH"]);
    expect(deletedUrls()).toHaveLength(0);
  });

  it("skips the empty step for a key that already has a preview variable, which Coolify doesn't copy over", async () => {
    stubCoolify([envVar("SHARED", "staging-value", { isPreview: true })]);

    await sync(syncWith(), payloadOf({ SHARED: "prod-value" }));

    expect(requestMethods()).toEqual(["GET", "PATCH"]);
    expect(deletedUrls()).toHaveLength(0);
  });

  it("writes only preview variables in the preview scope, leaving production variables alone", async () => {
    stubCoolify([
      envVar("API_KEY", "prod-value"),
      envVar("API_KEY", "old-preview-value", { isPreview: true }),
      envVar("STALE", "s", { isPreview: true }),
      envVar("PROD_ONLY", "x")
    ]);

    await sync(
      syncWith(CoolifyResourceType.Application, {}, CoolifySyncScope.Preview),
      payloadOf({ API_KEY: "preview-value", NEW: "n" })
    );

    expect(requestsWith("PATCH").map(({ data }) => data)).toEqual([
      {
        data: [
          { key: "API_KEY", value: "preview-value", is_literal: true, is_preview: true },
          { key: "NEW", value: "n", is_literal: true, is_preview: true }
        ]
      }
    ]);
    expect(deletedUrls()).toEqual([`${APPLICATION_ENVS}/preview-STALE`]);
  });

  it.each([
    [CoolifyResourceType.Service, "services"],
    [CoolifyResourceType.Database, "databases"]
  ])("writes to a %s in one request, without the preview flag", async (resourceType, path) => {
    stubCoolify([]);

    await sync(syncWith(resourceType), payloadOf({ NEW: "a" }));

    expect(requestMethods()).toEqual(["GET", "PATCH"]);
    expect(requestsWith("PATCH").map(({ url, data }) => [url, data])).toEqual([
      [`${API_URL}/${path}/res-uuid/envs/bulk`, { data: [{ key: "NEW", value: "a", is_literal: true }] }]
    ]);
  });

  it("sends no update when every value is already in Coolify, including an empty one Coolify stores as null", async () => {
    stubCoolify([envVar("UNCHANGED", "same"), envVar("EMPTY", null)]);

    await sync(syncWith(), payloadOf({ UNCHANGED: "same", EMPTY: "" }));

    expect(requestsWith("PATCH")).toHaveLength(0);
  });

  it("deletes a stale production variable but never one Coolify manages or a preview variable", async () => {
    stubCoolify([
      envVar("STALE", "a"),
      envVar("STALE", "a", { isPreview: true }),
      envVar("SERVICE_PASSWORD_DB", "generated")
    ]);

    await sync(syncWith(), payloadOf({}));

    expect(deletedUrls()).toEqual([`${APPLICATION_ENVS}/main-STALE`]);
  });

  it("splits a large update into batches", async () => {
    stubCoolify([]);

    await sync(
      syncWith(CoolifyResourceType.Service),
      payloadOf(Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`KEY_${index}`, "a"])))
    );

    expect(requestsWith("PATCH").map(({ data }) => data.data.length)).toEqual([100, 50]);
  });

  it("only deletes variables the key schema owns", async () => {
    stubCoolify([envVar("INF_STALE", "a"), envVar("MANUAL", "b")]);

    await sync(syncWith(CoolifyResourceType.Service, { keySchema: "INF_{{secretKey}}" }), payloadOf({ INF_KEEP: "c" }));

    expect(deletedUrls()).toEqual([`${API_URL}/services/res-uuid/envs/main-INF_STALE`]);
  });

  it("deletes nothing when secret deletion is disabled", async () => {
    stubCoolify([envVar("STALE", "a")]);

    await sync(syncWith(CoolifyResourceType.Application, { disableSecretDeletion: true }), payloadOf({ NEW: "b" }));

    expect(deletedUrls()).toHaveLength(0);
  });

  it("removes the synced variables of its scope only, and never one Coolify manages", async () => {
    stubCoolify([
      envVar("SYNCED", "a"),
      envVar("SYNCED", "staging-a", { isPreview: true }),
      envVar("OTHER", "c"),
      envVar("SERVICE_FQDN_API", "d")
    ]);

    await remove(syncWith(), payloadOf({ SYNCED: "a", SERVICE_FQDN_API: "d" }));

    expect(deletedUrls()).toEqual([`${APPLICATION_ENVS}/main-SYNCED`]);
  });

  it("does not treat inherited object properties as synced secrets", async () => {
    stubCoolify([envVar("constructor", "a"), envVar("toString", "b")]);

    await remove(syncWith(), payloadOf({}));

    expect(deletedUrls()).toHaveLength(0);
  });

  it("imports the variables of the sync's scope, skipping the ones Coolify manages", async () => {
    stubCoolify([
      envVar("API_KEY", "main-value"),
      envVar("API_KEY", "preview-value", { isPreview: true }),
      envVar("EMPTY", null),
      envVar("SERVICE_PASSWORD_DB", "generated")
    ]);

    expect(await importSecrets(syncWith())).toEqual({ API_KEY: { value: "main-value" }, EMPTY: { value: "" } });
    expect(await importSecrets(syncWith(CoolifyResourceType.Application, {}, CoolifySyncScope.Preview))).toEqual({
      API_KEY: { value: "preview-value" }
    });
  });

  it("refuses to import when Coolify withholds a value", async () => {
    stubCoolify([envVar("READABLE", "a"), envVar("LOCKED")]);

    await expect(importSecrets(syncWith())).rejects.toThrow("Coolify did not return the value of 'LOCKED'");
  });

  it("imports only variables the key schema owns, so a withheld value outside it doesn't block the import", async () => {
    stubCoolify([envVar("INF_API_KEY", "a"), envVar("LOCKED")]);

    expect(await importSecrets(syncWith(CoolifyResourceType.Service, { keySchema: "INF_{{secretKey}}" }))).toEqual({
      INF_API_KEY: { value: "a" }
    });
  });

  it.each([
    [
      "a rejected API token",
      axiosErrorWithStatus(401, { message: "Unauthenticated." }),
      "Coolify rejected the API token. Check that it hasn't expired, been paused or been revoked",
      false
    ],
    [
      "a missing token permission",
      axiosErrorWithStatus(403, { message: "Missing required permissions: read" }),
      "Missing required permissions: read",
      false
    ],
    ["a rate limit", axiosErrorWithStatus(429, { message: "Too Many Attempts." }), "Too Many Attempts.", true],
    [
      "a gateway tunnel failure",
      new GatewayTransportError({ message: "Failed to reach the gateway" }),
      "Failed to reach the gateway",
      true
    ]
  ])("reports %s and sets whether the queue retries it", async (_, failure, reason, shouldRetry) => {
    safeRequestMock.mockRejectedValue(failure);

    const error = (await sync(syncWith(), payloadOf({ NEW: "a" })).catch((err: unknown) => err)) as SecretSyncError;

    expect(error.message).toBe(`Failed to list Coolify environment variables: ${reason}`);
    expect(error.shouldRetry).toBe(shouldRetry);
  });
});
