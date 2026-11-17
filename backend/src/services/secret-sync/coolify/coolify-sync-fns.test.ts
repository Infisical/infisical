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
import { CoolifySyncFns } from "./coolify-sync-fns";
/* eslint-enable import/first */

const gatewayV2Service = { getPlatformConnectionDetailsByGatewayId: vi.fn() };
const gatewayPoolService = { resolveEffectiveGatewayId: vi.fn() };

const API_URL = "https://app.coolify.io/api/v1";
const APPLICATION_ENVS = `${API_URL}/applications/res-uuid/envs`;

const syncWith = (
  resourceType: CoolifyResourceType = CoolifyResourceType.Application,
  syncOptions: Record<string, unknown> = {}
) =>
  ({
    destination: "coolify",
    connection: {
      credentials: { instanceUrl: "https://app.coolify.io/", apiToken: "1|token" },
      gatewayId: null,
      gatewayPoolId: null
    },
    destinationConfig: { resourceType, resourceId: "res-uuid", resourceName: "api" },
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

const bothCopies = (key: string, value: string | null) => [envVar(key, value), envVar(key, value, { isPreview: true })];

const stubCoolify = (envVars: ReturnType<typeof envVar>[]) =>
  safeRequestMock.mockImplementation(async (config: { method: string }) => ({
    data: config.method === "GET" ? envVars : {}
  }));

const axiosErrorWithStatus = (status: number, data?: unknown) =>
  new AxiosError("Request failed", undefined, undefined, undefined, { status, data } as AxiosResponse);

const requestsWith = (method: string) =>
  safeRequestMock.mock.calls.map(([config]) => config).filter((config) => config.method === method);

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

  it("writes both copies of new and changed application variables as literals in one batch", async () => {
    stubCoolify([
      ...bothCopies("UNCHANGED", "same"),
      ...bothCopies("CHANGED", "old"),
      envVar("NOT_LITERAL", "x", { isLiteral: false }),
      envVar("NOT_LITERAL", "x", { isPreview: true })
    ]);

    await sync(syncWith(), payloadOf({ UNCHANGED: "same", CHANGED: "new", NEW: "$HOME", NOT_LITERAL: "x" }));

    const [list] = requestsWith("GET");
    expect(list.url).toBe(APPLICATION_ENVS);
    expect(list.headers.Authorization).toBe("Bearer 1|token");

    const patches = requestsWith("PATCH");
    expect(patches).toHaveLength(1);
    expect(patches[0].url).toBe(`${APPLICATION_ENVS}/bulk`);
    expect(patches[0].data).toEqual({
      data: [
        { key: "CHANGED", value: "new", is_literal: true },
        { key: "CHANGED", value: "new", is_literal: true, is_preview: true },
        { key: "NEW", value: "$HOME", is_literal: true },
        { key: "NEW", value: "$HOME", is_literal: true, is_preview: true },
        { key: "NOT_LITERAL", value: "x", is_literal: true }
      ]
    });
  });

  it.each([
    [CoolifyResourceType.Service, "services"],
    [CoolifyResourceType.Database, "databases"]
  ])("writes a single copy to a %s, without the preview flag", async (resourceType, path) => {
    stubCoolify([]);

    await sync(syncWith(resourceType), payloadOf({ NEW: "a" }));

    expect(requestsWith("PATCH").map(({ url, data }) => [url, data])).toEqual([
      [`${API_URL}/${path}/res-uuid/envs/bulk`, { data: [{ key: "NEW", value: "a", is_literal: true }] }]
    ]);
  });

  it("sends no update when every value is already in Coolify, including an empty one Coolify stores as null", async () => {
    stubCoolify([...bothCopies("UNCHANGED", "same"), ...bothCopies("EMPTY", null)]);

    await sync(syncWith(), payloadOf({ UNCHANGED: "same", EMPTY: "" }));

    expect(requestsWith("PATCH")).toHaveLength(0);
  });

  it("deletes both copies of a stale variable but never one Coolify manages", async () => {
    stubCoolify([...bothCopies("STALE", "a"), envVar("SERVICE_PASSWORD_DB", "generated")]);

    await sync(syncWith(), payloadOf({}));

    expect(deletedUrls()).toEqual([`${APPLICATION_ENVS}/main-STALE`, `${APPLICATION_ENVS}/preview-STALE`]);
  });

  it("splits a large update into batches", async () => {
    stubCoolify([]);

    await sync(
      syncWith(CoolifyResourceType.Service),
      payloadOf(Object.fromEntries(Array.from({ length: 150 }, (_, index) => [`KEY_${index}`, "a"])))
    );

    expect(requestsWith("PATCH").map(({ data }) => data.data.length)).toEqual([100, 50]);
  });

  it("leaves a variable that only exists for preview deployments alone", async () => {
    stubCoolify([envVar("PREVIEW_ONLY", "a", { isPreview: true })]);

    await sync(syncWith(), payloadOf({}));

    expect(deletedUrls()).toHaveLength(0);
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

  it("removes both copies of synced variables only, and never one Coolify manages", async () => {
    stubCoolify([...bothCopies("SYNCED", "a"), envVar("OTHER", "b"), envVar("SERVICE_FQDN_API", "c")]);

    await remove(syncWith(), payloadOf({ SYNCED: "a", SERVICE_FQDN_API: "c" }));

    expect(deletedUrls()).toEqual([`${APPLICATION_ENVS}/main-SYNCED`, `${APPLICATION_ENVS}/preview-SYNCED`]);
  });

  it("does not treat inherited object properties as synced secrets", async () => {
    stubCoolify([envVar("constructor", "a"), envVar("toString", "b")]);

    await remove(syncWith(), payloadOf({}));

    expect(deletedUrls()).toHaveLength(0);
  });

  it("imports the main copy of each variable, skipping preview copies and the ones Coolify manages", async () => {
    stubCoolify([
      envVar("API_KEY", "main-value"),
      envVar("API_KEY", "preview-value", { isPreview: true }),
      envVar("EMPTY", null),
      envVar("SERVICE_PASSWORD_DB", "generated")
    ]);

    expect(await importSecrets(syncWith())).toEqual({ API_KEY: { value: "main-value" }, EMPTY: { value: "" } });
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
