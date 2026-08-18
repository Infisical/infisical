import { TGatewayScore } from "@app/lib/gateway-v2/gateway-load-tracker";

import { isPoolComparable, pickRandomGateway, shuffleForTieBreak } from "./gateway-pool-selection-fns";

// Every member reports unless a test says otherwise; a mixed pool is covered separately.
const reported = (entries: Record<string, number>): Map<string, TGatewayScore> =>
  new Map(Object.entries(entries).map(([id, score]) => [id, { score, base: score, reported: true }]));

const gateways = [{ id: "a" }, { id: "b" }, { id: "c" }];

describe("isPoolComparable", () => {
  test("comparable when every member reports", () => {
    expect(isPoolComparable(gateways, reported({ a: 1, b: 2, c: 3 }))).toBe(true);
  });

  test("comparable when no member reports, since the scale is consistent", () => {
    const legacy = new Map(["a", "b", "c"].map((id) => [id, { score: 1, base: 1, reported: false }]));
    expect(isPoolComparable(gateways, legacy)).toBe(true);
  });

  test("not comparable when the pool is mid-rollout", () => {
    const mixed = new Map([
      ["a", { score: 40, base: 40, reported: true }],
      ["b", { score: 0, base: 0, reported: false }],
      ["c", { score: 41, base: 41, reported: true }]
    ]);
    expect(isPoolComparable(gateways, mixed)).toBe(false);
  });

  test("not comparable when a member has no data at all", () => {
    expect(isPoolComparable(gateways, reported({ a: 5, b: 5 }))).toBe(false);
  });
});

describe("shuffleForTieBreak", () => {
  test("reaches every position, which is what randomises ties in the claim", () => {
    const firsts = new Set<string>();
    for (let i = 0; i < 3000; i += 1) {
      firsts.add(shuffleForTieBreak(gateways, Math.random)[0].id);
    }
    expect(firsts).toEqual(new Set(["a", "b", "c"]));
  });

  test("does not mutate the caller's array and keeps every member", () => {
    const input = [{ id: "c" }, { id: "a" }, { id: "b" }];
    const out = shuffleForTieBreak(input, Math.random);
    expect(input.map((g) => g.id)).toEqual(["c", "a", "b"]);
    expect(out.map((g) => g.id).sort()).toEqual(["a", "b", "c"]);
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
