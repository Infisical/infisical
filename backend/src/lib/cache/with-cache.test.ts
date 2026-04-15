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
