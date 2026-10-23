import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretSyncPayload } from "../secret-sync-payload";
import { CloudflarePagesVariableType } from "./cloudflare-pages-constants";
import { CloudflarePagesSyncFns } from "./cloudflare-pages-fns";
import { TCloudflarePagesSyncWithCredentials } from "./cloudflare-pages-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { get, patch } = vi.hoisted(() => ({
  get: vi.fn(),
  patch: vi.fn().mockResolvedValue({})
}));
vi.mock("@app/lib/config/request", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  request: { get, patch }
}));

const syncWith = (variableType?: CloudflarePagesVariableType) =>
  ({
    destination: "cloudflare-pages",
    destinationConfig: { projectName: "my-site", environment: "production", variableType },
    environment: { slug: "prod" },
    syncOptions: { disableSecretDeletion: false },
    connection: { credentials: { apiToken: "token", accountId: "account-id" } }
  }) as unknown as TCloudflarePagesSyncWithCredentials;

const payloadOf = (secrets: Record<string, string>) =>
  ({
    flatten: () => Object.fromEntries(Object.entries(secrets).map(([key, value]) => [key, { value }]))
  }) as unknown as TSecretSyncPayload;

describe("CloudflarePagesSyncFns", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes text variables and deletes only stale text variables", async () => {
    get.mockResolvedValue({
      data: {
        result: {
          deployment_configs: {
            production: {
              env_vars: {
                STALE_TEXT: { type: "plain_text", value: "old" },
                OTHER_SECRET: { type: "secret_text", value: "" }
              }
            }
          }
        }
      }
    });

    await CloudflarePagesSyncFns.syncSecrets(
      syncWith(CloudflarePagesVariableType.Text),
      payloadOf({ API_URL: "https://api.example.com" })
    );

    expect(patch).toHaveBeenCalledWith(
      expect.stringMatching(/\/pages\/projects\/my-site$/),
      {
        deployment_configs: {
          production: {
            env_vars: {
              API_URL: { type: "plain_text", value: "https://api.example.com" },
              STALE_TEXT: null
            }
          }
        }
      },
      expect.anything()
    );
  });

  it("fails before writing when a key exists as the other type", async () => {
    get.mockResolvedValue({
      data: {
        result: { deployment_configs: { production: { env_vars: { API_KEY: { type: "secret_text", value: "" } } } } }
      }
    });

    await expect(
      CloudflarePagesSyncFns.syncSecrets(syncWith(CloudflarePagesVariableType.Text), payloadOf({ API_KEY: "key" }))
    ).rejects.toThrow("already exist in the Cloudflare Pages environment as a different type: API_KEY (secret).");

    expect(patch).not.toHaveBeenCalled();
  });

  it("skips keys of the other type on a sync with no saved type", async () => {
    get.mockResolvedValue({
      data: {
        result: {
          deployment_configs: {
            production: {
              env_vars: {
                API_URL: { type: "plain_text", value: "old" },
                OTHER_TEXT: { type: "plain_text", value: "old" },
                STALE_SECRET: { type: "secret_text", value: "" }
              }
            }
          }
        }
      }
    });

    await CloudflarePagesSyncFns.syncSecrets(syncWith(), payloadOf({ API_URL: "new", API_KEY: "key" }));

    expect(patch).toHaveBeenCalledWith(
      expect.stringMatching(/\/pages\/projects\/my-site$/),
      {
        deployment_configs: {
          production: {
            env_vars: {
              API_KEY: { type: "secret_text", value: "key" },
              STALE_SECRET: null
            }
          }
        }
      },
      expect.anything()
    );
  });
});
