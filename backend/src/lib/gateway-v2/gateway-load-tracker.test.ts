import { KeyStorePrefixes } from "@app/keystore/keystore";
import { inMemoryKeyStore } from "@app/keystore/memory";

import { initGatewayLoadTracker } from "./gateway-load-tracker";

vi.mock("@app/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

const GW_A = "11111111-1111-1111-1111-111111111111";
const GW_B = "22222222-2222-2222-2222-222222222222";

// The debounce means a publish lands on a later tick of the event loop.
const flushPublishes = async () => {
  await vi.advanceTimersByTimeAsync(500);
};

describe("gatewayLoadTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("scores an idle gateway at zero", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());
    const scores = await tracker.getScores([GW_A, GW_B]);
    expect(scores.get(GW_A)).toBe(0);
    expect(scores.get(GW_B)).toBe(0);
    tracker.shutdown();
  });

  test("counts open channels and releases them on close", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_B);
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_A)).toBe(2);
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_B)).toBe(1);

    tracker.channelClosed(GW_A);
    tracker.channelClosed(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)).toBe(0);

    tracker.shutdown();
  });

  test("a reservation counts toward the score before the channel opens", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await tracker.reserve(GW_A);
    // Without this the second concurrent selection would read zero and stampede the same gateway.
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_A)).toBe(1);
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_B)).toBe(0);

    tracker.shutdown();
  });

  test("releases reservations so repeated selections do not accumulate into round-robin", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tracker.reserve(GW_A);
    }
    expect((await tracker.getScores([GW_A])).get(GW_A)).toBe(10);

    // Left to expire on their own these would keep counting and turn the score into
    // "selections in the last N seconds", which is request-count round-robin.
    await vi.advanceTimersByTimeAsync(6_000);
    expect((await tracker.getScores([GW_A])).get(GW_A)).toBe(0);

    tracker.shutdown();
  });

  test("sums another pod's published count alongside local channels", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await keyStore.hashSet(KeyStorePrefixes.GatewayLoad(GW_A), "other-pod", `5:${Date.now()}`);
    tracker.channelOpened(GW_A);

    expect((await tracker.getScores([GW_A])).get(GW_A)).toBe(6);
    tracker.shutdown();
  });

  test("ignores a dead pod's stale count instead of counting it forever", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await keyStore.hashSet(KeyStorePrefixes.GatewayLoad(GW_A), "dead-pod", `9:${Date.now() - 120_000}`);

    expect((await tracker.getScores([GW_A])).get(GW_A)).toBe(0);
    tracker.shutdown();
  });

  test("ignores a malformed published entry rather than scoring NaN", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await keyStore.hashSet(KeyStorePrefixes.GatewayLoad(GW_A), "bad-pod", "not-a-count");

    expect((await tracker.getScores([GW_A])).get(GW_A)).toBe(0);
    tracker.shutdown();
  });

  test("drops its own field once it holds nothing, so the hash does not grow per restart", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    tracker.channelOpened(GW_A);
    await flushPublishes();
    expect(Object.keys(await keyStore.hashGetAll(KeyStorePrefixes.GatewayLoad(GW_A)))).toHaveLength(1);

    tracker.channelClosed(GW_A);
    await flushPublishes();
    expect(Object.keys(await keyStore.hashGetAll(KeyStorePrefixes.GatewayLoad(GW_A)))).toHaveLength(0);

    tracker.shutdown();
  });

  test("does not double count its own published field against its live count", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    tracker.channelOpened(GW_A);
    await flushPublishes();

    expect((await tracker.getScores([GW_A])).get(GW_A)).toBe(1);
    tracker.shutdown();
  });

  test("marks and reports suspect gateways", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    await tracker.markSuspect(GW_A);
    const suspect = await tracker.getSuspect([GW_A, GW_B]);

    expect(suspect.has(GW_A)).toBe(true);
    expect(suspect.has(GW_B)).toBe(false);
    tracker.shutdown();
  });

  test("returns empty results for an empty gateway list without touching the store", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    expect((await tracker.getScores([])).size).toBe(0);
    expect((await tracker.getSuspect([])).size).toBe(0);
    tracker.shutdown();
  });
});
