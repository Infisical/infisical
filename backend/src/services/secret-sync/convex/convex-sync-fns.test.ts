import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretSyncPayload } from "../secret-sync-payload";
import { ConvexSyncFns } from "./convex-sync-fns";
import { TConvexSyncWithCredentials } from "./convex-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));

vi.mock("@app/lib/validator", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  safeRequest: { get, post }
}));

const DEPLOYMENT_NAME = "playful-otter-123";
const DEPLOYMENT_URL = `https://${DEPLOYMENT_NAME}.convex.cloud`;
const DEPLOYMENT_LOOKUP_URL = `https://api.convex.dev/v1/deployments/${DEPLOYMENT_NAME}`;
const LIST_URL = `${DEPLOYMENT_URL}/api/v1/list_environment_variables`;
const UPDATE_URL = `${DEPLOYMENT_URL}/api/v1/update_environment_variables`;
const DEPLOYMENT_HEADERS = { headers: { Authorization: "Convex pat-token", Accept: "application/json" } };

const syncWith = (syncOptions: Record<string, unknown> = {}) =>
  ({
    destination: "convex",
    destinationConfig: { deploymentName: DEPLOYMENT_NAME },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false, ...syncOptions },
    connection: { credentials: { accessToken: "pat-token" } }
  }) as unknown as TConvexSyncWithCredentials;

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

const axiosError = (status: number, message: string) => {
  const error = new AxiosError(`Request failed with status code ${status}`);
  error.response = {
    status,
    data: { code: "Code", message },
    statusText: "",
    headers: {},
    config: { headers: {} as never }
  };
  return error;
};

const stubConvex = (
  environmentVariables: Record<string, string>,
  deployment: { kind?: string; deploymentUrl?: string } = { kind: "cloud", deploymentUrl: DEPLOYMENT_URL }
) => {
  get.mockImplementation(async (url: string) => {
    if (url === DEPLOYMENT_LOOKUP_URL) return { data: { name: DEPLOYMENT_NAME, ...deployment } };
    if (url === LIST_URL) return { data: { environmentVariables } };
    throw new Error(`unexpected GET ${url}`);
  });
};

