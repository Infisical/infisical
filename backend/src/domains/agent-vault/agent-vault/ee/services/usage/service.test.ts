import { RuleViolationError } from "@app/domains/lib/errors";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { Meter, Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AgentVaultFreeUsageThreshold } from "../../../ce/models/agent-vault-access-state";
import { FreeUsageCache } from "../../data-access/free-usage-cache";
import { AgentVaultUsageService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ROOT_ORG_ID = "org-root";

const build = (isCloud = true, agentVault: boolean | null = false) => {
  const usageMeteringService = { recordMeteringEvents: vi.fn() };
  const freeUsageCache = new FreeUsageCache(new InMemoryKeyStore());
  const service = new AgentVaultUsageService(
    {
      getInstanceEntitlements: () => ({ isCloud: () => isCloud }) as never,
      getPlan: async () => Plan.restore({ ...testFeatures(), agentVault })
    },
    usageMeteringService,
    { resolveRootOrgId: async () => ROOT_ORG_ID },
    freeUsageCache
  );
  return { service, usageMeteringService, freeUsageCache };
};

const report = { orgId: "org-sub", reportId: "report-1", endedAt: new Date(), brokered: 100 };

describe("AgentVaultUsageService.recordProxyUsage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("should count the report at the root org and send it as one event keyed by the proxy's report id and time", async () => {
    // Setup
    const { service, usageMeteringService, freeUsageCache } = build();

    // Action
    await service.recordProxyUsage(report);

    // Assert
    expect(await freeUsageCache.read(ROOT_ORG_ID, new Date())).toBe(100);
    expect(usageMeteringService.recordMeteringEvents).toHaveBeenCalledWith("org-sub", [
      { eventId: "report-1", meter: Meter.AgentVaultBrokeredRequests, quantity: 100, occurredAt: report.endedAt }
    ]);
  });

  test("should ignore a resent report entirely", async () => {
    // Setup
    const { service, usageMeteringService, freeUsageCache } = build();
    await service.recordProxyUsage(report);

    // Action
    await service.recordProxyUsage(report);

    // Assert
    expect(await freeUsageCache.read(ROOT_ORG_ID, new Date())).toBe(100);
    expect(usageMeteringService.recordMeteringEvents).toHaveBeenCalledTimes(1);
  });

  test("should count a report in the month Infisical received it, not the month it ended", async () => {
    // Setup
    vi.useFakeTimers({ now: new Date("2026-12-01T00:00:30Z"), toFake: ["Date"] });
    const { service, freeUsageCache } = build();

    // Action
    await service.recordProxyUsage({ ...report, endedAt: new Date("2026-11-30T23:59:50Z") });

    // Assert
    expect(await freeUsageCache.read(ROOT_ORG_ID, new Date("2026-12-15T00:00:00Z"))).toBe(100);
    expect(await freeUsageCache.read(ROOT_ORG_ID, new Date("2026-11-15T00:00:00Z"))).toBe(0);
  });

  test("should count and send nothing for an empty report or on self-hosted", async () => {
    // Setup
    const cloud = build();
    const selfHosted = build(false);

    // Action
    await cloud.service.recordProxyUsage({ ...report, brokered: 0 });
    await selfHosted.service.recordProxyUsage(report);

    // Assert
    expect(cloud.usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
    expect(selfHosted.usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
    expect(await selfHosted.freeUsageCache.read(ROOT_ORG_ID, new Date())).toBe(0);
  });

  test("should still send a report to metering when counting it fails", async () => {
    // Setup
    const { service, usageMeteringService, freeUsageCache } = build();
    vi.spyOn(freeUsageCache, "add").mockRejectedValue(new Error("redis down"));

    // Action
    await service.recordProxyUsage(report);

    // Assert
    expect(usageMeteringService.recordMeteringEvents).toHaveBeenCalledWith("org-sub", [
      { eventId: "report-1", meter: Meter.AgentVaultBrokeredRequests, quantity: 100, occurredAt: report.endedAt }
    ]);
  });

  test("should reject and send nothing when the report can't be claimed", async () => {
    // Setup
    const { service, usageMeteringService, freeUsageCache } = build();
    vi.spyOn(freeUsageCache, "claimReport").mockRejectedValue(new Error("redis down"));

    // Action, Assert
    await expect(service.recordProxyUsage(report)).rejects.toThrow("redis down");
    expect(usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
  });

  test("should accept a self-hosted report whatever the proxy's clock says", async () => {
    // Setup
    const { service, usageMeteringService } = build(false);
    const ahead = new Date(Date.now() + 10 * 60_000);

    // Action, Assert
    await expect(service.recordProxyUsage({ ...report, endedAt: ahead })).resolves.toEqual([]);
    expect(usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
  });

  test("should refuse a report older than a week", async () => {
    // Setup
    const { service, usageMeteringService } = build();
    const old = new Date(Date.now() - 8 * 24 * 60 * 60_000);

    // Action, Assert
    await expect(service.recordProxyUsage({ ...report, endedAt: old })).rejects.toThrow(RuleViolationError);
    expect(usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
  });

  test("should count and bill a report from a proxy whose clock runs ahead, at Infisical's time", async () => {
    // Setup
    const now = new Date("2026-11-17T10:00:00Z");
    vi.useFakeTimers({ now, toFake: ["Date"] });
    const { service, usageMeteringService, freeUsageCache } = build();
    const ahead = new Date(now.getTime() + 10 * 60_000);

    // Action
    await service.recordProxyUsage({ ...report, endedAt: ahead });

    // Assert
    expect(await freeUsageCache.read(ROOT_ORG_ID, now)).toBe(100);
    expect(usageMeteringService.recordMeteringEvents).toHaveBeenCalledWith("org-sub", [
      { eventId: "report-1", meter: Meter.AgentVaultBrokeredRequests, quantity: 100, occurredAt: now }
    ]);
  });

  test("should return a warning once when the count passes 75%, and nothing for later reports", async () => {
    // Setup
    const { service } = build();
    await service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 3_700 });

    // Action
    const crossing = await service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 100 });
    const after = await service.recordProxyUsage({ ...report, reportId: "r-3", brokered: 100 });

    // Assert
    expect(crossing).toEqual([
      expect.objectContaining({ rootOrgId: ROOT_ORG_ID, threshold: AgentVaultFreeUsageThreshold.Warning, limit: 5_000 })
    ]);
    expect(after).toEqual([]);
  });

  test("should return nothing below 75%", async () => {
    // Setup
    const { service } = build();

    // Action
    const crossing = await service.recordProxyUsage({ ...report, brokered: 3_749 });

    // Assert
    expect(crossing).toEqual([]);
  });

  test("should return both thresholds when one report passes both", async () => {
    // Setup
    const { service } = build();

    // Action
    const crossing = await service.recordProxyUsage({ ...report, brokered: 5_200 });

    // Assert
    expect(crossing.map((c) => c.threshold)).toEqual([
      AgentVaultFreeUsageThreshold.Warning,
      AgentVaultFreeUsageThreshold.Limit
    ]);
  });

  test("should return a threshold once even when two reports cross it at the same time", async () => {
    // Setup
    const { service, freeUsageCache } = build();
    await freeUsageCache.claimNotice(ROOT_ORG_ID, new Date(), AgentVaultFreeUsageThreshold.Limit);

    // Action
    const crossing = await service.recordProxyUsage({ ...report, brokered: 5_000 });

    // Assert
    expect(crossing.map((c) => c.threshold)).toEqual([AgentVaultFreeUsageThreshold.Warning]);
  });

  test.each([
    ["a plan that includes Agent Vault", true],
    ["a plan that says nothing", null]
  ] as const)("should return nothing for %s", async (_, agentVault) => {
    // Setup
    const { service } = build(true, agentVault);

    // Action
    const crossing = await service.recordProxyUsage({ ...report, brokered: 5_200 });

    // Assert
    expect(crossing).toEqual([]);
  });

  test("should return nothing on self-hosted", async () => {
    // Setup
    const { service } = build(false);

    // Action
    const crossing = await service.recordProxyUsage({ ...report, brokered: 5_200 });

    // Assert
    expect(crossing).toEqual([]);
  });
});
