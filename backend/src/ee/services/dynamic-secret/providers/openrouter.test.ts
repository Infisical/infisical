import { AxiosError, AxiosResponse } from "axios";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";

import { OpenRouterLimitReset } from "./models";
import { OpenRouterProvider } from "./openrouter";

const { mockedGet, mockedPost, mockedDelete } = vi.hoisted(() => ({
  mockedGet: vi.fn<(url: string, config: { headers: { Authorization: string } }) => Promise<unknown>>(),
  mockedPost: vi.fn<(url: string, body: Record<string, unknown>, config: { headers: object }) => Promise<unknown>>(),
  mockedDelete: vi.fn<(url: string, config: { headers: object }) => Promise<unknown>>()
}));

vi.mock("@app/lib/config/request", () => ({ request: { get: mockedGet, post: mockedPost, delete: mockedDelete } }));

const MANAGEMENT_KEY = "sk-or-v1-management-key-value";

const inputs = {
  managementKey: MANAGEMENT_KEY,
  workspaceId: "0df9e665-d932-5740-b2c7-b52af166bc11",
  limit: "2.5",
  limitReset: OpenRouterLimitReset.Daily,
  includeByokInLimit: true
};

const createArgs = (expireAt: number, usernameTemplate?: string) => ({
  inputs,
  expireAt,
  usernameTemplate,
  identity: { name: "tester" },
  dynamicSecret: { name: "openrouter-prod", type: "openrouter" } as TDynamicSecrets,
  metadata: { projectId: "proj-1" }
});

const upstreamError = (status: number, data: unknown) =>
  new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    data,
    statusText: "",
    headers: {},
    config: {} as never
  });

describe("OpenRouterProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("create sends the key settings and the lease expiry, and returns the key and its hash", async () => {
    mockedPost.mockResolvedValueOnce({ data: { key: "sk-or-v1-leased", data: { hash: "hash-1" } } } as AxiosResponse);
    const expireAt = Date.parse("2026-11-12T15:00:00.000Z");

    const result = await OpenRouterProvider().create(createArgs(expireAt));

    const [url, body, config] = mockedPost.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/keys");
    expect(body).toMatchObject({
      expires_at: "2026-11-12T15:00:00.000Z",
      workspace_id: inputs.workspaceId,
      limit: 2.5,
      limit_reset: "daily",
      include_byok_in_limit: true
    });
    expect(body.name).toMatch(/^infisical-[a-zA-Z0-9]{16}$/);
    expect(config.headers).toMatchObject({ Authorization: `Bearer ${MANAGEMENT_KEY}` });
    expect(config).toMatchObject({ "axios-retry": { retries: 0 } });
    expect(result).toEqual({
      entityId: "hash-1",
      data: { API_KEY: "sk-or-v1-leased", KEY_HASH: "hash-1", KEY_NAME: body.name }
    });
  });

  test("create leaves out the settings a user cleared", async () => {
    mockedPost.mockResolvedValueOnce({ data: { key: "sk-or-v1-leased", data: { hash: "hash-1" } } } as AxiosResponse);

    await OpenRouterProvider().create({
      ...createArgs(Date.now() + 60_000),
      inputs: { managementKey: MANAGEMENT_KEY, workspaceId: null, limit: null, limitReset: null }
    });

    const body = mockedPost.mock.calls[0][1];
    expect(body.workspace_id).toBeUndefined();
    expect(body.limit).toBeUndefined();
    expect(body.limit_reset).toBeUndefined();
  });

  test("create names the key from the username template", async () => {
    mockedPost.mockResolvedValueOnce({ data: { key: "sk-or-v1-leased", data: { hash: "hash-1" } } } as AxiosResponse);

    await OpenRouterProvider().create(createArgs(Date.now() + 60_000, "{{dynamicSecret.name}}-{{identity.name}}"));

    expect(mockedPost.mock.calls[0][1]).toMatchObject({ name: "openrouter-prod-tester" });
  });

  test("create surfaces the OpenRouter error without the management key", async () => {
    mockedPost.mockRejectedValueOnce(
      upstreamError(403, { error: { code: 403, message: `Key ${MANAGEMENT_KEY} is not a management key` } })
    );

    const promise = OpenRouterProvider().create(createArgs(Date.now() + 60_000));

    await expect(promise).rejects.toBeInstanceOf(BadRequestError);
    await expect(promise).rejects.toThrow(
      "Failed to create OpenRouter API key: Key [REDACTED] is not a management key"
    );
  });

  test("revoke deletes the key by its hash", async () => {
    mockedDelete.mockResolvedValueOnce({ data: { deleted: true } } as AxiosResponse);

    const result = await OpenRouterProvider().revoke(inputs, "hash-1", { projectId: "proj-1" });

    expect(mockedDelete.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/keys/hash-1");
    expect(result).toEqual({ entityId: "hash-1" });
  });

  test("revoke treats a key already deleted in OpenRouter as revoked", async () => {
    mockedDelete.mockRejectedValueOnce(upstreamError(404, { error: { code: 404, message: "Resource not found" } }));

    await expect(OpenRouterProvider().revoke(inputs, "hash-1", { projectId: "proj-1" })).resolves.toEqual({
      entityId: "hash-1"
    });
  });

  test("revoke fails on other OpenRouter errors so the lease is retried", async () => {
    mockedDelete.mockRejectedValueOnce(upstreamError(429, { error: { code: 429, message: "Rate limit exceeded" } }));

    await expect(OpenRouterProvider().revoke(inputs, "hash-1", { projectId: "proj-1" })).rejects.toThrow(
      "Failed to delete OpenRouter API key: Rate limit exceeded"
    );
  });
});

