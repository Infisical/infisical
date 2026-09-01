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
    expect(scores.get(GW_A)?.base).toBe(0);
    expect(scores.get(GW_B)?.base).toBe(0);
    void tracker.shutdown();
  });

  test("counts open channels on top of a report and releases them on close", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    await tracker.recordReportedLoad(GW_A, 0);
    await tracker.recordReportedLoad(GW_B, 0);
    await vi.advanceTimersByTimeAsync(1_000);

    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_B);
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_A)?.base).toBe(2);
    expect((await tracker.getScores([GW_A, GW_B])).get(GW_B)?.base).toBe(1);

    tracker.channelClosed(GW_A);
    tracker.channelClosed(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.base).toBe(0);

    void tracker.shutdown();
  });

  // Reservations are only ever read by the claim script, so that is where they have to be observed.
  // getScores deliberately does not fold them in, or every decision would fetch them twice.
  test("a reservation steers the next claim away before the channel opens", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    await tracker.reserve(GW_A);
    // Without this the second concurrent selection would read zero and stampede the same gateway.
    expect(
      await tracker.claimLeastLoaded([
        { id: GW_A, base: 0 },
        { id: GW_B, base: 0 }
      ])
    ).toBe(GW_B);

    tracker.shutdown();
  });

  test("hands the reservation off to the channel instead of double counting", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    await tracker.recordReportedLoad(GW_A, 0);
    await vi.advanceTimersByTimeAsync(1_000);

    await tracker.reserve(GW_A);
    // The channel now carries the load the reservation stood in for. Counting both would show A at
    // two for one connection.
    tracker.channelOpened(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.base).toBe(1);
    // Equal bases with the reservation released is a tie, which the script gives to the first entry.
    // Had the reservation survived the handoff, A would total two and B would win.
    expect(
      await tracker.claimLeastLoaded([
        { id: GW_A, base: 1 },
        { id: GW_B, base: 1 }
      ])
    ).toBe(GW_A);

    tracker.channelClosed(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.base).toBe(0);

    tracker.shutdown();
  });

  test("releases a reservation whose channel never opens", async () => {
    const keyStore = inMemoryKeyStore();
    const tracker = initGatewayLoadTracker(keyStore);

    for (let i = 0; i < 10; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await tracker.reserve(GW_A);
    }
    expect(
      await tracker.claimLeastLoaded([
        { id: GW_A, base: 0 },
        { id: GW_B, base: 5 }
      ])
    ).toBe(GW_B);

    // Left to accumulate these would turn the score into "selections in the last N seconds", which
    // is request-count round-robin rather than occupancy.
    await vi.advanceTimersByTimeAsync(240_000);
    expect(
      await tracker.claimLeastLoaded([
        { id: GW_A, base: 0 },
        { id: GW_B, base: 5 }
      ])
    ).toBe(GW_A);

    tracker.shutdown();
  });

  test("prefers the gateway's own count over the platform's partial view", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    // The platform only ever sees channels it opened itself. A PAM CLI session dials the relay
    // directly, so without the gateway's own count this member would score 0 and look idle.
    tracker.channelOpened(GW_A);
    await tracker.recordReportedLoad(GW_A, 50);

    expect((await tracker.getScores([GW_A])).get(GW_A)?.base).toBe(50);

    void tracker.shutdown();
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

    expect((await tracker.getScores([GW_A])).get(GW_A)?.base).toBe(6);

    void tracker.shutdown();
  });

  test("does not sum its own view into the gateway's count", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    // The reported 3 already includes the 3 this pod opened before the report; summing would say 6.
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    await vi.advanceTimersByTimeAsync(1_000);
    await tracker.recordReportedLoad(GW_A, 3);

    expect((await tracker.getScores([GW_A])).get(GW_A)?.base).toBe(3);

    void tracker.shutdown();
  });

  test("still adds reservations on top of a reported count", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    // A reservation covers a channel the gateway has not seen yet, so it is additive to the report.
    await tracker.recordReportedLoad(GW_A, 4);
    await tracker.reserve(GW_A);

    const base = (await tracker.getScores([GW_A])).get(GW_A)?.base;
    expect(base).toBe(4);
    expect(
      await tracker.claimLeastLoaded([
        { id: GW_A, base: 4 },
        { id: GW_B, base: 4 }
      ])
    ).toBe(GW_B);

    tracker.shutdown();
  });

  test("flags a gateway too old to report instead of inventing a count for it", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    // Selection refuses to compare a pool containing this member, so scoring it from the channels
    // we happened to open would only be a number that looks like an occupancy without being one.
    tracker.channelOpened(GW_A);
    tracker.channelOpened(GW_A);
    await tracker.recordReportedLoad(GW_B, 7);

    const scores = await tracker.getScores([GW_A, GW_B]);
    expect(scores.get(GW_A)).toEqual({ base: 0, reported: false });
    expect(scores.get(GW_B)).toEqual({ base: 7, reported: true });

    void tracker.shutdown();
  });

  test("stops trusting a gateway that goes quiet", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    await tracker.recordReportedLoad(GW_A, 40);
    tracker.channelOpened(GW_A);
    expect((await tracker.getScores([GW_A])).get(GW_A)?.base).toBe(40);

    // Past the freshness window the stale 40 must not pin the member out of rotation forever. It
    // drops to unreported, which takes the whole pool off load-aware selection.
    await vi.advanceTimersByTimeAsync(40_000);
    expect((await tracker.getScores([GW_A])).get(GW_A)).toEqual({ base: 0, reported: false });

    void tracker.shutdown();
  });

  test("claims the least loaded member and reserves it in the same call", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    const claimed = await tracker.claimLeastLoaded([
      { id: GW_A, base: 9 },
      { id: GW_B, base: 1 }
    ]);

    expect(claimed).toBe(GW_B);
    // Claiming and reserving must be one operation, otherwise concurrent selections all read the
    // same minimum before any of them writes and every one of them routes to it. Repeating the call
    // with the same bases has to move, which only happens if the first claim also wrote.
    expect(
      await tracker.claimLeastLoaded([
        { id: GW_A, base: 1 },
        { id: GW_B, base: 1 }
      ])
    ).toBe(GW_A);

    void tracker.shutdown();
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

    void tracker.shutdown();
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

    void tracker.shutdown();
  });

  test("claims nothing when given no candidates", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());
    expect(await tracker.claimLeastLoaded([])).toBeUndefined();
    void tracker.shutdown();
  });

  test("marks and reports suspect gateways", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    await tracker.markSuspect(GW_A);
    const suspect = await tracker.getSuspect([GW_A, GW_B]);

    expect(suspect.has(GW_A)).toBe(true);
    expect(suspect.has(GW_B)).toBe(false);
    void tracker.shutdown();
  });

  test("returns empty results for an empty gateway list without touching the store", async () => {
    const tracker = initGatewayLoadTracker(inMemoryKeyStore());

    expect((await tracker.getScores([])).size).toBe(0);
    expect((await tracker.getSuspect([])).size).toBe(0);
    void tracker.shutdown();
  });
});
