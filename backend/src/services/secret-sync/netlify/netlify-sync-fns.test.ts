import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SecretSyncError } from "../secret-sync-errors";
import { TSecretSyncPayload } from "../secret-sync-payload";
import { NetlifySyncFns } from "./netlify-sync-fns";
import { TNetlifySyncWithCredentials } from "./netlify-sync-types";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({}) }));

const { getVariables, createVariable, updateVariableValue } = vi.hoisted(() => ({
  getVariables: vi.fn(),
  createVariable: vi.fn(),
  updateVariableValue: vi.fn()
}));
vi.mock("@app/services/app-connection/netlify/netlify-connection-public-client", () => ({
  NetlifyPublicAPI: { getVariables, createVariable, updateVariableValue }
}));

const sync = {
  destination: "netlify",
  destinationConfig: { accountId: "account-id", siteId: "site-id", context: "all" },
  environment: { slug: "prod" },
  syncOptions: { disableSecretDeletion: true },
  connection: { method: "access-token", credentials: { accessToken: "token" } }
} as unknown as TNetlifySyncWithCredentials;

const payloadOf = (keys: string[]) =>
  ({
    flatten: () => Object.fromEntries(keys.map((key) => [key, { value: `${key}-value` }]))
  }) as unknown as TSecretSyncPayload;

const axiosErrorWithStatus = (status: number) =>
  new AxiosError("Request failed", undefined, undefined, undefined, {
    status,
    data: { message: "rejected" }
  } as AxiosResponse);

describe("NetlifySyncFns.syncSecrets", () => {
  beforeEach(() => {
    getVariables.mockReset();
    createVariable.mockReset();
    updateVariableValue.mockReset();
    getVariables.mockResolvedValue([{ key: "EXISTING", values: [] }]);
  });

  it("fails without retry when listing variables is rejected with 400", async () => {
    getVariables.mockRejectedValue(axiosErrorWithStatus(400));

    const error = await NetlifySyncFns.syncSecrets(sync, payloadOf(["NEW"])).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect((error as SecretSyncError).secretKey).toBeUndefined();
  });

  it("fails without retry when Netlify rejects a new variable with 400", async () => {
    createVariable.mockRejectedValue(axiosErrorWithStatus(400));

    const error = await NetlifySyncFns.syncSecrets(sync, payloadOf(["NEW"])).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect((error as SecretSyncError).secretKey).toBe("NEW");
  });

  it("fails without retry when Netlify rejects an updated variable with 400", async () => {
    updateVariableValue.mockRejectedValue(axiosErrorWithStatus(400));

    const error = await NetlifySyncFns.syncSecrets(sync, payloadOf(["EXISTING"])).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(false);
    expect((error as SecretSyncError).secretKey).toBe("EXISTING");
  });

  it("keeps retrying when Netlify fails with a server error", async () => {
    createVariable.mockRejectedValue(axiosErrorWithStatus(500));

    const error = await NetlifySyncFns.syncSecrets(sync, payloadOf(["NEW"])).catch((err: unknown) => err);

    expect(error).toBeInstanceOf(SecretSyncError);
    expect((error as SecretSyncError).shouldRetry).toBe(true);
  });
});
