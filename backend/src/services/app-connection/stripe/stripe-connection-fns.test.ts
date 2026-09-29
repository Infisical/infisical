import { AxiosError } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { postMock, decryptMock, encryptMock } = vi.hoisted(() => ({
  postMock: vi.fn<(url: string, body?: unknown, config?: unknown) => Promise<unknown>>(),
  decryptMock: vi.fn<() => Promise<unknown>>(),
  encryptMock: vi.fn(async ({ credentials }: { credentials: unknown }) => ({ encrypted: credentials }))
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({
    INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_app",
    WHITELISTED_STRIPE_APP_CONNECTION_ORG_IDS: ["org-id"]
  })
}));
vi.mock("@app/lib/config/request", () => ({
  request: { post: postMock, get: vi.fn() }
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({
  decryptAppConnectionCredentials: decryptMock,
  encryptAppConnectionCredentials: encryptMock
}));

// eslint-disable-next-line import/first
import { AppConnection } from "../app-connection-enums";
// eslint-disable-next-line import/first
import { assertStripeConnectionAuthorized, validateStripeConnectionCredentials } from "./stripe-connection-fns";

type TStored = { accountId: string; refreshToken: string };

const TX = { primary: true };

// Stands in for the connection row: decrypt reads it, and encrypt + updateById write it back, so a
// refresh that follows another sees the token that one stored.
let stored: TStored;

const appConnectionDAL = {
  findById: vi.fn(async (...args: [string, unknown?]) => ({
    id: args[0],
    app: AppConnection.Stripe,
    orgId: "org-id",
    projectId: null,
    encryptedCredentials: Buffer.from("")
  })),
  updateById: vi.fn(async () => ({})),
  transaction: vi.fn(async <T>(fn: (tx: unknown) => Promise<T>) => fn(TX))
};

/** A single mutex per resource, which is the contract redlock gives across pods. */
const makeKeyStore = () => {
  let tail = Promise.resolve();
  const release = vi.fn();

  return {
    release,
    acquireLock: vi.fn(async () => {
      let unlock!: () => void;
      const previous = tail;
      tail = new Promise<void>((resolve) => {
        unlock = resolve;
      });
      await previous;
      return {
        release: async () => {
          release();
          unlock();
          return {} as never;
        }
      };
    })
  };
};

let keyStore: ReturnType<typeof makeKeyStore>;

const authorize = () =>
  assertStripeConnectionAuthorized("connection-id", {
    appConnectionDAL: appConnectionDAL as never,
    kmsService: {} as never,
    keyStore: keyStore as never
  });

const oauthError = (status: number, error: string, description: string) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: { error, error_description: description }
  });

const refreshed = (refreshToken: string, accountId = "acct_123") => ({
  data: { access_token: "rk_unused", refresh_token: refreshToken, account_id: accountId }
});

const sentRefreshToken = (call: number) => (postMock.mock.calls[call][1] as URLSearchParams).get("refresh_token");

