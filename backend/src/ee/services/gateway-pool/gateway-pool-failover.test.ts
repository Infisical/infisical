import { BadRequestError, GatewayTransportError } from "@app/lib/errors";

type TDeps = Parameters<typeof import("./gateway-pool-service").gatewayPoolServiceFactory>[0];

const markSuspect = vi.fn();
const getSuspect = vi.fn().mockResolvedValue(new Set<string>());
const getScores = vi.fn();
const reserve = vi.fn();
const claimLeastLoaded = vi.fn();

vi.mock("@app/lib/logger", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

vi.mock("@app/lib/gateway-v2/gateway-load-tracker", () => ({
  getGatewayLoadTracker: () => ({ markSuspect, getSuspect, getScores, reserve, claimLeastLoaded })
}));

// eslint-disable-next-line import/first
import { gatewayPoolServiceFactory } from "./gateway-pool-service";

const POOL_ID = "11111111-1111-1111-1111-111111111111";
const MEMBERS: { id: string; capabilities?: unknown }[] = [{ id: "gw-a" }, { id: "gw-b" }, { id: "gw-c" }];

const buildService = (members = MEMBERS) =>
  gatewayPoolServiceFactory({
    gatewayPoolDAL: { findById: vi.fn().mockResolvedValue({ id: POOL_ID, orgId: "org" }) },
    gatewayPoolMembershipDAL: { findHealthyGatewaysByPoolId: vi.fn().mockResolvedValue(members) },
    gatewayV2DAL: { findById: vi.fn() },
    permissionService: {},
    licenseService: { getPlan: vi.fn() },
    identityKubernetesAuthDAL: {},
    pkiDiscoveryConfigDAL: {},
    appConnectionDAL: {},
    dynamicSecretDAL: {}
  } as unknown as TDeps);

describe("selectGatewayFromPool under load-tracker failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations, so a rejection set by one test would leak into the next.
    markSuspect.mockResolvedValue(undefined);
    reserve.mockResolvedValue(undefined);
    // Without this the load-aware branch throws and every test silently measures the random fallback.
    claimLeastLoaded.mockImplementation(async (c: { id: string }[]) => c[0]?.id);
    getSuspect.mockResolvedValue(new Set<string>());
    getScores.mockResolvedValue(new Map(MEMBERS.map((m) => [m.id, { score: 0, base: 0, reported: true }])));
  });

  test("still selects, and spreads, when Redis reads fail", async () => {
    const svc = buildService();
    getScores.mockRejectedValue(new Error("ECONNREFUSED"));

    const picked = new Set<string>();
    for (let i = 0; i < 300; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      picked.add((await svc.selectGatewayFromPool({ poolId: POOL_ID })).id);
    }

    // A Redis outage must degrade to random selection, never fail the request.
    expect(picked).toEqual(new Set(["gw-a", "gw-b", "gw-c"]));
  });

  test("still selects when the suspect lookup fails", async () => {
    const svc = buildService();
    getSuspect.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(svc.selectGatewayFromPool({ poolId: POOL_ID })).resolves.toBeDefined();
  });

  test("a failed reservation write does not fail the selection", async () => {
    const svc = buildService();
    reserve.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(svc.selectGatewayFromPool({ poolId: POOL_ID })).resolves.toBeDefined();
  });

  test("skips a suspect member but still routes when every member is suspect", async () => {
    const svc = buildService();
    getSuspect.mockResolvedValue(new Set(["gw-a"]));
    const picked = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      picked.add((await svc.selectGatewayFromPool({ poolId: POOL_ID })).id);
    }
    expect(picked.has("gw-a")).toBe(false);

    getSuspect.mockResolvedValue(new Set(["gw-a", "gw-b", "gw-c"]));
    // Refusing to route at all would be a guaranteed outage; the marks may simply have aged badly.
    await expect(svc.selectGatewayFromPool({ poolId: POOL_ID })).resolves.toBeDefined();
  });

  test("actually uses the load-aware claim, not the random fallback", async () => {
    const svc = buildService();
    claimLeastLoaded.mockResolvedValue("gw-c");

    for (let i = 0; i < 50; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect((await svc.selectGatewayFromPool({ poolId: POOL_ID })).id).toBe("gw-c");
    }
    expect(claimLeastLoaded).toHaveBeenCalled();
    // The atomic claim already reserved, so no separate write should follow it.
    expect(reserve).not.toHaveBeenCalled();
  });

  test("keeps the suspect filter when the load path fails", async () => {
    const svc = buildService();
    getSuspect.mockResolvedValue(new Set(["gw-a"]));
    // Anything after the suspect read blowing up must not re-admit the member that just failed.
    claimLeastLoaded.mockRejectedValue(new Error("EVAL failed"));

    const picked = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      picked.add((await svc.selectGatewayFromPool({ poolId: POOL_ID })).id);
    }
    expect(picked.has("gw-a")).toBe(false);
    expect(picked).toEqual(new Set(["gw-b", "gw-c"]));
  });

  test("404s an unknown pool rather than blaming gateway health", async () => {
    const svc = gatewayPoolServiceFactory({
      gatewayPoolDAL: { findById: vi.fn().mockResolvedValue(undefined) },
      gatewayPoolMembershipDAL: { findHealthyGatewaysByPoolId: vi.fn() },
      gatewayV2DAL: { findById: vi.fn() },
      permissionService: {},
      licenseService: { getPlan: vi.fn() },
      identityKubernetesAuthDAL: {},
      pkiDiscoveryConfigDAL: {},
      appConnectionDAL: {},
      dynamicSecretDAL: {}
    } as unknown as TDeps);

    await expect(svc.selectGatewayFromPool({ poolId: POOL_ID })).rejects.toThrow(
      `Gateway pool with ID '${POOL_ID}' not found`
    );
  });

  test("applies a capability filter before anything else, so HSM cannot land on a bare gateway", async () => {
    const svc = gatewayPoolServiceFactory({
      gatewayPoolDAL: { findById: vi.fn().mockResolvedValue({ id: POOL_ID, orgId: "org" }) },
      gatewayPoolMembershipDAL: {
        findHealthyGatewaysByPoolId: vi.fn().mockResolvedValue([
          { id: "gw-a", capabilities: {} },
          { id: "gw-hsm", capabilities: { pkcs11: true } },
          { id: "gw-c", capabilities: null }
        ])
      },
      gatewayV2DAL: { findById: vi.fn() },
      permissionService: {},
      licenseService: { getPlan: vi.fn() },
      identityKubernetesAuthDAL: {},
      pkiDiscoveryConfigDAL: {},
      appConnectionDAL: {},
      dynamicSecretDAL: {}
    } as unknown as TDeps);

    for (let i = 0; i < 200; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const picked = await svc.selectGatewayFromPool({
        poolId: POOL_ID,
        filter: (g) => (g.capabilities as { pkcs11?: boolean } | null)?.pkcs11 === true
      });
      expect(picked.id).toBe("gw-hsm");
    }
  });

  test("reports the caller's message when a filter excludes every member", async () => {
    const svc = buildService([{ id: "gw-a", capabilities: {} }]);

    await expect(
      svc.selectGatewayFromPool({
        poolId: POOL_ID,
        filter: () => false,
        unavailableMessage: "No HSM-capable gateway available in the pool."
      })
    ).rejects.toThrow("No HSM-capable gateway available in the pool.");
  });
});

