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
    expect(scores.get(GW_A)?.score).toBe(0);
    expect(scores.get(GW_B)?.score).toBe(0);
    tracker.shutdown();
  });

  test("counts open channels and releases them on close", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_B);
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_A)?.score).toBe(2);
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_B)?.score).toBe(1);

    tracker.channelClosed(GW_A);
    tracker.channelClosed(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(0);

    tracker.shutdown();
  });

  test("a reservation counts toward the score before the channel opens", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await tracker.reserve(GW_A);
    // Without this the second concurrent selection would read zero and stampede the same gateway.
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_A)?.score).toBe(1);
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_B)?.score).toBe(0);

    tracker.shutdown();
  });

  test("hands the reservation off to the channel instead of double counting", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await tracker.reserve(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(1);

    // The channel now carries the load the reservation stood in for, so the score must stay at 1
    // rather than counting both.
    tracker.channelOpened(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(1);

    tracker.channelClosed(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(0);

    tracker.shutdown();
  });

  test("releases a reservation whose channel never opens", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tracker.reserve(GW_A);
    }
    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(10);

    // Left to accumulate these would turn the score into "selections in the last N seconds", which
    // is request-count round-robin rather than occupancy.
    await vi.advanceTimersByTimeAsync(240_000);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(0);

    tracker.shutdown();
  });

  test("sums another pod's published count alongside local channels", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await keyStore.hashSet(KeyStorePrefixes.GatewayLoad(GW_A), "other-pod", `5:${Date.now()}`);
    tracker.channelOpened(GW_A);

    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(6);
    tracker.shutdown();
  });

  test("ignores a dead pod's stale count instead of counting it forever", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await keyStore.hashSet(KeyStorePrefixes.GatewayLoad(GW_A), "dead-pod", `9:${Date.now() - 120_000}`);

    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(0);
    tracker.shutdown();
  });

  test("ignores a malformed published entry rather than scoring NaN", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await keyStore.hashSet(KeyStorePrefixes.GatewayLoad(GW_A), "bad-pod", "not-a-count");

    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(0);
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

    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(1);
    tracker.shutdown();
  });

  test("prefers the gateway's own count over the platform's partial view", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    // The platform only ever sees channels it opened itself. A PAM CLI session dials the relay
    // directly, so without the gateway's own count this member would score 0 and look idle.
    tracker.channelOpened(GW_A);
    await tracker.recordReportedLoad(GW_A, 50);

    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(50);

    tracker.shutdown();
  });

  test("adds channels opened since the gateway's last report", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    await tracker.recordReportedLoad(GW_A, 4);
    // Reports land every 10s. Without counting what opened since, every selection inside that window
    // reads the same stale 4 and piles onto this member.
    await vi.advanceTimersByTimeAsync(1_000);
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);

    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(6);

    tracker.shutdown();
  });

  test("does not sum its own view into the gateway's count", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    // The reported 3 already includes the 3 this pod opened before the report; summing would say 6.
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    await vi.advanceTimersByTimeAsync(1_000);
    await tracker.recordReportedLoad(GW_A, 3);

    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(3);

    tracker.shutdown();
  });

  test("still adds reservations on top of a reported count", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    // A reservation covers a channel the gateway has not seen yet, so it is additive.
    await tracker.recordReportedLoad(GW_A, 4);
    await tracker.reserve(GW_A);

    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(5);

    tracker.shutdown();
  });

  test("falls back to the platform's view for a gateway too old to report, and flags the scale", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    await tracker.recordReportedLoad(GW_B, 7);

    const scores = await tracker.getScores([GW_A, GW_B]);
    expect(scores.get(GW_A)).toEqual({ base: 2, score: 2, reported: false });
    expect(scores.get(GW_B)).toEqual({ base: 7, score: 7, reported: true });

    tracker.shutdown();
  });

  test("falls back when a gateway stops reporting", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    await tracker.recordReportedLoad(GW_A, 40);
    tracker.channelOpened(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(40);

    // Past the freshness window the stale 40 must not pin the member out of rotation forever.
    await vi.advanceTimersByTimeAsync(40_000);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.score).toBe(1);

    tracker.shutdown();
  });

  test("claims the least loaded member and reserves it in the same call", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    const claimed = await tracker.claimLeastLoaded([
      { id: GW_A, base: 9 },
      { id: GW_B, base: 1 }
    ]);

    expect(claimed).toBe(GW_B);
    // Claiming and reserving must be one operation, otherwise concurrent selections all read the
    // same minimum before any of them writes and every one of them routes to it. The base passed in
    // is the caller's view; the score here is this gateway's real occupancy plus that reservation.
    expect((await tracker.getScores([GW_B])).get(GW_B)?.score).toBe(1);

    tracker.shutdown();
  });

  test("concurrent claims stop piling on once the minimum catches up", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    // A unique minimum is the stampede case: read-then-write would send all four to the idle member
    // because none of them would see the others' claims. Each claim here raises its reservation, so
    // the traffic moves across once it reaches the busier member's level.
    const claims = await Promise.all(
      Array.from({ length: 4 }, () =>
        tracker.claimLeastLoaded([
          { id: GW_B, base: 2 },
          { id: GW_A, base: 0 }
        ])
      )
    );

    expect(claims.filter((c) => c === GW_A)).toHaveLength(3);
    expect(claims.filter((c) => c === GW_B)).toHaveLength(1);

    tracker.shutdown();
  });

  test("resolves a tie by the order it is given, so callers control the tie-break", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    expect(
      await tracker.claimLeastLoaded([
        { id: GW_A, base: 0 },
        { id: GW_B, base: 0 }
      ])
    ).toBe(GW_A);
    expect(
      await tracker.claimLeastLoaded([
        { id: GW_B, base: 0 },
        { id: GW_A, base: 0 }
      ])
    ).toBe(GW_B);

    tracker.shutdown();
  });

  test("claims nothing when given no candidates", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());
    expect(await tracker.claimLeastLoaded([])).toBeUndefined();
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
