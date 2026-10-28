import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { IntegrationUrls } from "@app/services/integration-auth/integration-list";
import { SecretSyncError } from "@app/services/secret-sync/secret-sync-errors";
import { parseSyncErrorMessage } from "@app/services/secret-sync/secret-sync-fns";
import { TSecretSyncPayload } from "@app/services/secret-sync/secret-sync-payload";

import { DenoDeploySyncContext } from "./deno-deploy-sync-enums";
import { DenoDeploySyncFns } from "./deno-deploy-sync-fns";
import { DENO_DEPLOY_APP_ID_PATTERN } from "./deno-deploy-sync-schemas";
import { TDenoDeployApp, TDenoDeploySyncWithCredentials } from "./deno-deploy-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, patch } = vi.hoisted(() => ({ get: vi.fn(), patch: vi.fn() }));
vi.mock("@app/lib/config/request", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@app/lib/config/request")>();
  return {
    ...actual,
    request: { ...actual.request, get, patch }
  };
});

const sync = {
  destination: "deno-deploy",
  destinationConfig: {
    appId: "11111111-1111-1111-1111-111111111111",
    appSlug: "my-app",
    context: DenoDeploySyncContext.Production
  },
  environment: { slug: "prod" },
  syncOptions: { disableSecretDeletion: false },
  connection: { method: "access-token", credentials: { accessToken: "ddo_test-token" } }
} as unknown as TDenoDeploySyncWithCredentials;

const payloadOf = (entries: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(entries).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

const appWith = (envVars: TDenoDeployApp["env_vars"] = []): TDenoDeployApp => ({
  id: "11111111-1111-1111-1111-111111111111",
  slug: "my-app",
  env_vars: envVars
});

const denoError = (status: number, message: string) =>
  new AxiosError("bad request", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "Bad Request",
    headers: {},
    config: { headers: new AxiosHeaders() },
    data: { error: { code: "bad_request", message } }
  });

const patchEnvVars = () => (patch.mock.calls[0][1] as { env_vars: unknown[] }).env_vars;