describe("runWithPoolFailover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks keeps implementations, so a rejection set by one test would leak into the next.
    markSuspect.mockResolvedValue(undefined);
    reserve.mockResolvedValue(undefined);
    getSuspect.mockResolvedValue(new Set<string>());
    getScores.mockResolvedValue(new Map(MEMBERS.map((m) => [m.id, { score: 0, base: 0, reported: true }])));
  });

  test("returns the result and the member it ran on", async () => {
    const svc = buildService();
    const out = await svc.runWithPoolFailover({ poolId: POOL_ID }, async () => "done");

    expect(out.result).toBe("done");
    expect(MEMBERS.map((m) => m.id)).toContain(out.gatewayId);
  });

  test("retries on another member when no tunnel was established", async () => {
    const svc = buildService();
    const seen: string[] = [];

    const out = await svc.runWithPoolFailover({ poolId: POOL_ID }, async (gatewayId) => {
      seen.push(gatewayId);
      if (seen.length === 1) throw new GatewayTransportError({ message: "relay unreachable", gatewayId });
      return "recovered";
    });

    expect(out.result).toBe("recovered");
    expect(seen).toHaveLength(2);
    expect(seen[0]).not.toBe(seen[1]);
  });

  test("never retries a failure raised after the target was reached", async () => {
    const svc = buildService();
    const seen: string[] = [];

    // The defining safety property: a rotation that half-applied must not run twice.
    await expect(
      svc.runWithPoolFailover({ poolId: POOL_ID }, async (gatewayId) => {
        seen.push(gatewayId);
        throw new BadRequestError({ message: "password authentication failed" });
      })
    ).rejects.toThrow("password authentication failed");

    expect(seen).toHaveLength(1);
  });

  test("stops at the attempt cap instead of walking the whole pool", async () => {
    const svc = buildService();
    const seen: string[] = [];

    await expect(
      svc.runWithPoolFailover({ poolId: POOL_ID }, async (gatewayId) => {
        seen.push(gatewayId);
        throw new GatewayTransportError({ message: "relay unreachable", gatewayId });
      })
    ).rejects.toThrow("relay unreachable");

    // Two attempts, not three: retrying every member multiplies load onto whatever is still up.
    expect(seen).toHaveLength(2);
  });

  test("surfaces the transport failure, not a selection error, once members run out", async () => {
    const svc = buildService([{ id: "only-one" }]);

    await expect(
      svc.runWithPoolFailover({ poolId: POOL_ID }, async (gatewayId) => {
        throw new GatewayTransportError({ message: "relay unreachable", gatewayId });
      })
    ).rejects.toThrow("relay unreachable");
  });

  test("runs directly with no selection when a specific gateway is configured", async () => {
    const svc = buildService();
    const out = await svc.runWithPoolFailover({ gatewayId: "pinned" }, async (gatewayId) => gatewayId);

    expect(out).toEqual({ result: "pinned", gatewayId: "pinned" });
    expect(reserve).not.toHaveBeenCalled();
  });

  test("rejects when neither a gateway nor a pool is configured", async () => {
    const svc = buildService();
    await expect(svc.runWithPoolFailover({}, async () => "x")).rejects.toThrow(
      "No gateway or gateway pool is configured."
    );
  });
});