describe("ConvexSyncFns", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    post.mockResolvedValue({ data: {} });
    stubConvex({});
  });

  it("writes every secret in one batch, empty values included, to the URL Convex reports", async () => {
    await ConvexSyncFns.syncSecrets(
      syncWith({ disableSecretDeletion: true }),
      payloadOf({ API_KEY: "key", CLEARED: "", CONVEX_FEATURE_FLAG: "on" })
    );

    expect(get).toHaveBeenCalledWith(DEPLOYMENT_LOOKUP_URL, {
      headers: { Authorization: "Bearer pat-token", Accept: "application/json" }
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith(
      UPDATE_URL,
      {
        changes: [
          { name: "API_KEY", value: "key" },
          { name: "CLEARED", value: "" },
          { name: "CONVEX_FEATURE_FLAG", value: "on" }
        ]
      },
      DEPLOYMENT_HEADERS
    );
  });

  it("deletes stale variables that match the key schema in the same batch", async () => {
    stubConvex({ INF_API_KEY: "old", INF_STALE: "stale", OTHER: "keep" });

    await ConvexSyncFns.syncSecrets(syncWith({ keySchema: "INF_{{secretKey}}" }), payloadOf({ INF_API_KEY: "new" }));

    expect(post).toHaveBeenCalledWith(
      UPDATE_URL,
      {
        changes: [
          { name: "INF_API_KEY", value: "new" },
          { name: "INF_STALE", value: null }
        ]
      },
      DEPLOYMENT_HEADERS
    );
  });

  it("deletes nothing when secret deletion is disabled", async () => {
    stubConvex({ STALE: "stale" });

    await ConvexSyncFns.syncSecrets(syncWith({ disableSecretDeletion: true }), payloadOf({ API_KEY: "key" }));

    expect(post).toHaveBeenCalledWith(UPDATE_URL, { changes: [{ name: "API_KEY", value: "key" }] }, DEPLOYMENT_HEADERS);
  });

  it("sends only values that differ, and nothing when the deployment is up to date", async () => {
    stubConvex({ SAME: "same", CHANGED: "old", EMPTY: "" });

    await ConvexSyncFns.syncSecrets(syncWith(), payloadOf({ SAME: "same", CHANGED: "new", EMPTY: "" }));
    expect(post).toHaveBeenCalledWith(UPDATE_URL, { changes: [{ name: "CHANGED", value: "new" }] }, DEPLOYMENT_HEADERS);

    post.mockClear();
    await ConvexSyncFns.syncSecrets(syncWith(), payloadOf({ SAME: "same", CHANGED: "old", EMPTY: "" }));
    expect(post).not.toHaveBeenCalled();
  });

  it("refuses invalid and built-in names before contacting Convex", async () => {
    const error = await ConvexSyncFns.syncSecrets(
      syncWith(),
      payloadOf({
        "BAD-NAME": "x",
        "1STARTS_WITH_DIGIT": "x",
        CONVEX_CLOUD_URL: "x",
        [`A${"B".repeat(256)}`]: "x",
        GOOD: "x"
      })
    ).catch((err: unknown) => err);

    expect(error).toMatchObject({ shouldRetry: false, secretKey: "BAD-NAME" });
    expect((error as Error).message).toContain("4 secret keys are not a valid Convex environment variable name");
    expect((error as Error).message).toContain("CONVEX_CLOUD_URL");
    expect(get).not.toHaveBeenCalled();
    expect(post).not.toHaveBeenCalled();
  });

  it("does not retry a request Convex refuses", async () => {
    post.mockRejectedValue(axiosError(400, "The environment variable limit (512) has been met."));

    await expect(
      ConvexSyncFns.syncSecrets(syncWith({ disableSecretDeletion: true }), payloadOf({ API_KEY: "key" }))
    ).rejects.toMatchObject({
      shouldRetry: false,
      message: "Failed to update Convex environment variables: The environment variable limit (512) has been met."
    });
  });

  it("retries when Convex fails on its side", async () => {
    post.mockRejectedValue(axiosError(503, "Service unavailable"));

    await expect(
      ConvexSyncFns.syncSecrets(syncWith({ disableSecretDeletion: true }), payloadOf({ API_KEY: "key" }))
    ).rejects.toMatchObject({ shouldRetry: true });
  });

  it("fails without retrying when the deployment is unknown or has no URL", async () => {
    get.mockRejectedValueOnce(axiosError(404, "Deployment not found"));
    await expect(ConvexSyncFns.syncSecrets(syncWith(), payloadOf({ API_KEY: "key" }))).rejects.toMatchObject({
      shouldRetry: false,
      message: `Failed to find Convex deployment '${DEPLOYMENT_NAME}': Deployment not found`
    });

    stubConvex({}, { kind: "local" });
    await expect(ConvexSyncFns.syncSecrets(syncWith(), payloadOf({ API_KEY: "key" }))).rejects.toMatchObject({
      shouldRetry: false
    });
    expect(post).not.toHaveBeenCalled();
  });

  it("imports every variable on the deployment", async () => {
    stubConvex({ API_KEY: "key", EMPTY: "", CONVEX_FEATURE_FLAG: "on" });

    await expect(ConvexSyncFns.getSecrets(syncWith())).resolves.toEqual({
      API_KEY: { value: "key" },
      EMPTY: { value: "" },
      CONVEX_FEATURE_FLAG: { value: "on" }
    });
  });

  it("removes only the synced variables the deployment has", async () => {
    stubConvex({ API_KEY: "key", OTHER: "keep" });

    await ConvexSyncFns.removeSecrets(syncWith(), payloadOf({ API_KEY: "key", MISSING: "x", constructor: "x" }));

    expect(post).toHaveBeenCalledWith(UPDATE_URL, { changes: [{ name: "API_KEY", value: null }] }, DEPLOYMENT_HEADERS);
  });
});