describe("DenoDeploySyncFns", () => {
  beforeEach(() => {
    get.mockReset();
    patch.mockReset();
    get.mockResolvedValue({ data: appWith() });
    patch.mockResolvedValue({ data: appWith() });
  });

  it("upserts secrets as Deno Deploy secrets for the destination context", async () => {
    await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ API_KEY: "secret-value", EMPTY: "" }));

    expect(patchEnvVars()).toEqual([
      { key: "API_KEY", value: "secret-value", secret: true, contexts: [DenoDeploySyncContext.Production] }
    ]);
    expect(get).toHaveBeenCalledWith(
      `${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps/11111111-1111-1111-1111-111111111111`,
      expect.objectContaining({
        headers: { Authorization: "Bearer ddo_test-token", Accept: "application/json" }
      })
    );
  });

  it("deletes owned variables that left Infisical", async () => {
    get.mockResolvedValue({
      data: appWith([
        { id: "keep-id", key: "KEEP", secret: true, contexts: [DenoDeploySyncContext.Production] },
        { id: "gone-id", key: "GONE", secret: true, contexts: [DenoDeploySyncContext.Production] },
        { id: "preview-id", key: "PREVIEW_ONLY", secret: true, contexts: [DenoDeploySyncContext.Preview] }
      ])
    });

    await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ KEEP: "new-value" }));

    expect(patchEnvVars()).toEqual([
      { key: "KEEP", value: "new-value", secret: true, contexts: [DenoDeploySyncContext.Production] },
      { id: "gone-id", delete: true }
    ]);
  });

  it("deletes only owned variables that match the key prefix and suffix", async () => {
    get.mockResolvedValue({
      data: appWith([
        {
          id: "keep-id",
          key: "prod_KEEP_sfx",
          secret: true,
          contexts: [DenoDeploySyncContext.Production]
        },
        {
          id: "stale-id",
          key: "prod_STALE_sfx",
          secret: true,
          contexts: [DenoDeploySyncContext.Production]
        },
        {
          id: "foreign-id",
          key: "FOREIGN",
          secret: true,
          contexts: [DenoDeploySyncContext.Production]
        },
        {
          id: "prefix-only-id",
          key: "prod_OTHER",
          secret: true,
          contexts: [DenoDeploySyncContext.Production]
        }
      ])
    });

    await DenoDeploySyncFns.syncSecrets(
      {
        ...sync,
        syncOptions: { disableSecretDeletion: false, keySchema: "{{environment}}_{{secretKey}}_sfx" }
      } as TDenoDeploySyncWithCredentials,
      payloadOf({ prod_KEEP_sfx: "new-value" })
    );

    expect(patchEnvVars()).toEqual([
      {
        key: "prod_KEEP_sfx",
        value: "new-value",
        secret: true,
        contexts: [DenoDeploySyncContext.Production]
      },
      { id: "stale-id", delete: true }
    ]);
  });

  it("leaves owned variables in place when secret deletion is disabled", async () => {
    get.mockResolvedValue({
      data: appWith([{ id: "gone-id", key: "GONE", secret: true, contexts: [DenoDeploySyncContext.Production] }])
    });

    await DenoDeploySyncFns.syncSecrets(
      { ...sync, syncOptions: { disableSecretDeletion: true } } as TDenoDeploySyncWithCredentials,
      payloadOf({ KEEP: "value" })
    );

    expect(patchEnvVars()).toEqual([
      { key: "KEEP", value: "value", secret: true, contexts: [DenoDeploySyncContext.Production] }
    ]);
  });

  it("fails without retry when a variable already exists for overlapping contexts", async () => {
    get.mockResolvedValue({
      data: appWith([{ id: "all-id", key: "API_KEY", secret: true, contexts: DenoDeploySyncContext.All }])
    });

    const error = await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ API_KEY: "value" })).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect((error as SecretSyncError).secretKey).toBe("API_KEY");
    expect((error as SecretSyncError).message).toContain("overlapping contexts");
    expect(patch).not.toHaveBeenCalled();
  });

  it("fails without retry when a key has leading whitespace", async () => {
    const error = await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ " API_KEY": "value" })).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect(get).not.toHaveBeenCalled();
  });

  it("fails without retry when a key is not a valid Deno Deploy name", async () => {
    const error = await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ DENO_DIR: "value" })).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect((error as SecretSyncError).secretKey).toBe("DENO_DIR");
    expect((error as SecretSyncError).message).toContain("DENO_DIR");
    expect(get).not.toHaveBeenCalled();
    expect(patch).not.toHaveBeenCalled();
  });

  it("allows Deno runtime names on the Deno Deploy allowlist", async () => {
    await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ DENO_DEPLOY_TOKEN: "token-value" }));

    expect(patchEnvVars()).toEqual([
      {
        key: "DENO_DEPLOY_TOKEN",
        value: "token-value",
        secret: true,
        contexts: [DenoDeploySyncContext.Production]
      }
    ]);
  });

  it("writes the all context as Deno Deploy's all value", async () => {
    await DenoDeploySyncFns.syncSecrets(
      {
        ...sync,
        destinationConfig: { ...sync.destinationConfig, context: DenoDeploySyncContext.All }
      } as TDenoDeploySyncWithCredentials,
      payloadOf({ API_KEY: "value" })
    );

    expect(patchEnvVars()).toEqual([
      { key: "API_KEY", value: "value", secret: true, contexts: DenoDeploySyncContext.All }
    ]);
  });

  it("imports only unmasked variables for the destination context", async () => {
    get.mockResolvedValue({
      data: appWith([
        {
          id: "plain-id",
          key: "PLAIN",
          value: "visible",
          secret: false,
          contexts: [DenoDeploySyncContext.Production]
        },
        { id: "secret-id", key: "MASKED", secret: true, contexts: [DenoDeploySyncContext.Production] },
        {
          id: "preview-id",
          key: "PREVIEW",
          value: "other",
          secret: false,
          contexts: [DenoDeploySyncContext.Preview]
        }
      ])
    });

    await expect(DenoDeploySyncFns.getSecrets(sync)).resolves.toEqual({
      PLAIN: { value: "visible" }
    });
  });

  it("removeSecrets only deletes the synced keys in the destination context", async () => {
    get.mockResolvedValue({
      data: appWith([
        { id: "managed-id", key: "MANAGED", secret: true, contexts: [DenoDeploySyncContext.Production] },
        { id: "other-id", key: "OTHER", secret: true, contexts: [DenoDeploySyncContext.Production] },
        { id: "preview-id", key: "MANAGED", secret: true, contexts: [DenoDeploySyncContext.Preview] }
      ])
    });

    await DenoDeploySyncFns.removeSecrets(sync, payloadOf({ MANAGED: "value" }));

    expect(patchEnvVars()).toEqual([{ id: "managed-id", delete: true }]);
  });

  it("maps a missing app to a non-retryable error", async () => {
    get.mockRejectedValue(denoError(404, "App not found"));

    const error = await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ API_KEY: "value" })).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect((error as SecretSyncError).message).toContain("my-app");
    expect(patch).not.toHaveBeenCalled();
  });

  it("maps Deno Deploy 400 responses without retrying", async () => {
    patch.mockRejectedValue(denoError(400, "env var key is invalid"));

    const error = await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ API_KEY: "value" })).catch(
      (err: unknown) => err
    );

    expect(error).toMatchObject({
      shouldRetry: false,
      message: "env var key is invalid"
    });
  });

  it("encodes the app ID as a single path segment on GET and PATCH", async () => {
    const appId = "abc/../other?x=1";
    await DenoDeploySyncFns.syncSecrets(
      {
        ...sync,
        destinationConfig: { ...sync.destinationConfig, appId }
      } as TDenoDeploySyncWithCredentials,
      payloadOf({ API_KEY: "value" })
    );

    const expectedUrl = `${IntegrationUrls.DENO_DEPLOY_API_URL}/v2/apps/${encodeURIComponent(appId)}`;
    expect(get).toHaveBeenCalledWith(expectedUrl, expect.anything());
    expect(patch).toHaveBeenCalledWith(expectedUrl, expect.anything(), expect.anything());
  });

  it("maps a network failure to a Deno Deploy error message", async () => {
    get.mockRejectedValue(new AxiosError("Network Error"));

    const error = await DenoDeploySyncFns.syncSecrets(sync, payloadOf({ API_KEY: "value" })).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).message).toContain("Deno Deploy");
    expect(parseSyncErrorMessage(error)).toContain("Network Error");
    expect(parseSyncErrorMessage(error)).not.toBe("{}");
  });
});

describe("parseSyncErrorMessage", () => {
  it("falls back to the Axios message when a SecretSyncError has no response body", () => {
    const error = new SecretSyncError({ error: new AxiosError("Network Error") });

    expect(JSON.parse(parseSyncErrorMessage(error))).toEqual({
      message: "Network Error",
      error: "Network Error"
    });
  });
});

describe("DENO_DEPLOY_APP_ID_PATTERN", () => {
  it.each(["11111111-1111-1111-1111-111111111111", "app-1", "App_2"])("accepts %s", (appId) => {
    expect(DENO_DEPLOY_APP_ID_PATTERN.test(appId)).toBe(true);
  });

  it.each(["abc/def", "abc?x=1", "abc#frag", "abc other", "abc.def"])("rejects %s", (appId) => {
    expect(DENO_DEPLOY_APP_ID_PATTERN.test(appId)).toBe(false);
  });
});
