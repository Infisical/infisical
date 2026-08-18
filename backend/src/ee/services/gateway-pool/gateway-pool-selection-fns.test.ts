import { TGatewayScore } from "@app/lib/gateway-v2/gateway-load-tracker";

import { chooseLeastLoadedGateway, pickRandomGateway } from "./gateway-pool-selection-fns";

// Every member reports unless a test says otherwise; a mixed pool is covered separately.
const reported = (entries: Record<string, number>): Map<string, TGatewayScore> =>
  new Map(Object.entries(entries).map(([id, score]) => [id, { score, reported: true }]));

const gateways = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("chooseLeastLoadedGateway", () => {
  test("returns undefined when there are no candidates", () => {
    expect(chooseLeastLoadedGateway([], new Map())).toBeUndefined();
  });

  test("returns the only candidate without consulting scores", () => {
    const random = vi.fn();
    expect(chooseLeastLoadedGateway([{ id: "a" }], new Map(), random)).toEqual({ id: "a" });
    expect(random).not.toHaveBeenCalled();
  });

  test("takes the clear minimum alone when the runner-up is not close", () => {
    const scores = reported({ a: 10, b: 1, c: 4 });

    for (let i = 0; i < 500; i += 1) {
      expect(chooseLeastLoadedGateway(gateways, scores)).toEqual({ id: "b" });
    }
  });

  test("spreads across members that tie exactly", () => {
    const scores = reported({ a: 10, b: 1, c: 1 });

    const picked = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      picked.add(chooseLeastLoadedGateway(gateways, scores)!.id);
    }

    expect(picked).toEqual(new Set(["b", "c"]));
  });

  test("a single reservation is decisive, so a concurrent selection moves on", () => {
    // A reservation is worth exactly +1. If a tie band of 1 were tolerated it would cancel the
    // reservation out and re-shortlist the member the previous selection just claimed.
    const pair = [{ id: "a" }, { id: "b" }];
    const afterReservingA = reported({ a: 1, b: 0 });

    for (let i = 0; i < 500; i += 1) {
      expect(chooseLeastLoadedGateway(pair, afterReservingA)).toEqual({ id: "b" });
    }
  });

  test("does not hand a two-member pool a coin flip when one is busier", () => {
    // Two gateways is the common HA pool size. Always shortlisting both would make the load score
    // a no-op there and leave the pool behaving exactly like the old random selection.
    const pair = [{ id: "a" }, { id: "b" }];
    const scores = reported({ a: 8, b: 0 });

    for (let i = 0; i < 500; i += 1) {
      expect(chooseLeastLoadedGateway(pair, scores)).toEqual({ id: "b" });
    }
  });

  test("never sends half the traffic to a near-saturated member", () => {
    const scores = reported({ a: 0, b: 99, c: 100 });

    for (let i = 0; i < 500; i += 1) {
      expect(chooseLeastLoadedGateway(gateways, scores)).toEqual({ id: "a" });
    }
  });

  test("does not compare a member it has no data for", () => {
    // c is absent entirely, so the set is not on one scale. Guessing it is idle would pull traffic
    // toward the one member we know least about.
    const scores = reported({ a: 5, b: 5 });
    const picked = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      picked.add(chooseLeastLoadedGateway(gateways, scores)!.id);
    }
    expect(picked).toEqual(new Set(["a", "b", "c"]));
  });

  test("gives a mixed-version pool no load awareness rather than a biased guess", () => {
    // b is too old to report, so its score covers only platform-opened channels and is strictly
    // lower than a reporting peer's true occupancy. Comparing them would favour b all rollout long.
    const mixed = new Map([
      ["a", { score: 40, reported: true }],
      ["b", { score: 0, reported: false }],
      ["c", { score: 41, reported: true }]
    ]);

    const tally: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i += 1) {
      tally[chooseLeastLoadedGateway(gateways, mixed)!.id] += 1;
    }

    // Uniform, not "b wins every time".
    for (const id of ["a", "b", "c"]) expect(tally[id]).toBeGreaterThan(700);
  });

  test("uses load awareness when every member reports", () => {
    const scores = reported({ a: 40, b: 0, c: 41 });
    for (let i = 0; i < 500; i += 1) {
      expect(chooseLeastLoadedGateway(gateways, scores)).toEqual({ id: "b" });
    }
  });

  test("uses load awareness when no member reports, since the scale is consistent", () => {
    const legacy = new Map([
      ["a", { score: 9, reported: false }],
      ["b", { score: 1, reported: false }],
      ["c", { score: 8, reported: false }]
    ]);
    for (let i = 0; i < 500; i += 1) {
      expect(chooseLeastLoadedGateway(gateways, legacy)).toEqual({ id: "b" });
    }
  });

  test("reaches every member when the pool is idle and all scores tie", () => {
    // A deterministic tie-break would shortlist the same two members forever, so a third gateway
    // would sit unused for as long as the pool stays idle. That is the common case, not an edge case.
    const seen = new Set<string>();
    for (let i = 0; i < 3000; i += 1) {
      seen.add(chooseLeastLoadedGateway(gateways, new Map())!.id);
    }
    expect(seen).toEqual(new Set(["a", "b", "c"]));
  });

  test("spreads an idle pool roughly evenly", () => {
    const tally: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 30_000; i += 1) {
      tally[chooseLeastLoadedGateway(gateways, new Map())!.id] += 1;
    }
    // Uniform would be 10,000 each. Loose bound: this asserts nobody is starved, not an exact ratio.
    for (const id of ["a", "b", "c"]) {
      expect(tally[id]).toBeGreaterThan(7_000);
    }
  });

  test("still prefers the least loaded once scores differ", () => {
    const scores = reported({ a: 50, b: 0, c: 1 });

    // Whatever the shuffle does, the heavily loaded member must never be shortlisted.
    for (let i = 0; i < 500; i += 1) {
      expect(chooseLeastLoadedGateway(gateways, scores)!.id).not.toBe("a");
    }
  });

  test("does not mutate the caller's candidate array", () => {
    const input = [{ id: "c" }, { id: "a" }, { id: "b" }];
    chooseLeastLoadedGateway(input, new Map(), () => 0);
    expect(input.map((g) => g.id)).toEqual(["c", "a", "b"]);
  });
});

describe("pickRandomGateway", () => {
  test("returns undefined when there are no candidates", () => {
    expect(pickRandomGateway([], () => 0)).toBeUndefined();
  });

  test("can reach every candidate", () => {
    expect(pickRandomGateway(gateways, () => 0)).toEqual({ id: "a" });
    expect(pickRandomGateway(gateways, () => 0.5)).toEqual({ id: "b" });
    expect(pickRandomGateway(gateways, () => 0.99)).toEqual({ id: "c" });
  });
});
