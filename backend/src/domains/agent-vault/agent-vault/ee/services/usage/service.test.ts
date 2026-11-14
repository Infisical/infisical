import { RuleViolationError } from "@app/domains/lib/errors";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { Meter } from "@app/domains/platform/license/ce/module";

import { FreeUsageCache } from "../../data-access/free-usage-cache";
import { AgentVaultUsageService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ROOT_ORG_ID = "org-root";

const build = (isCloud = true) => {
  const usageMeteringService = { recordMeteringEvents: vi.fn() };
  const freeUsageCache = new FreeUsageCache(new InMemoryKeyStore());
  const service = new AgentVaultUsageService(
    { getInstanceEntitlements: () => ({ isCloud: () => isCloud }) as never },
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

  test("should refuse a report dated too far from now", async () => {
    // Setup
    const { service, usageMeteringService } = build();
    const ahead = new Date(Date.now() + 10 * 60_000);
    const old = new Date(Date.now() - 8 * 24 * 60 * 60_000);

    // Action, Assert
    await expect(service.recordProxyUsage({ ...report, endedAt: ahead })).rejects.toThrow(RuleViolationError);
    await expect(service.recordProxyUsage({ ...report, endedAt: old })).rejects.toThrow(RuleViolationError);
    expect(usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
  });
});
