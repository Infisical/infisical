import { ExternalSystemError } from "@app/domains/lib/errors";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { delay } from "@app/lib/delay";

import { EncryptedDataKey } from "../models/encrypted-data-key";
import {
  PROJECT_DATA_KEY_CACHE_TTL_SECONDS,
  ProjectDataKeyCache,
  projectDataKeyCacheKey
} from "./project-data-key-cache";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

vi.mock("@app/lib/delay", () => ({ delay: vi.fn(async () => undefined) }));

const encryptedKey = () =>
  EncryptedDataKey.restore({ kmsKeyId: "key-1", encryptedDataKey: Buffer.from([1, 2, 3, 250]), orgId: "org-1" });

const build = () => {
  const keyStore = new InMemoryKeyStore();
  return { keyStore, cache: new ProjectDataKeyCache(keyStore) };
};

describe("ProjectDataKeyCache", () => {
  beforeEach(() => {
    vi.mocked(delay).mockClear();
  });

  describe("set", () => {
    test("should write the payload previous-release pods read, under the frozen key and TTL", async () => {
      // Setup
      const { keyStore, cache } = build();
      const setItemWithExpiry = vi.spyOn(keyStore, "setItemWithExpiry");

      // Action
      await cache.set("project-1", encryptedKey());

      // Assert
      expect(setItemWithExpiry).toHaveBeenCalledExactlyOnceWith(
        "kms-project-sm-material:project-1",
        300,
        '{"kmsSecretManagerKeyId":"key-1","kmsSecretManagerEncryptedDataKey":"AQID+g==","orgId":"org-1"}'
      );
      expect(projectDataKeyCacheKey("project-1")).toBe("kms-project-sm-material:project-1");
      expect(PROJECT_DATA_KEY_CACHE_TTL_SECONDS).toBe(300);
    });

    test("should read back what it wrote", async () => {
      // Setup
      const { cache } = build();
      await cache.set("project-1", encryptedKey());

      // Action
      const read = await cache.get("project-1");

      // Assert
      expect(read?.equals(encryptedKey())).toBe(true);
    });

    test("should swallow a failed write", async () => {
      // Setup
      const { keyStore, cache } = build();
      vi.spyOn(keyStore, "setItemWithExpiry").mockRejectedValue(new Error("redis down"));

      // Action
      const result = cache.set("project-1", encryptedKey());

      // Assert
      await expect(result).resolves.toBeUndefined();
    });
  });

  describe("get", () => {
    test("should return null on a miss", async () => {
      // Setup
      const { cache } = build();

      // Action
      const read = await cache.get("project-1");

      // Assert
      expect(read).toBeNull();
    });

    test("should return null for a partial entry written by a pod of the previous release", async () => {
      // Setup
      const { keyStore, cache } = build();
      await keyStore.setItemWithExpiry(
        projectDataKeyCacheKey("project-1"),
        300,
        JSON.stringify({ kmsSecretManagerKeyId: null, kmsSecretManagerEncryptedDataKey: null, orgId: "org-1" })
      );

      // Action
      const read = await cache.get("project-1");

      // Assert
      expect(read).toBeNull();
    });

    test("should return null for an entry that is not JSON", async () => {
      // Setup
      const { keyStore, cache } = build();
      await keyStore.setItemWithExpiry(projectDataKeyCacheKey("project-1"), 300, "{not json");

      // Action
      const read = await cache.get("project-1");

      // Assert
      expect(read).toBeNull();
    });

    test("should return null when Redis fails", async () => {
      // Setup
      const { keyStore, cache } = build();
      vi.spyOn(keyStore, "getItem").mockRejectedValue(new Error("redis down"));

      // Action
      const read = await cache.get("project-1");

      // Assert
      expect(read).toBeNull();
    });
  });

  describe("evict", () => {
    test("should delete the entry", async () => {
      // Setup
      const { cache } = build();
      await cache.set("project-1", encryptedKey());

      // Action
      await cache.evict("project-1");

      // Assert
      expect(await cache.get("project-1")).toBeNull();
    });

    test("should retry with backoff and succeed when the second attempt works", async () => {
      // Setup
      const { keyStore, cache } = build();
      const deleteItem = vi.spyOn(keyStore, "deleteItem").mockRejectedValueOnce(new Error("redis down"));

      // Action
      await cache.evict("project-1");

      // Assert
      expect(deleteItem).toHaveBeenCalledTimes(2);
      expect(deleteItem).toHaveBeenLastCalledWith("kms-project-sm-material:project-1");
      expect(vi.mocked(delay).mock.calls).toEqual([[100]]);
    });

    test("should throw an ExternalSystemError after three failed deletes", async () => {
      // Setup
      const { keyStore, cache } = build();
      const deleteItem = vi.spyOn(keyStore, "deleteItem").mockRejectedValue(new Error("redis down"));

      // Action
      const result = cache.evict("project-1");

      // Assert
      await expect(result).rejects.toBeInstanceOf(ExternalSystemError);
      expect(deleteItem).toHaveBeenCalledTimes(3);
      expect(vi.mocked(delay).mock.calls).toEqual([[100], [200]]);
    });
  });
});
