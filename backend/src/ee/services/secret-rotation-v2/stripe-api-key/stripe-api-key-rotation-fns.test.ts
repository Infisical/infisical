/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument */
import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock } = vi.hoisted(() => ({ getMock: vi.fn(), postMock: vi.fn() }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_platform" })
}));
vi.mock("@app/lib/config/request", () => ({
  request: {
    get: (...args: unknown[]) => (getMock as any)(...args),
    post: (...args: unknown[]) => (postMock as any)(...args)
  }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { stripeApiKeyRotationFactory } from "./stripe-api-key-rotation-fns";

const httpError = (status: number, message = "boom") =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as any,
    data: { error: { message } }
  });

const makeFactory = () =>
  stripeApiKeyRotationFactory(
    {
      connection: { id: "connection-id", credentials: { accountId: "acct_123" } },
      parameters: { permissions: ["customer_read"], connectPermissions: [] },
      secretsMapping: { apiKey: "STRIPE_API_KEY" }
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any
  );

const isCreate = (url: string) => url.endsWith("/v2/iam/api_keys");
const isExpire = (url: string) => url.endsWith("/expire");
const expireCalls = (keyId?: string) =>
  postMock.mock.calls.filter(([url]) => isExpire(url) && (keyId === undefined || url.includes(`/${keyId}/expire`)));

/** Test mode returns the secret in plaintext, which is the shape the sandbox produces. */
const mockStripe = ({
  createIds = ["mk_new"],
  expire = async () => ({ data: {} })
}: { createIds?: string[]; expire?: (keyId: string) => Promise<unknown> } = {}) => {
  const ids = [...createIds];
  postMock.mockImplementation(async (url: string) => {
    if (isCreate(url)) {
      const id = ids.shift() ?? "mk_extra";
      return { data: { id, secret_key: { token: `rk_test_${id}` } } };
    }
    if (isExpire(url)) return expire(url.split("/").slice(-2)[0]);
    throw new Error(`unexpected request to ${url}`);
  });
};

describe("stripeApiKeyRotationFactory", () => {
  beforeEach(() => {
    getMock.mockReset();
    postMock.mockReset();
  });

  it("mints a key and hands the plaintext secret to the callback", async () => {
    mockStripe();
    const callback = vi.fn(async (credentials: unknown) => credentials);

    const result = await makeFactory().issueCredentials(callback as any);

    expect(result).toEqual({ keyId: "mk_new", apiKey: "rk_test_mk_new" });
    const [, body] = postMock.mock.calls.find(([url]) => isCreate(url))!;
    expect(body.type).toBe("secret_key");
    expect(body.permissions).toEqual(["customer_read"]);
    expect(body.public_key.pem_key.data).toContain("BEGIN PUBLIC KEY");
  });

  it("expires the new key when the create commit fails", async () => {
    mockStripe();
    const callback = vi.fn(async () => {
      throw new Error("conflicting secret");
    });

    await expect(makeFactory().issueCredentials(callback as any)).rejects.toThrow("conflicting secret");
    expect(expireCalls("mk_new")).toHaveLength(1);
  });

  it("expires the new key when reading the returned secret fails", async () => {
    postMock.mockImplementation(async (url: string) => {
      if (isCreate(url)) return { data: { id: "mk_new", secret_key: {} } };
      if (isExpire(url)) return { data: {} };
      throw new Error(`unexpected request to ${url}`);
    });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    await expect(makeFactory().issueCredentials(callback as any)).rejects.toThrow(
      "Stripe returned an API key without a secret"
    );

    expect(expireCalls("mk_new")).toHaveLength(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it("retires the previous key before committing the new one", async () => {
    const order: string[] = [];
    postMock.mockImplementation(async (url: string) => {
      if (isCreate(url)) {
        order.push("create");
        return { data: { id: "mk_new", secret_key: { token: "rk_test_mk_new" } } };
      }
      if (isExpire(url)) {
        order.push(url.split("/").slice(-2)[0]);
        return { data: {} };
      }
      throw new Error(`unexpected request to ${url}`);
    });
    const callback = vi.fn(async (credentials: unknown) => {
      order.push("commit");
      return credentials;
    });

    await makeFactory().rotateCredentials({ keyId: "mk_old", apiKey: "rk_old" } as any, callback as any, {} as any);

    expect(order).toEqual(["create", "mk_old", "commit"]);
    expect(callback).toHaveBeenCalledWith({ keyId: "mk_new", apiKey: "rk_test_mk_new" });
  });

  it("cleans up the new key and fails when the retirement fails", async () => {
    mockStripe({
      expire: async (keyId) => {
        if (keyId === "mk_old") throw httpError(500, "Stripe is down");
        return { data: {} };
      }
    });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    await expect(
      makeFactory().rotateCredentials({ keyId: "mk_old" } as any, callback as any, {} as any)
    ).rejects.toThrow("Stripe is down");

    expect(expireCalls("mk_new")).toHaveLength(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it("names the stranded key when the cleanup also fails", async () => {
    mockStripe({
      expire: async () => {
        throw httpError(500, "Stripe is down");
      }
    });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    let caughtMessage = "";
    try {
      await makeFactory().rotateCredentials({ keyId: "mk_old" } as any, callback as any, {} as any);
    } catch (error) {
      caughtMessage = (error as Error).message;
    }

    expect(caughtMessage).toMatch(/mk_old/);
    expect(caughtMessage).toMatch(/mk_new/);
  });

  it("treats a 404 on expire as already gone", async () => {
    mockStripe({
      expire: async (keyId) => {
        if (keyId === "mk_old") throw httpError(404, "No such key");
        return { data: {} };
      }
    });
    const callback = vi.fn(async (credentials: unknown) => credentials);

    await expect(
      makeFactory().rotateCredentials({ keyId: "mk_old" } as any, callback as any, {} as any)
    ).resolves.toBeDefined();
  });

  it("revokeCredentials returns early without contacting Stripe when there are no credentials", async () => {
    const callback = vi.fn(async () => "done");

    const result = await makeFactory().revokeCredentials([] as any, callback as any);

    expect(result).toBe("done");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("revokeCredentials expires every key it is given", async () => {
    mockStripe();
    const callback = vi.fn(async () => "done");

    const result = await makeFactory().revokeCredentials(
      [
        { keyId: "mk_one", apiKey: "rk_one" },
        { keyId: "mk_two", apiKey: "rk_two" }
      ] as any,
      callback as any
    );

    expect(expireCalls("mk_one")).toHaveLength(1);
    expect(expireCalls("mk_two")).toHaveLength(1);
    expect(result).toBe("done");
  });

  it("revokeCredentials stops at the first failure and never calls back", async () => {
    mockStripe({
      expire: async (keyId) => {
        if (keyId === "mk_two") throw httpError(500, "Stripe is down");
        return { data: {} };
      }
    });
    const callback = vi.fn(async () => "done");

    await expect(
      makeFactory().revokeCredentials(
        [
          { keyId: "mk_one", apiKey: "rk_one" },
          { keyId: "mk_two", apiKey: "rk_two" }
        ] as any,
        callback as any
      )
    ).rejects.toThrow("Stripe is down");

    expect(expireCalls("mk_one")).toHaveLength(1);
    expect(expireCalls("mk_two")).toHaveLength(1);
    expect(callback).not.toHaveBeenCalled();
  });

  it("maps only the API key into the secrets payload", () => {
    expect(makeFactory().getSecretsPayload({ keyId: "mk_new", apiKey: "rk_test" } as any)).toEqual([
      { key: "STRIPE_API_KEY", value: "rk_test" }
    ]);
  });

  it("treats 403 as a live key and 401 as a dead one", async () => {
    getMock.mockRejectedValueOnce(httpError(403, "Insufficient permissions"));
    await expect(
      makeFactory().checkActiveCredentials!({ keyId: "mk", apiKey: "rk_test" } as any)
    ).resolves.toBeUndefined();

    getMock.mockRejectedValueOnce(httpError(401, "Invalid API Key"));
    await expect(makeFactory().checkActiveCredentials!({ keyId: "mk", apiKey: "rk_test" } as any)).rejects.toThrow(
      "Invalid API Key"
    );
  });
});
