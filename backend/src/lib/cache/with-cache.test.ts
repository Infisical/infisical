import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { withCache } from "./with-cache";

vi.mock("@app/lib/logger", () => ({
  logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));

describe("withCache", () => {
  let mockKeyStore: {
    getItem: ReturnType<typeof vi.fn>;
    setItemWithExpiry: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockKeyStore = {
      getItem: vi.fn(),
      setItemWithExpiry: vi.fn().mockResolvedValue("OK")
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return cached value on cache hit without calling fetcher", async () => {
    const data = { id: "123", name: "test" };
    mockKeyStore.getItem.mockResolvedValue(JSON.stringify(data));
    const fetcher = vi.fn();

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "test-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toEqual(data);
    expect(fetcher).not.toHaveBeenCalled();
    expect(mockKeyStore.setItemWithExpiry).not.toHaveBeenCalled();
  });

  it("should call fetcher and write to cache on cache miss", async () => {
    const data = { id: "456", items: [1, 2, 3] };
    mockKeyStore.getItem.mockResolvedValue(null);
    const fetcher = vi.fn().mockResolvedValue(data);

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "miss-key",
      ttlSeconds: 120,
      fetcher
    });

    expect(result).toEqual(data);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith("miss-key", 120, JSON.stringify(data));
  });

  it("should fall back to fetcher when cache read throws", async () => {
    const data = { fallback: true };
    mockKeyStore.getItem.mockRejectedValue(new Error("Redis connection refused"));
    const fetcher = vi.fn().mockResolvedValue(data);

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "error-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toEqual(data);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("should still return fetcher result when cache write throws", async () => {
    const data = { writeFailOk: true };
    mockKeyStore.getItem.mockResolvedValue(null);
    mockKeyStore.setItemWithExpiry.mockRejectedValue(new Error("Redis write failed"));
    const fetcher = vi.fn().mockResolvedValue(data);

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "write-fail-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toEqual(data);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("should propagate fetcher errors without catching them", async () => {
    mockKeyStore.getItem.mockResolvedValue(null);
    const fetcherError = new Error("DB connection failed");
    const fetcher = vi.fn().mockRejectedValue(fetcherError);

    await expect(
      withCache({
        keyStore: mockKeyStore,
        key: "fetcher-error-key",
        ttlSeconds: 60,
        fetcher
      })
    ).rejects.toThrow("DB connection failed");
  });

  it("should pass the correct TTL to setItemWithExpiry", async () => {
    mockKeyStore.getItem.mockResolvedValue(null);
    const fetcher = vi.fn().mockResolvedValue("value");

    await withCache({
      keyStore: mockKeyStore,
      key: "ttl-key",
      ttlSeconds: 300,
      fetcher
    });

    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith("ttl-key", 300, JSON.stringify("value"));
  });

  it("should handle primitive cached values (string)", async () => {
    mockKeyStore.getItem.mockResolvedValue(JSON.stringify("hello"));
    const fetcher = vi.fn();

    const result = await withCache<string>({
      keyStore: mockKeyStore,
      key: "string-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toBe("hello");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should handle primitive cached values (number)", async () => {
    mockKeyStore.getItem.mockResolvedValue(JSON.stringify(42));
    const fetcher = vi.fn();

    const result = await withCache<number>({
      keyStore: mockKeyStore,
      key: "number-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toBe(42);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should handle array values", async () => {
    const arr = [1, "two", { three: 3 }];
    mockKeyStore.getItem.mockResolvedValue(null);
    const fetcher = vi.fn().mockResolvedValue(arr);

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "array-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toEqual(arr);
  });

  it("should handle null fetcher result", async () => {
    mockKeyStore.getItem.mockResolvedValue(null);
    const fetcher = vi.fn().mockResolvedValue(null);

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "null-result-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toBeNull();
    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith("null-result-key", 60, "null");
  });

  it("should return null from cache when null was previously cached", async () => {
    mockKeyStore.getItem.mockResolvedValue("null");
    const fetcher = vi.fn();

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "cached-null-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should fall back to fetcher when cached value is invalid JSON", async () => {
    const { logger } = await import("@app/lib/logger");
    const data = { valid: true };
    mockKeyStore.getItem.mockResolvedValue("not-valid-json{{{");
    const fetcher = vi.fn().mockResolvedValue(data);

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "bad-json-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(result).toEqual(data);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "bad-json-key" }),
      expect.stringContaining("cache parse failed")
    );
  });

  it("should compute TTL from fetcher result when ttlSeconds is a function", async () => {
    mockKeyStore.getItem.mockResolvedValue(null);
    const data = { expiresInSeconds: 42 };
    const fetcher = vi.fn().mockResolvedValue(data);
    const ttlFn = vi.fn((result: typeof data) => result.expiresInSeconds);

    await withCache({
      keyStore: mockKeyStore,
      key: "dynamic-ttl-key",
      ttlSeconds: ttlFn,
      fetcher
    });

    expect(ttlFn).toHaveBeenCalledWith(data);
    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith("dynamic-ttl-key", 42, JSON.stringify(data));
  });

  it("should not call TTL function on cache hit", async () => {
    const data = { cached: true };
    mockKeyStore.getItem.mockResolvedValue(JSON.stringify(data));
    const fetcher = vi.fn();
    const ttlFn = vi.fn(() => 100);

    await withCache({
      keyStore: mockKeyStore,
      key: "hit-dynamic-ttl-key",
      ttlSeconds: ttlFn,
      fetcher
    });

    expect(ttlFn).not.toHaveBeenCalled();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should call reviver on cache hit to mutate parsed value", async () => {
    const cached = { date: "2026-04-13T00:00:00.000Z", value: 10 };
    mockKeyStore.getItem.mockResolvedValue(JSON.stringify(cached));
    const fetcher = vi.fn();
    const reviver = vi.fn((parsed: { date: string | Date; value: number }) => {
      // eslint-disable-next-line no-param-reassign
      parsed.date = new Date(parsed.date as string);
    });

    const result = await withCache<{ date: string | Date; value: number }>({
      keyStore: mockKeyStore,
      key: "reviver-key",
      ttlSeconds: 60,
      fetcher,
      reviver
    });

    expect(reviver).toHaveBeenCalledOnce();
    expect(result.date).toBeInstanceOf(Date);
    expect((result.date as Date).toISOString()).toBe("2026-04-13T00:00:00.000Z");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("should use reviver's return value when it returns a new object", async () => {
    const cached = { value: 1 };
    mockKeyStore.getItem.mockResolvedValue(JSON.stringify(cached));
    const fetcher = vi.fn();
    const reviver = vi.fn((parsed: { value: number }) => ({ value: parsed.value * 2 }));

    const result = await withCache<{ value: number }>({
      keyStore: mockKeyStore,
      key: "reviver-return-key",
      ttlSeconds: 60,
      fetcher,
      reviver
    });

    expect(result.value).toBe(2);
  });

  it("should not call reviver on cache miss", async () => {
    mockKeyStore.getItem.mockResolvedValue(null);
    const fetcher = vi.fn().mockResolvedValue({ fresh: true });
    const reviver = vi.fn();

    await withCache({
      keyStore: mockKeyStore,
      key: "miss-reviver-key",
      ttlSeconds: 60,
      fetcher,
      reviver
    });

    expect(reviver).not.toHaveBeenCalled();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("should fall back to fetcher when reviver throws", async () => {
    const { logger } = await import("@app/lib/logger");
    const cached = { value: 1 };
    const fresh = { value: 99 };
    mockKeyStore.getItem.mockResolvedValue(JSON.stringify(cached));
    const fetcher = vi.fn().mockResolvedValue(fresh);
    const reviver = vi.fn(() => {
      throw new Error("reviver boom");
    });

    const result = await withCache({
      keyStore: mockKeyStore,
      key: "reviver-throws-key",
      ttlSeconds: 60,
      fetcher,
      reviver
    });

    expect(result).toEqual(fresh);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "reviver-throws-key" }),
      expect.stringContaining("cache parse failed")
    );
  });

  it("should log warnings on cache read and write failures", async () => {
    const { logger } = await import("@app/lib/logger");

    mockKeyStore.getItem.mockRejectedValue(new Error("read error"));
    mockKeyStore.setItemWithExpiry.mockRejectedValue(new Error("write error"));
    const fetcher = vi.fn().mockResolvedValue({ ok: true });

    await withCache({
      keyStore: mockKeyStore,
      key: "log-test-key",
      ttlSeconds: 60,
      fetcher
    });

    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "log-test-key" }),
      expect.stringContaining("cache read failed")
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "log-test-key" }),
      expect.stringContaining("cache write failed")
    );
  });
});

describe("withCacheFingerprint", () => {
  let mockKeyStore: {
    getItem: ReturnType<typeof vi.fn>;
    setItemWithExpiry: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockKeyStore = {
      getItem: vi.fn(),
      setItemWithExpiry: vi.fn().mockResolvedValue("OK")
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should return cached data on marker and data hit (0 DB reads)", async () => {
    const { withCacheFingerprint } = await import("./with-cache");
    const payload = { id: "user-123", permissions: ["read", "write"] };
    const cachedData = { fingerprint: "fp-abc", payload };

    mockKeyStore.getItem.mockImplementation(async (key: string) => {
      if (key === "marker-key") return "1";
      if (key === "data-key") return JSON.stringify(cachedData);
      return null;
    });

    const fingerprintFetcher = vi.fn();
    const dataFetcher = vi.fn();

    const result = await withCacheFingerprint({
      keyStore: mockKeyStore,
      dataKey: "data-key",
      markerKey: "marker-key",
      markerTtlSeconds: 10,
      dataTtlSeconds: 600,
      fingerprintFetcher,
      dataFetcher
    });

    expect(result).toEqual(payload);
    expect(fingerprintFetcher).not.toHaveBeenCalled();
    expect(dataFetcher).not.toHaveBeenCalled();
    expect(mockKeyStore.setItemWithExpiry).not.toHaveBeenCalled();
  });

  it("should revalidate and reset marker on marker miss + data hit + fingerprint match (1 DB read)", async () => {
    const { withCacheFingerprint } = await import("./with-cache");
    const payload = { id: "user-456", permissions: ["admin"] };
    const fingerprint = "fp-def";
    const cachedData = { fingerprint, payload };

    mockKeyStore.getItem.mockImplementation(async (key: string) => {
      if (key === "marker-key") return null; // Marker expired
      if (key === "data-key") return JSON.stringify(cachedData);
      return null;
    });

    const fingerprintFetcher = vi.fn().mockResolvedValue(fingerprint);
    const dataFetcher = vi.fn();

    const result = await withCacheFingerprint({
      keyStore: mockKeyStore,
      dataKey: "data-key",
      markerKey: "marker-key",
      markerTtlSeconds: 10,
      dataTtlSeconds: 600,
      fingerprintFetcher,
      dataFetcher
    });

    expect(result).toEqual(payload);
    expect(fingerprintFetcher).toHaveBeenCalledOnce();
    expect(dataFetcher).not.toHaveBeenCalled();
    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith("marker-key", 10, "1");
  });

  it("should full re-fetch on fingerprint mismatch (1 heavy DB read)", async () => {
    const { withCacheFingerprint } = await import("./with-cache");
    const oldPayload = { id: "user-789", permissions: ["read"] };
    const newPayload = { id: "user-789", permissions: ["read", "write"] };
    const oldFingerprint = "fp-old";
    const newFingerprint = "fp-new";
    const oldCachedData = { fingerprint: oldFingerprint, payload: oldPayload };

    mockKeyStore.getItem.mockImplementation(async (key: string) => {
      if (key === "marker-key") return null;
      if (key === "data-key") return JSON.stringify(oldCachedData);
      return null;
    });

    const fingerprintFetcher = vi.fn().mockResolvedValue(newFingerprint);
    const dataFetcher = vi.fn().mockResolvedValue(newPayload);

    const result = await withCacheFingerprint({
      keyStore: mockKeyStore,
      dataKey: "data-key",
      markerKey: "marker-key",
      markerTtlSeconds: 10,
      dataTtlSeconds: 600,
      fingerprintFetcher,
      dataFetcher
    });

    expect(result).toEqual(newPayload);
    expect(fingerprintFetcher).toHaveBeenCalledOnce();
    expect(dataFetcher).toHaveBeenCalledOnce();
    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith(
      "data-key",
      600,
      JSON.stringify({ fingerprint: newFingerprint, payload: newPayload })
    );
    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith("marker-key", 10, "1");
  });

  it("should full re-fetch on marker miss + data miss", async () => {
    const { withCacheFingerprint } = await import("./with-cache");
    const payload = { id: "new-user", permissions: ["viewer"] };
    const fingerprint = "fp-fresh";

    mockKeyStore.getItem.mockResolvedValue(null); // Both marker and data miss

    const fingerprintFetcher = vi.fn().mockResolvedValue(fingerprint);
    const dataFetcher = vi.fn().mockResolvedValue(payload);

    const result = await withCacheFingerprint({
      keyStore: mockKeyStore,
      dataKey: "data-key",
      markerKey: "marker-key",
      markerTtlSeconds: 10,
      dataTtlSeconds: 600,
      fingerprintFetcher,
      dataFetcher
    });

    expect(result).toEqual(payload);
    expect(fingerprintFetcher).toHaveBeenCalledOnce();
    expect(dataFetcher).toHaveBeenCalledOnce();
    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith(
      "data-key",
      600,
      JSON.stringify({ fingerprint, payload })
    );
    expect(mockKeyStore.setItemWithExpiry).toHaveBeenCalledWith("marker-key", 10, "1");
  });

  it("should call reviver on cache hits", async () => {
    const { withCacheFingerprint } = await import("./with-cache");
    const payload = { date: "2026-04-13T00:00:00.000Z", value: 42 };
    const cachedData = { fingerprint: "fp-date", payload };

    mockKeyStore.getItem.mockImplementation(async (key: string) => {
      if (key === "marker-key") return "1";
      if (key === "data-key") return JSON.stringify(cachedData);
      return null;
    });

    const fingerprintFetcher = vi.fn();
    const dataFetcher = vi.fn();
    const reviver = vi.fn((parsed: { date: string | Date; value: number }) => {
      // eslint-disable-next-line no-param-reassign
      parsed.date = new Date(parsed.date as string);
    });

    const result = await withCacheFingerprint<{ date: string | Date; value: number }>({
      keyStore: mockKeyStore,
      dataKey: "data-key",
      markerKey: "marker-key",
      markerTtlSeconds: 10,
      dataTtlSeconds: 600,
      fingerprintFetcher,
      dataFetcher,
      reviver
    });

    expect(reviver).toHaveBeenCalledOnce();
    expect(result.date).toBeInstanceOf(Date);
    expect((result.date as Date).toISOString()).toBe("2026-04-13T00:00:00.000Z");
  });

  it("should gracefully handle Redis read failures", async () => {
    const { withCacheFingerprint } = await import("./with-cache");
    const { logger } = await import("@app/lib/logger");
    const payload = { id: "fallback-user" };
    const fingerprint = "fp-fallback";

    mockKeyStore.getItem.mockRejectedValue(new Error("Redis connection lost"));

    const fingerprintFetcher = vi.fn().mockResolvedValue(fingerprint);
    const dataFetcher = vi.fn().mockResolvedValue(payload);

    const result = await withCacheFingerprint({
      keyStore: mockKeyStore,
      dataKey: "data-key",
      markerKey: "marker-key",
      markerTtlSeconds: 10,
      dataTtlSeconds: 600,
      fingerprintFetcher,
      dataFetcher
    });

    expect(result).toEqual(payload);
    expect(fingerprintFetcher).toHaveBeenCalledOnce();
    expect(dataFetcher).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "marker-key" }),
      expect.stringContaining("marker read failed")
    );
  });

  it("should bypass cache and call dataFetcher directly on fingerprint fetch failure", async () => {
    const { withCacheFingerprint } = await import("./with-cache");
    const { logger } = await import("@app/lib/logger");
    const payload = { id: "rescue-user" };

    mockKeyStore.getItem.mockResolvedValue(null);

    const fingerprintFetcher = vi.fn().mockRejectedValue(new Error("DB timeout"));
    const dataFetcher = vi.fn().mockResolvedValue(payload);

    const result = await withCacheFingerprint({
      keyStore: mockKeyStore,
      dataKey: "data-key",
      markerKey: "marker-key",
      markerTtlSeconds: 10,
      dataTtlSeconds: 600,
      fingerprintFetcher,
      dataFetcher
    });

    expect(result).toEqual(payload);
    expect(dataFetcher).toHaveBeenCalledOnce();
    expect(mockKeyStore.setItemWithExpiry).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ err: expect.any(Error) as Error }) as unknown as Record<string, unknown>,
      expect.stringContaining("fingerprint fetch failed")
    );
  });

  it("should not block on Redis write failures", async () => {
    const { withCacheFingerprint } = await import("./with-cache");
    const { logger } = await import("@app/lib/logger");
    const payload = { id: "write-fail-user" };
    const fingerprint = "fp-write";

    mockKeyStore.getItem.mockResolvedValue(null);
    mockKeyStore.setItemWithExpiry.mockRejectedValue(new Error("Redis write timeout"));

    const fingerprintFetcher = vi.fn().mockResolvedValue(fingerprint);
    const dataFetcher = vi.fn().mockResolvedValue(payload);

    const result = await withCacheFingerprint({
      keyStore: mockKeyStore,
      dataKey: "data-key",
      markerKey: "marker-key",
      markerTtlSeconds: 10,
      dataTtlSeconds: 600,
      fingerprintFetcher,
      dataFetcher
    });

    expect(result).toEqual(payload);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ key: "data-key" }),
      expect.stringContaining("data write failed")
    );
  });

  it("should propagate dataFetcher errors", async () => {
    const { withCacheFingerprint } = await import("./with-cache");

    mockKeyStore.getItem.mockResolvedValue(null);

    const fingerprintFetcher = vi.fn().mockResolvedValue("fp-error");
    const dataFetcher = vi.fn().mockRejectedValue(new Error("Database query failed"));

    await expect(
      withCacheFingerprint({
        keyStore: mockKeyStore,
        dataKey: "data-key",
        markerKey: "marker-key",
        markerTtlSeconds: 10,
        dataTtlSeconds: 600,
        fingerprintFetcher,
        dataFetcher
      })
    ).rejects.toThrow("Database query failed");
  });
});
