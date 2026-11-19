import { InMemoryKeyStore } from "./in-memory-key-store";

const clock = () => {
  let now = 1_000_000;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    }
  };
};

describe("InMemoryKeyStore", () => {
  test("should return a value before its TTL and null after", async () => {
    // Setup
    const time = clock();
    const store = new InMemoryKeyStore(time.now);
    await store.setItemWithExpiry("k", 10, "v");

    // Action
    const before = await store.getItem("k");
    time.advance(10_000);
    const after = await store.getItem("k");

    // Assert
    expect(before).toBe("v");
    expect(after).toBeNull();
  });

  test("should refuse an NX set while the key exists and accept it after expiry", async () => {
    // Setup
    const time = clock();
    const store = new InMemoryKeyStore(time.now);
    await store.setItemWithExpiryNX("lock", 5, "first");

    // Action
    const refused = await store.setItemWithExpiryNX("lock", 5, "second");
    time.advance(5_000);
    const accepted = await store.setItemWithExpiryNX("lock", 5, "third");

    // Assert
    expect(refused).toBeNull();
    expect(accepted).toBe("OK");
    expect(await store.getItem("lock")).toBe("third");
  });

  test("should return MGET values in key order, with null for missing keys", async () => {
    // Setup
    const store = new InMemoryKeyStore();
    await store.setItemWithExpiry("b", 60, "2");
    await store.setItemWithExpiry("a", 60, "1");

    // Action
    const values = await store.getItems(["a", "missing", "b"]);

    // Assert
    expect(values).toEqual(["1", null, "2"]);
  });

  test("should forget a deleted key", async () => {
    // Setup
    const store = new InMemoryKeyStore();
    await store.setItemWithExpiry("k", 60, "v");

    // Action
    const deleted = await store.deleteItem("k");

    // Assert
    expect(deleted).toBe(1);
    expect(await store.getItem("k")).toBeNull();
  });
});