describe("OpenRouterProvider management key replacement", () => {
  const NEW_MANAGEMENT_KEY = "sk-or-v1-new-management-key-value";

  const mockAccounts = (accounts: Record<string, { organizationId?: string; userId?: string; status?: number }>) => {
    mockedGet.mockImplementation(async (url, config) => {
      const account = accounts[config.headers.Authorization.replace("Bearer ", "")];
      if (account.status)
        throw upstreamError(account.status, { error: { code: account.status, message: "Invalid API key" } });
      if (url.endsWith("/organization/settings")) {
        if (!account.organizationId) throw upstreamError(404, { error: { code: 404, message: "Not an organization" } });
        return { data: { data: { id: account.organizationId } } };
      }
      return { data: { data: { creator_user_id: account.userId } } };
    });
  };

  const replaceKey = () =>
    OpenRouterProvider().validateProviderInputs(
      { ...inputs, managementKey: NEW_MANAGEMENT_KEY },
      { projectId: "proj-1", previousInputs: inputs }
    );

  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("skips the organization check when the management key is unchanged", async () => {
    await OpenRouterProvider().validateProviderInputs(inputs, { projectId: "proj-1", previousInputs: inputs });

    expect(mockedGet).not.toHaveBeenCalled();
  });

  test("rejects a key change while the dynamic secret has active leases", async () => {
    await expect(
      OpenRouterProvider().validateProviderInputs(
        { ...inputs, managementKey: NEW_MANAGEMENT_KEY },
        { projectId: "proj-1", previousInputs: inputs, hasActiveLeases: true }
      )
    ).rejects.toThrow("The management key can't be changed while this dynamic secret has active leases");
    expect(mockedGet).not.toHaveBeenCalled();
  });

  test("allows other edits while the dynamic secret has active leases", async () => {
    await expect(
      OpenRouterProvider().validateProviderInputs(
        { ...inputs, limit: "5" },
        { projectId: "proj-1", previousInputs: inputs, hasActiveLeases: true }
      )
    ).resolves.toMatchObject({ limit: "5" });
  });

  test("accepts a key from the same organization", async () => {
    mockAccounts({
      [MANAGEMENT_KEY]: { organizationId: "org_1", userId: "user_1" },
      [NEW_MANAGEMENT_KEY]: { organizationId: "org_1", userId: "user_2" }
    });

    await expect(replaceKey()).resolves.toMatchObject({ managementKey: NEW_MANAGEMENT_KEY });
  });

  test("rejects a key from another organization", async () => {
    mockAccounts({
      [MANAGEMENT_KEY]: { organizationId: "org_1" },
      [NEW_MANAGEMENT_KEY]: { organizationId: "org_2" }
    });

    await expect(replaceKey()).rejects.toThrow("belongs to a different OpenRouter organization");
  });

  test("compares the key creator for personal accounts", async () => {
    mockAccounts({ [MANAGEMENT_KEY]: { userId: "user_1" }, [NEW_MANAGEMENT_KEY]: { userId: "user_1" } });
    await expect(replaceKey()).resolves.toBeDefined();

    mockAccounts({ [MANAGEMENT_KEY]: { userId: "user_1" }, [NEW_MANAGEMENT_KEY]: { userId: "user_2" } });
    await expect(replaceKey()).rejects.toThrow("belongs to a different OpenRouter organization");
  });

  test("rejects a personal account key replacing an organization key", async () => {
    mockAccounts({ [MANAGEMENT_KEY]: { organizationId: "org_1" }, [NEW_MANAGEMENT_KEY]: { userId: "user_1" } });

    await expect(replaceKey()).rejects.toThrow("belongs to a different OpenRouter organization");
  });

  test("accepts any valid key when OpenRouter rejects the stored key", async () => {
    mockAccounts({ [MANAGEMENT_KEY]: { status: 401 }, [NEW_MANAGEMENT_KEY]: { organizationId: "org_2" } });

    await expect(replaceKey()).resolves.toBeDefined();
  });

  test("rejects an invalid replacement key without exposing it", async () => {
    mockAccounts({ [MANAGEMENT_KEY]: { organizationId: "org_1" }, [NEW_MANAGEMENT_KEY]: { status: 401 } });

    await expect(replaceKey()).rejects.toThrow("Failed to connect with OpenRouter: Invalid API key");
  });
});

describe("DynamicSecretOpenRouterSchema", () => {
  test.each(["0", "10", "2.5", " 3.75 "])("accepts the credit limit %j", async (limit) => {
    await expect(
      OpenRouterProvider().validateProviderInputs({ ...inputs, limit }, { projectId: "proj-1" })
    ).resolves.toBeDefined();
  });

  test.each(["", "-1", "abc", "1e3", "0x10", "1.", ".5"])("rejects the credit limit %j", async (limit) => {
    await expect(
      OpenRouterProvider().validateProviderInputs({ ...inputs, limit }, { projectId: "proj-1" })
    ).rejects.toThrow("Credit limit must be a non-negative number");
  });

  test("accepts null for the settings an edit clears", async () => {
    await expect(
      OpenRouterProvider().validateProviderInputs(
        { ...inputs, workspaceId: null, limit: null, limitReset: null },
        { projectId: "proj-1" }
      )
    ).resolves.toMatchObject({ workspaceId: null, limit: null, limitReset: null });
  });

  test("rejects a numeric credit limit", async () => {
    await expect(
      OpenRouterProvider().validateProviderInputs({ ...inputs, limit: 2.5 }, { projectId: "proj-1" })
    ).rejects.toThrow();
  });
});
