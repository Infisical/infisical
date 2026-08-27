import { inMemoryKeyStore } from "./memory";

describe("claimLeastLoaded", () => {
  test("rejects a mismatched base-occupancy list rather than reading the ttl as a count", async () => {
    const keyStore = inMemoryKeyStore();
    await expect(keyStore.claimLeastLoaded(["a", "b"], [0], 60)).rejects.toThrow(
      "baseOccupancies must have one entry per key"
    );
  });

  test("claims the lowest total and counts existing reservations", async () => {
    const keyStore = inMemoryKeyStore();
    expect(await keyStore.claimLeastLoaded(["a", "b"], [5, 1], 60)).toBe(2);
    expect(await keyStore.claimLeastLoaded(["a", "b"], [5, 1], 60)).toBe(2);
    expect(await keyStore.claimLeastLoaded(["a", "b"], [5, 1], 60)).toBe(2);
    expect(await keyStore.claimLeastLoaded(["a", "b"], [5, 1], 60)).toBe(2);
    // b has now taken 4, so 1 + 4 ties a's 5 and the strict comparison leaves a first
    expect(await keyStore.claimLeastLoaded(["a", "b"], [5, 1], 60)).toBe(1);
  });

  test("returns 0 for no candidates", async () => {
    expect(await inMemoryKeyStore().claimLeastLoaded([], [], 60)).toBe(0);
  });
});
