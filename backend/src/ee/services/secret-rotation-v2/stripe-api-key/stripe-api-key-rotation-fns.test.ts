import { AxiosError } from "axios";
import RE2 from "re2";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TSecretRotationV2Raw } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";

const { getMock, postMock, authorizeMock } = vi.hoisted(() => ({
  getMock: vi.fn<(url: string, config?: unknown) => Promise<unknown>>(),
  postMock: vi.fn<(url: string, body?: unknown, config?: unknown) => Promise<unknown>>(),
  authorizeMock: vi.fn<(connectionId: string) => Promise<void>>()
}));

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({ INF_APP_CONNECTION_STRIPE_SECRET_KEY: "sk_test_app" })
}));
vi.mock("@app/lib/config/request", () => ({
  request: { get: getMock, post: postMock }
}));
vi.mock("@app/services/app-connection/stripe/stripe-connection-fns", () => ({
  assertStripeConnectionAuthorized: authorizeMock
}));
vi.mock("@app/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

// eslint-disable-next-line import/first
import { stripeApiKeyRotationFactory } from "./stripe-api-key-rotation-fns";
// eslint-disable-next-line import/first
import {
  TStripeApiKeyRotationGeneratedCredentials,
  TStripeApiKeyRotationWithConnection
} from "./stripe-api-key-rotation-types";

type TCredential = TStripeApiKeyRotationGeneratedCredentials[number];

type TCreateKeyRequest = {
  type: string;
  name: string;
  permissions: string[];
  public_key: { pem_key: { data: string } };
};

const OLD_KEY: TCredential = { keyId: "mk_old", apiKey: "rk_old" };
const NEW_KEY: TCredential = { keyId: "mk_new", apiKey: "rk_test_mk_new" };

/** The rotation service hands the factory a transaction body; this stands in for its return. */
const COMMITTED = "committed" as unknown as TSecretRotationV2Raw;

// The factory hands appConnectionDAL, kmsService and keyStore to the authorization check, which is
// mocked, so none of these are reached.
const UNUSED_DEPENDENCIES = [{}, {}, {}, {}, {}] as unknown as [
  Parameters<typeof stripeApiKeyRotationFactory>[1],
  Parameters<typeof stripeApiKeyRotationFactory>[2],
  Parameters<typeof stripeApiKeyRotationFactory>[3],
  Parameters<typeof stripeApiKeyRotationFactory>[4],
  Parameters<typeof stripeApiKeyRotationFactory>[5]
];

// The factory reads these four fields of the rotation row and nothing else, so the rest of the row
// is left off rather than filled with placeholders that would read as though they mattered.
const rotation = (activeIndex: number, keyName?: string) =>
  ({
    connection: { id: "connection-id", credentials: { accountId: "acct_123" } },
    parameters: { permissions: ["customer_read"], keyName },
    secretsMapping: { apiKey: "STRIPE_API_KEY" },
    activeIndex
  }) as unknown as TStripeApiKeyRotationWithConnection;

const makeFactory = ({ activeIndex = 0, keyName }: { activeIndex?: number; keyName?: string } = {}) =>
  stripeApiKeyRotationFactory(rotation(activeIndex, keyName), ...UNUSED_DEPENDENCIES);

const isCreate = (url: string) => url.endsWith("/v2/iam/api_keys");
const isExpire = (url: string) => url.endsWith("/expire");
const expiredKeyId = (url: string) => url.split("/").slice(-2)[0];

/** Every Stripe round trip and every commit, in the order they happened. */
let calls: string[] = [];
let createBody: TCreateKeyRequest | undefined;

/**
 * Test mode returns the secret in plaintext, which is the shape the sandbox produces, so `omitSecret`
 * is how a response the read path rejects is produced.
 */
const mockStripe = ({
  createIds = ["mk_new"],
  expire,
  omitSecret = false
}: {
  createIds?: string[];
  /** Throw to fail the expire of the named key; return to expire it. */
  expire?: (keyId: string) => Promise<void>;
  omitSecret?: boolean;
} = {}) => {
  const ids = [...createIds];

  postMock.mockImplementation(async (url, body) => {
    if (isCreate(url)) {
      const id = ids.shift() ?? "mk_extra";
      calls.push("create");
      createBody = body as TCreateKeyRequest;
      return { data: { id, secret_key: omitSecret ? {} : { token: `rk_test_${id}` } } };
    }

    if (isExpire(url)) {
      const keyId = expiredKeyId(url);
      calls.push(`expire:${keyId}`);
      await expire?.(keyId);
      return { data: {} };
    }

    throw new Error(`unexpected POST ${url}`);
  });
};

/** The existence check the factory falls back to when an expire fails with something other than 404. */
const mockKeyLookup = (lookup: (keyId: string) => Promise<void>) => {
  getMock.mockImplementation(async (url) => {
    const keyId = url.split("/").pop()!;
    calls.push(`lookup:${keyId}`);
    await lookup(keyId);
    return { data: { id: keyId } };
  });
};

const httpError = (status: number, message: string) =>
  new AxiosError("Request failed", "ERR_BAD_REQUEST", undefined, undefined, {
    status,
    statusText: "",
    headers: {},
    config: {} as never,
    data: { error: { message } }
  });

const failsWith = (status: number, message: string, keyId: string) => async (expiredKey: string) => {
  if (expiredKey === keyId) throw httpError(status, message);
};

const commit = vi.fn(async (credentials: TCredential) => {
  calls.push("commit");
  return credentials as unknown as TSecretRotationV2Raw;
});

const commitWithoutCredentials = vi.fn(async () => {
  calls.push("commit");
  return COMMITTED;
});

describe("stripeApiKeyRotationFactory", () => {
  beforeEach(() => {
    calls = [];
    createBody = undefined;
    getMock.mockReset();
    postMock.mockReset();
    authorizeMock.mockReset();
    authorizeMock.mockResolvedValue(undefined);
    commit.mockClear();
    commitWithoutCredentials.mockClear();
  });

  describe("issueCredentials", () => {
    it("mints a key and hands the plaintext secret to the callback", async () => {
      mockStripe();

      const result = await makeFactory().issueCredentials(commit);

      expect(result).toEqual(NEW_KEY);
      expect(createBody?.type).toBe("secret_key");
      expect(createBody?.permissions).toEqual(["customer_read"]);
      expect(createBody?.public_key.pem_key.data).toContain("BEGIN PUBLIC KEY");
    });

    // The old and new key are both live after a rotation, so a fixed name alone would leave two keys
    // in the Stripe dashboard that cannot be told apart.
    it.each([
      { source: "the default name", keyName: undefined, expected: "^infisical-managed-[0-9]{13}$" },
      { source: "the configured key name", keyName: "payments-service", expected: "^payments-service-[0-9]{13}$" }
    ])("names the key after $source with a timestamp suffix", async ({ keyName, expected }) => {
      mockStripe();

      await makeFactory({ keyName }).issueCredentials(commit);

      const name = createBody?.name ?? "";
      expect(new RE2(expected).test(name), `expected ${expected}, got "${name}"`).toBe(true);
    });

    it("confirms the connection is still authorized before acting on the account with the app key", async () => {
      mockStripe();

      await makeFactory().issueCredentials(commit);

      const { headers } = postMock.mock.calls[0][2] as { headers: Record<string, string> };

      expect(authorizeMock).toHaveBeenCalledWith("connection-id", {
        appConnectionDAL: {},
        kmsService: {},
        keyStore: {}
      });
      expect(authorizeMock.mock.invocationCallOrder[0]).toBeLessThan(postMock.mock.invocationCallOrder[0]);
      expect(headers.Authorization).toBe("Bearer sk_test_app");
      expect(headers["Stripe-Context"]).toBe("acct_123");
    });

    it.each([
      { operation: "issue", run: () => makeFactory().issueCredentials(commit) },
      { operation: "rotate", run: () => makeFactory().rotateCredentials(OLD_KEY, commit, OLD_KEY) },
      { operation: "revoke", run: () => makeFactory().revokeCredentials([OLD_KEY], commitWithoutCredentials) }
    ])("does not touch Stripe keys on $operation once the app was uninstalled", async ({ run }) => {
      mockStripe();
      authorizeMock.mockRejectedValue(new Error("Infisical is no longer authorized"));

      await expect(run()).rejects.toThrow("Infisical is no longer authorized");
      expect(calls).toEqual([]);
    });

    // The key exists in Stripe before the row does, so both failure points after create have to
    // take it with them.
    it.each([
      {
        failure: "the commit fails",
        omitSecret: false,
        callback: async () => {
          throw new Error("conflicting secret");
        },
        message: "conflicting secret"
      },
      {
        failure: "reading the returned secret fails",
        omitSecret: true,
        callback: commit,
        message: "Stripe returned an API key without a secret"
      }
    ])("expires the new key when $failure", async ({ omitSecret, callback, message }) => {
      mockStripe({ omitSecret });

      await expect(makeFactory().issueCredentials(callback)).rejects.toThrow(message);

      expect(calls).toEqual(["create", "expire:mk_new"]);
      expect(commit).not.toHaveBeenCalled();
    });
  });

  describe("rotateCredentials", () => {
    it("retires the previous key before committing the new one, and issues no GET", async () => {
      mockStripe();

      await makeFactory().rotateCredentials(OLD_KEY, commit, OLD_KEY);

      expect(calls).toEqual(["create", "expire:mk_old", "commit"]);
      expect(commit).toHaveBeenCalledWith(NEW_KEY);
      expect(getMock).not.toHaveBeenCalled();
    });

    it("cleans up the new key and fails when retiring the previous one fails", async () => {
      mockStripe({ expire: failsWith(500, "Stripe is down", "mk_old") });
      mockKeyLookup(async () => {});

      await expect(makeFactory().rotateCredentials(OLD_KEY, commit, OLD_KEY)).rejects.toThrow("Stripe is down");

      expect(calls).toEqual(["create", "expire:mk_old", "lookup:mk_old", "expire:mk_new"]);
      expect(commit).not.toHaveBeenCalled();
    });

    it("treats a 404 on expire as already gone", async () => {
      mockStripe({ expire: failsWith(404, "No such key", "mk_old") });

      await expect(makeFactory().rotateCredentials(OLD_KEY, commit, OLD_KEY)).resolves.toEqual(NEW_KEY);

      expect(getMock).not.toHaveBeenCalled();
    });

    it("completes when the existence check finds the previous key already gone", async () => {
      // A double expire's response has never been observed, so a repeat expire is mocked to fail with
      // something other than 404 (a generic 400), and the existence check is what recognizes the key
      // as already gone.
      mockStripe({ expire: failsWith(400, "Key is not active", "mk_old") });
      mockKeyLookup(async () => {
        throw httpError(404, "No such key");
      });

      await expect(makeFactory().rotateCredentials(OLD_KEY, commit, OLD_KEY)).resolves.toEqual(NEW_KEY);

      expect(calls).toEqual(["create", "expire:mk_old", "lookup:mk_old", "commit"]);
    });

    it("surfaces the original expire error, not the existence check's error, when the check itself fails", async () => {
      mockStripe({ expire: failsWith(400, "Key is not active", "mk_old") });
      mockKeyLookup(async () => {
        throw httpError(500, "Stripe existence check is down");
      });

      await expect(makeFactory().rotateCredentials(OLD_KEY, commit, OLD_KEY)).rejects.toThrow("Key is not active");
    });
  });

  describe("revokeCredentials", () => {
    it.each([
      { activeIndex: 0, expected: ["expire:mk_two", "expire:mk_one", "commit"] },
      { activeIndex: 1, expected: ["expire:mk_one", "expire:mk_two", "commit"] }
    ])("retires the published key last (activeIndex $activeIndex)", async ({ activeIndex, expected }) => {
      mockStripe();

      const result = await makeFactory({ activeIndex }).revokeCredentials(
        [
          { keyId: "mk_one", apiKey: "rk_one" },
          { keyId: "mk_two", apiKey: "rk_two" }
        ],
        commitWithoutCredentials
      );

      expect(calls).toEqual(expected);
      expect(result).toBe(COMMITTED);
    });

    it("stops at the first failure and never calls back", async () => {
      mockStripe({ expire: failsWith(500, "Stripe is down", "mk_two") });
      mockKeyLookup(async () => {});

      await expect(
        makeFactory({ activeIndex: 1 }).revokeCredentials(
          [
            { keyId: "mk_one", apiKey: "rk_one" },
            { keyId: "mk_two", apiKey: "rk_two" }
          ],
          commitWithoutCredentials
        )
      ).rejects.toThrow("Stripe is down");

      expect(calls).toEqual(["expire:mk_one", "expire:mk_two", "lookup:mk_two"]);
      expect(commitWithoutCredentials).not.toHaveBeenCalled();
    });
  });

  describe("checkActiveCredentials", () => {
    it("treats 403 as a live key and 401 as a dead one", async () => {
      getMock.mockRejectedValueOnce(httpError(403, "Insufficient permissions"));
      await expect(makeFactory().checkActiveCredentials!(NEW_KEY)).resolves.toBeUndefined();

      getMock.mockRejectedValueOnce(httpError(401, "Invalid API Key"));
      await expect(makeFactory().checkActiveCredentials!(NEW_KEY)).rejects.toThrow("Invalid API Key");
    });
  });
});
