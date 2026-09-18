import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_platform" })
}));
vi.mock("@app/lib/config/request", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
  request: { get: (...args: unknown[]) => (getMock as any)(...args) }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

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
    vi.fn(async () => ({ credentials: { accountId: "acct_123" } })) as any
  );

describe("stripeConnectionService.listApiKeys", () => {
  beforeEach(() => getMock.mockReset());

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

  it("never sends the platform credential to a next_page_url outside the Stripe API keys endpoint", async () => {
    getMock.mockResolvedValueOnce(keyPage("mk_1", "https://evil.example.com/v2/iam/api_keys?page=2"));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    const keys = await makeService().listApiKeys("connection-id", {} as any);

    expect(keys.map((key) => key.id)).toEqual(["mk_1"]);
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("authorizes the caller for this connection before reaching Stripe", async () => {
    getMock.mockResolvedValueOnce(keyPage("mk_1"));
    const getAppConnection = vi.fn(async () => ({ credentials: { accountId: "acct_123" } }));
    const actor = { type: "user", id: "user-1", authMethod: "email", orgId: "org-1" };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-argument
    await stripeConnectionService(getAppConnection as any).listApiKeys("connection-id", actor as any);

    expect(getAppConnection).toHaveBeenCalledWith(AppConnection.Stripe, "connection-id", actor);
  });
});