describe("assertStripeConnectionAuthorized", () => {
  beforeEach(() => {
    stored = { accountId: "acct_123", refreshToken: "rt_1" };
    keyStore = makeKeyStore();
    postMock.mockReset();
    decryptMock.mockReset();
    decryptMock.mockImplementation(async () => ({ ...stored }));
    encryptMock.mockClear();
    encryptMock.mockImplementation(async ({ credentials }: { credentials: unknown }) => {
      stored = credentials as TStored;
      return { encrypted: credentials };
    });
    appConnectionDAL.findById.mockClear();
    appConnectionDAL.updateById.mockClear();
  });

  it("refreshes on every call with the app key as a bearer token and stores only the new refresh token", async () => {
    postMock.mockResolvedValueOnce(refreshed("rt_2")).mockResolvedValueOnce(refreshed("rt_3"));

    await authorize();
    await authorize();

    const config = postMock.mock.calls[0][2] as { headers: Record<string, string>; auth?: unknown };

    expect(config.headers.Authorization).toBe("Bearer sk_test_app");
    expect(config.auth).toBeUndefined();
    expect((postMock.mock.calls[0][1] as URLSearchParams).get("grant_type")).toBe("refresh_token");
    expect([sentRefreshToken(0), sentRefreshToken(1)]).toEqual(["rt_1", "rt_2"]);
    expect(stored).toEqual({ accountId: "acct_123", refreshToken: "rt_3" });
  });

  it("reads the stored token from the primary, not a replica that may hold a spent one", async () => {
    postMock.mockResolvedValue(refreshed("rt_2"));

    await authorize();

    expect(appConnectionDAL.findById).toHaveBeenCalledWith("connection-id", TX);
  });

  it("runs concurrent refreshes one at a time, so the second presents the token the first stored", async () => {
    let finishFirst!: () => void;
    postMock
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishFirst = () => resolve(refreshed("rt_2"));
          })
      )
      .mockResolvedValueOnce(refreshed("rt_3"));

    const first = authorize();
    const second = authorize();

    await vi.waitFor(() => expect(postMock).toHaveBeenCalledTimes(1));
    finishFirst();
    await Promise.all([first, second]);

    expect([sentRefreshToken(0), sentRefreshToken(1)]).toEqual(["rt_1", "rt_2"]);
    expect(stored.refreshToken).toBe("rt_3");
  });

  it("asks for a reinstall when the refresh token was revoked, without echoing Stripe's description", async () => {
    postMock.mockRejectedValue(oauthError(400, "invalid_grant", "Refresh token does not exist: rt_1"));

    const error = (await authorize().catch((e: Error) => e)) as Error;

    expect(error.message).toBe(
      "Infisical is no longer authorized on Stripe account 'acct_123'. This happens when the Infisical app is uninstalled from the Stripe account. Reinstall the app and reconnect this connection."
    );
    expect(error.message).not.toContain("rt_1");
    expect(appConnectionDAL.updateById).not.toHaveBeenCalled();
    expect(keyStore.release).toHaveBeenCalledTimes(1);
  });

  it("does not blame an uninstall for a Stripe outage", async () => {
    postMock.mockRejectedValue(oauthError(503, "api_error", "Service unavailable for rt_1"));

    await expect(authorize()).rejects.toThrow(
      "Infisical could not confirm its access to Stripe account 'acct_123' (status 503). Try again shortly."
    );
  });

  it("says the connection is busy when the refresh lock cannot be acquired", async () => {
    keyStore.acquireLock.mockRejectedValueOnce(new Error("lock timeout"));

    await expect(authorize()).rejects.toThrow("Another operation on this Stripe connection is still in progress");
    expect(postMock).not.toHaveBeenCalled();
  });

  it("refuses tokens Stripe issued for a different account", async () => {
    postMock.mockResolvedValue(refreshed("rt_other", "acct_other"));

    await expect(authorize()).rejects.toThrow(/bound to 'acct_123'/);
    expect(appConnectionDAL.updateById).not.toHaveBeenCalled();
  });

  it("names the stranded connection when the refreshed token cannot be saved", async () => {
    postMock.mockResolvedValue(refreshed("rt_2"));
    appConnectionDAL.updateById.mockRejectedValueOnce(new Error("connection terminated"));

    await expect(authorize()).rejects.toThrow(
      "Infisical refreshed its access to Stripe account 'acct_123' but could not save it. Reinstall the app and reconnect this connection."
    );
  });
});

describe("validateStripeConnectionCredentials", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("does not echo the rejected authorization code back to the user", async () => {
    postMock.mockRejectedValue(oauthError(400, "invalid_grant", "Authorization code does not exist: ac_secret"));

    const error = (await validateStripeConnectionCredentials({
      orgId: "org-id",
      credentials: { code: "ac_secret" }
    } as never).catch((e: Error) => e)) as Error;

    expect(error.message).toBe(
      "The Stripe authorization expired or was already used. Install the app from Stripe again to reconnect."
    );
    expect(error.message).not.toContain("ac_secret");
  });
});
