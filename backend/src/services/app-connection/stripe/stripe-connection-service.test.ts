import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, authorizeMock } = vi.hoisted(() => ({ getMock: vi.fn(), authorizeMock: vi.fn() }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_app" })
}));
vi.mock("@app/lib/config/request", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
  request: { get: (...args: unknown[]) => (getMock as any)(...args) }
}));
vi.mock("./stripe-connection-fns", () => ({
  assertStripeConnectionAuthorized: authorizeMock
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { stripeConnectionService } from "./stripe-connection-service";

const keyPage = (id: string, next?: string) => ({
  data: {
    data: [
      {
        id,
        name: `key-${id}`,
        status: "active",
        permissions: ["charge_read"],
        connect_permissions: [],
        // Stripe really does return this, in full, for every key.
        secret_key: { token: `rk_test_${id}_full_plaintext_secret`, secret_token_redacted: "rk_test_...ab12" }
      }
    ],
    next_page_url: next ?? null
  }
});

const makeService = () =>
  stripeConnectionService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    vi.fn(async () => ({ id: "connection-id", credentials: { accountId: "acct_123" } })) as any,
    {} as never
  );

describe("stripeConnectionService.listApiKeys", () => {
  beforeEach(() => {
    getMock.mockReset();
    authorizeMock.mockReset();
  });

  it("never returns the plaintext secret Stripe includes in every list item", async () => {
    getMock.mockResolvedValueOnce(keyPage("mk_1"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const keys = await makeService().listApiKeys("connection-id", {} as any);

    expect(keys).toEqual([
      {
        id: "mk_1",
        name: "key-mk_1",
        status: "active",
        permissions: ["charge_read"],
        connectPermissions: []
      }
    ]);
    expect(JSON.stringify(keys)).not.toContain("plaintext_secret");
    expect(JSON.stringify(keys)).not.toContain("secret_key");
  });

  it("follows next_page_url instead of returning only the first page", async () => {
    getMock
      .mockResolvedValueOnce(keyPage("mk_1", "https://api.stripe.com/v2/iam/api_keys?page=2"))
      .mockResolvedValueOnce(keyPage("mk_2"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const keys = await makeService().listApiKeys("connection-id", {} as any);

    expect(keys.map((key) => key.id)).toEqual(["mk_1", "mk_2"]);
    expect(getMock).toHaveBeenCalledTimes(2);
    expect(getMock.mock.calls[0][0]).toContain("limit=100");
    expect(getMock.mock.calls[1][0]).toBe("https://api.stripe.com/v2/iam/api_keys?page=2");
  });

  it("confirms the connection is still authorized before listing with the app key", async () => {
    getMock.mockResolvedValueOnce(keyPage("mk_1"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    await makeService().listApiKeys("connection-id", {} as any);

    const { headers } = getMock.mock.calls[0][1] as { headers: Record<string, string> };

    expect(authorizeMock.mock.invocationCallOrder[0]).toBeLessThan(getMock.mock.invocationCallOrder[0]);
    expect(headers.Authorization).toBe("Bearer sk_test_app");
    expect(headers["Stripe-Context"]).toBe("acct_123");
  });

  it("lists nothing once the app was uninstalled", async () => {
    authorizeMock.mockRejectedValueOnce(new Error("Infisical is no longer authorized"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    await expect(makeService().listApiKeys("connection-id", {} as any)).rejects.toThrow("no longer authorized");
    expect(getMock).not.toHaveBeenCalled();
  });

  it("never sends the app credential to a next_page_url outside the Stripe API keys endpoint", async () => {
    getMock.mockResolvedValueOnce(keyPage("mk_1", "https://evil.example.com/v2/iam/api_keys?page=2"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const keys = await makeService().listApiKeys("connection-id", {} as any);

    expect(keys.map((key) => key.id)).toEqual(["mk_1"]);
    expect(getMock).toHaveBeenCalledTimes(1);
  });
});
