import { beforeEach, describe, expect, test, vi } from "vitest";

import { KeyStorePrefixes } from "@app/keystore/keystore";
import { crypto } from "@app/lib/crypto";

import { channelBindingCacheFactory } from "./microsoft-autoenrollment-channel-binding-cache";
import { learnServerChannelBindings } from "./microsoft-autoenrollment-channel-binding-fns";

vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.example.com" }) }));

vi.mock("@app/lib/logger", () => ({ logger: { warn: vi.fn() } }));

vi.mock("./microsoft-autoenrollment-channel-binding-fns", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./microsoft-autoenrollment-channel-binding-fns")>()),
  learnServerChannelBindings: vi.fn()
}));

const ENDPOINT = { host: "app.example.com", port: 443 };
const ENDPOINT_KEY = "app.example.com:443";
const SERVER_BINDING = "11".repeat(16);
const ROTATED_BINDING = "22".repeat(16);

describe("channelBindingCacheFactory", () => {
  const items = new Map<string, string>();
  const heldLocks = new Set<string>();
  const keyStore = {
    getItem: vi.fn(async (key: string) => items.get(key) ?? null),
    setItemWithExpiry: vi.fn(async (key: string, _expiry: number, value: string | number) => {
      items.set(key, String(value));
      return "OK" as const;
    }),
    deleteItem: vi.fn(async (key: string) => Number(items.delete(key))),
    setItemWithExpiryNX: vi.fn(async (key: string) => {
      if (heldLocks.has(key)) return null;
      heldLocks.add(key);
      return "OK" as const;
    })
  };

  const createCache = () => channelBindingCacheFactory({ keyStore: keyStore as never });

  beforeEach(() => {
    vi.clearAllMocks();
    items.clear();
    heldLocks.clear();
    vi.spyOn(crypto, "isFipsModeEnabled").mockReturnValue(false);
    vi.mocked(learnServerChannelBindings).mockResolvedValue([SERVER_BINDING]);
  });

  test("learns the bindings once for concurrent loads on an empty cache, then answers from the cache", async () => {
    const cache = createCache();

    const [first, second] = await Promise.all([cache.loadExpected(), cache.loadExpected()]);
    const third = await cache.loadExpected();

    expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
    expect(first?.entries.map(({ binding }) => binding)).toEqual([SERVER_BINDING]);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(items.has(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindings(ENDPOINT_KEY))).toBe(true);
  });

  test("records a failed read and stops trying until the retry marker expires", async () => {
    vi.mocked(learnServerChannelBindings).mockResolvedValue([]);
    const cache = createCache();

    expect(await cache.loadExpected()).toBeNull();
    expect(await cache.loadExpected()).toBeNull();

    expect(learnServerChannelBindings).toHaveBeenCalledTimes(1);
    expect(items.has(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLearnFailed(ENDPOINT_KEY))).toBe(
      true
    );
    expect(items.get(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLastFailure(ENDPOINT_KEY))).toContain(
      ENDPOINT_KEY
    );
  });

  test("refresh adds newly seen bindings to the cached ones and clears the last failure", async () => {
    const cachedEntries = [{ binding: SERVER_BINDING, seenAt: new Date().toISOString() }];
    items.set(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLastFailure(ENDPOINT_KEY), "failed");
    vi.mocked(learnServerChannelBindings).mockResolvedValue([ROTATED_BINDING]);

    const refreshed = await createCache().refresh(ENDPOINT, cachedEntries);

    expect(refreshed?.map(({ binding }) => binding)).toEqual([ROTATED_BINDING, SERVER_BINDING]);
    expect(items.has(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsLastFailure(ENDPOINT_KEY))).toBe(
      false
    );
  });

  test("refresh reads what another instance learned while it holds the lock, without reading the certificates", async () => {
    heldLocks.add(KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindingsRefreshLock(ENDPOINT_KEY));
    const cache = createCache();

    expect(await cache.refresh(ENDPOINT, [])).toBeNull();

    const sharedEntries = [{ binding: ROTATED_BINDING, seenAt: new Date().toISOString() }];
    items.set(
      KeyStorePrefixes.MicrosoftAutoenrollmentServerChannelBindings(ENDPOINT_KEY),
      JSON.stringify(sharedEntries)
    );
    expect(await cache.refresh(ENDPOINT, [])).toEqual(sharedEntries);
    expect(learnServerChannelBindings).not.toHaveBeenCalled();
  });
});
