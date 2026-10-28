import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretSyncPayload } from "../secret-sync-payload";
import { ConvexSyncFns } from "./convex-sync-fns";
import { TConvexSyncWithCredentials } from "./convex-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, post, blockLocalAndPrivateIpAddresses } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn().mockResolvedValue({ data: {} }),
  blockLocalAndPrivateIpAddresses: vi.fn().mockResolvedValue(undefined)
}));

vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { get, post }
}));

vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  blockLocalAndPrivateIpAddresses
}));

const DEPLOYMENT_URL = "https://playful-otter-123.convex.cloud";
const LIST_URL = `${DEPLOYMENT_URL}/api/v1/list_environment_variables`;
const UPDATE_URL = `${DEPLOYMENT_URL}/api/v1/update_environment_variables`;
const AUTH_HEADERS = {
  headers: {
    Authorization: "Convex pat-token",
    Accept: "application/json",
    "Content-Type": "application/json"
  }
};

const syncWith = (syncOptions: Record<string, unknown> = {}) =>
  ({
    destination: "convex",
    destinationConfig: { deploymentUrl: DEPLOYMENT_URL, deploymentName: "playful-otter-123" },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions },
    connection: { credentials: { accessToken: "pat-token" } }
  }) as unknown as TConvexSyncWithCredentials;

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

const stubExisting = (environmentVariables: Record<string, string>) => {
  get.mockResolvedValue({ data: { environmentVariables } });
};

const axiosError = (status: number, message: string) => {
  const error = new AxiosError(message);
  error.response = {
    status,
    data: { message },
    statusText: message,
    headers: {},
    config: { headers: {} as never }
  };
  return error;
};

describe("ConvexSyncFns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    post.mockResolvedValue({ data: {} });
    blockLocalAndPrivateIpAddresses.mockResolvedValue(undefined);
  });

  it("upserts secrets in one update request", async () => {
    await ConvexSyncFns.syncSecrets(
      syncWith({ disableSecretDeletion: true }),
      payloadOf({ API_KEY: "key", NEW_VAR: "new" })
    );

    expect(blockLocalAndPrivateIpAddresses).toHaveBeenCalledWith(DEPLOYMENT_URL);
    expect(get).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(
      UPDATE_URL,
      {
        changes: [
          { name: "API_KEY", value: "key" },
          { name: "NEW_VAR", value: "new" }
        ]
      },
      AUTH_HEADERS
    );
  });

  it("deletes stale keys that match the schema in the same update request", async () => {
    stubExisting({ INF_API_KEY: "old", INF_STALE: "gone", OTHER: "keep" });

    await ConvexSyncFns.syncSecrets(syncWith({ keySchema: "INF_{{secretKey}}" }), payloadOf({ INF_API_KEY: "key" }));

    expect(get).toHaveBeenCalledWith(LIST_URL, AUTH_HEADERS);
    expect(post).toHaveBeenCalledWith(
      UPDATE_URL,
      {
        changes: [
          { name: "INF_API_KEY", value: "key" },
          { name: "INF_STALE", value: null }
        ]
      },
      AUTH_HEADERS
    );
  });

  it("does not delete destination keys when secret deletion is disabled", async () => {
    await ConvexSyncFns.syncSecrets(syncWith({ disableSecretDeletion: true }), payloadOf({ API_KEY: "key" }));

    expect(get).not.toHaveBeenCalled();
    expect(post).toHaveBeenCalledWith(UPDATE_URL, { changes: [{ name: "API_KEY", value: "key" }] }, AUTH_HEADERS);
  });

  it("skips CONVEX_ keys on upsert and does not delete them", async () => {
    stubExisting({
      API_KEY: "a",
      CONVEX_URL: "https://example.convex.cloud",
      CONVEX_DEPLOYMENT: "prod:playful-otter-123"
    });

    await ConvexSyncFns.syncSecrets(syncWith(), payloadOf({ API_KEY: "b", CONVEX_URL: "overwrite-me" }));

    expect(post).toHaveBeenCalledWith(UPDATE_URL, { changes: [{ name: "API_KEY", value: "b" }] }, AUTH_HEADERS);
  });

  it("skips empty values on upsert", async () => {
    await ConvexSyncFns.syncSecrets(
      syncWith({ disableSecretDeletion: true }),
      payloadOf({ API_KEY: "key", EMPTY: "" })
    );

    expect(post).toHaveBeenCalledWith(UPDATE_URL, { changes: [{ name: "API_KEY", value: "key" }] }, AUTH_HEADERS);
  });

  it("rejects invalid Convex environment variable names before writing", async () => {
    await expect(ConvexSyncFns.syncSecrets(syncWith(), payloadOf({ "API-KEY": "key", VALID: "ok" }))).rejects.toThrow(
      "not valid Convex environment variables: API-KEY"
    );

    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("imports destination variables except reserved and empty values", async () => {
    stubExisting({ API_KEY: "a", EMPTY: "", CONVEX_URL: "reserved" });

    await expect(ConvexSyncFns.getSecrets(syncWith())).resolves.toEqual({
      API_KEY: { value: "a" }
    });
    expect(get).toHaveBeenCalledWith(LIST_URL, AUTH_HEADERS);
  });

  it("imports environment variables returned as a name/value list", async () => {
    get.mockResolvedValue({
      data: {
        environmentVariables: [
          { name: "API_KEY", value: "a" },
          { name: "CONVEX_URL", value: "reserved" }
        ]
      }
    });

    await expect(ConvexSyncFns.getSecrets(syncWith())).resolves.toEqual({
      API_KEY: { value: "a" }
    });
  });

  it("removes only Infisical-managed keys that exist on the deployment", async () => {
    stubExisting({ API_KEY: "a", OTHER: "b", CONVEX_URL: "reserved" });

    await ConvexSyncFns.removeSecrets(syncWith(), payloadOf({ API_KEY: "a", MISSING: "c", CONVEX_URL: "reserved" }));

    expect(post).toHaveBeenCalledWith(UPDATE_URL, { changes: [{ name: "API_KEY", value: null }] }, AUTH_HEADERS);
  });

  it("maps Convex HTTP errors to SecretSyncError messages", async () => {
    get.mockRejectedValue(axiosError(401, "Unauthorized"));

    await expect(ConvexSyncFns.getSecrets(syncWith())).rejects.toMatchObject({
      name: "SecretSyncError",
      message: "Failed to list environment variables from Convex: Unauthorized"
    });
  });

  it("maps Convex update errors to SecretSyncError messages", async () => {
    post.mockRejectedValue(axiosError(400, "Invalid environment variable"));

    await expect(
      ConvexSyncFns.syncSecrets(syncWith({ disableSecretDeletion: true }), payloadOf({ API_KEY: "key" }))
    ).rejects.toMatchObject({
      name: "SecretSyncError",
      message: "Failed to update environment variables in Convex: Invalid environment variable"
    });
  });

  it("does not call Convex when every secret is reserved or empty", async () => {
    await ConvexSyncFns.syncSecrets(
      syncWith({ disableSecretDeletion: true }),
      payloadOf({ CONVEX_URL: "https://example.convex.cloud", EMPTY: "" })
    );

    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });
});
