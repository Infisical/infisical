import { describe, expect, type Mocked, test, vi } from "vitest";

import { IdentityAuthMethod } from "@app/db/schemas";
import { TKeyStoreFactory } from "@app/keystore/keystore";

import { getActiveLockoutAuthMethodsForIdentities } from "./identity-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
}));

type KeyStoreSlice = Pick<TKeyStoreFactory, "getItem" | "getItems" | "getKeysByPattern">;

const makeKeyStore = (patch: Partial<Mocked<KeyStoreSlice>> = {}): Mocked<KeyStoreSlice> =>
  ({
    getItem: vi.fn().mockResolvedValue(null),
    getItems: vi.fn().mockResolvedValue([]),
    getKeysByPattern: vi.fn().mockResolvedValue([]),
    ...patch
  }) as Mocked<KeyStoreSlice>;

const lockedValue = JSON.stringify({ lockedOut: true, failedAttempts: 3 });
const countingValue = JSON.stringify({ lockedOut: false, failedAttempts: 1 });

describe("getActiveLockoutAuthMethodsForIdentities", () => {
  test("returns nothing and touches Redis zero times for an empty page", async () => {
    const keyStore = makeKeyStore();
    const result = await getActiveLockoutAuthMethodsForIdentities([], keyStore as never);
    expect(result).toEqual({});
    expect(keyStore.getItems).not.toHaveBeenCalled();
    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
  });

  test("does no Redis work for identities whose auth methods cannot lock out", async () => {
    const keyStore = makeKeyStore();
    const result = await getActiveLockoutAuthMethodsForIdentities(
      [{ id: "i1", authMethods: [IdentityAuthMethod.KUBERNETES_AUTH], universalAuthClientId: null }],
      keyStore as never
    );
    expect(result).toEqual({});
    expect(keyStore.getItems).not.toHaveBeenCalled();
    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
  });

  test("reads universal auth lockout by exact key and reports it", async () => {
    const keyStore = makeKeyStore({ getItems: vi.fn().mockResolvedValue([lockedValue]) });
    const result = await getActiveLockoutAuthMethodsForIdentities(
      [{ id: "i1", authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH], universalAuthClientId: "client-1" }],
      keyStore as never
    );
    expect(keyStore.getItems).toHaveBeenCalledWith(["lockout:identity:i1:universal-auth:client-1"]);
    expect(result).toEqual({ i1: [IdentityAuthMethod.UNIVERSAL_AUTH] });
    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
  });

  test("does not report a record that is only counting failures", async () => {
    const keyStore = makeKeyStore({ getItems: vi.fn().mockResolvedValue([countingValue]) });
    const result = await getActiveLockoutAuthMethodsForIdentities(
      [{ id: "i1", authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH], universalAuthClientId: "client-1" }],
      keyStore as never
    );
    expect(result).toEqual({});
  });

  test("resolves a full page of universal auth identities in a single MGET", async () => {
    const identities = Array.from({ length: 20 }, (_, i) => ({
      id: `i${i}`,
      authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH],
      universalAuthClientId: `client-${i}`
    }));
    const keyStore = makeKeyStore({
      getItems: vi.fn().mockResolvedValue(new Array(20).fill(null) as (string | null)[])
    });
    await getActiveLockoutAuthMethodsForIdentities(identities, keyStore as never);
    expect(keyStore.getItems).toHaveBeenCalledTimes(1);
    expect(keyStore.getKeysByPattern).not.toHaveBeenCalled();
  });

  test("falls back to a pattern scan for LDAP, whose slug is not derivable", async () => {
    const keyStore = makeKeyStore({
      getKeysByPattern: vi.fn().mockResolvedValue(["lockout:identity:i1:ldap-auth:alice"]),
      getItem: vi.fn().mockResolvedValue(lockedValue)
    });
    const result = await getActiveLockoutAuthMethodsForIdentities(
      [{ id: "i1", authMethods: [IdentityAuthMethod.LDAP_AUTH], universalAuthClientId: null }],
      keyStore as never
    );
    expect(keyStore.getKeysByPattern).toHaveBeenCalledWith("lockout:identity:i1:*");
    expect(result).toEqual({ i1: [IdentityAuthMethod.LDAP_AUTH] });
  });

  test("falls back to a scan when a universal auth identity has no client id", async () => {
    const keyStore = makeKeyStore({
      getKeysByPattern: vi.fn().mockResolvedValue(["lockout:identity:i1:universal-auth:client-1"]),
      getItem: vi.fn().mockResolvedValue(lockedValue)
    });
    const result = await getActiveLockoutAuthMethodsForIdentities(
      [{ id: "i1", authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH], universalAuthClientId: null }],
      keyStore as never
    );
    expect(keyStore.getItems).not.toHaveBeenCalled();
    expect(result).toEqual({ i1: [IdentityAuthMethod.UNIVERSAL_AUTH] });
  });

  test("reports both methods when an identity is locked out on each", async () => {
    const keyStore = makeKeyStore({
      getItems: vi.fn().mockResolvedValue([lockedValue]),
      getKeysByPattern: vi.fn().mockResolvedValue(["lockout:identity:i1:ldap-auth:alice"]),
      getItem: vi.fn().mockResolvedValue(lockedValue)
    });
    const result = await getActiveLockoutAuthMethodsForIdentities(
      [
        {
          id: "i1",
          authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH, IdentityAuthMethod.LDAP_AUTH],
          universalAuthClientId: "client-1"
        }
      ],
      keyStore as never
    );
    expect(result.i1).toEqual(
      expect.arrayContaining([IdentityAuthMethod.UNIVERSAL_AUTH, IdentityAuthMethod.LDAP_AUTH])
    );
    expect(result.i1).toHaveLength(2);
  });

  test("treats a malformed stored value as not locked out", async () => {
    const keyStore = makeKeyStore({ getItems: vi.fn().mockResolvedValue(["not json"]) });
    const result = await getActiveLockoutAuthMethodsForIdentities(
      [{ id: "i1", authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH], universalAuthClientId: "client-1" }],
      keyStore as never
    );
    expect(result).toEqual({});
  });

  test("fails open when Redis errors rather than failing the page", async () => {
    const keyStore = makeKeyStore({
      getItems: vi.fn().mockRejectedValue(new Error("redis unavailable"))
    });
    const result = await getActiveLockoutAuthMethodsForIdentities(
      [{ id: "i1", authMethods: [IdentityAuthMethod.UNIVERSAL_AUTH], universalAuthClientId: "client-1" }],
      keyStore as never
    );
    expect(result).toEqual({});
  });
});
