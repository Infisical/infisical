import { RuleViolationError } from "@app/domains/lib/errors";
import { InMemoryKeyStore } from "@app/domains/lib/key-store/testing/in-memory-key-store";
import { Meter, Plan } from "@app/domains/platform/license/ce/module";
import { testFeatures } from "@app/domains/platform/license/ce/testing/test-features";

import { AgentVaultFreeUsageThreshold } from "../../../ce/models/agent-vault-access-state";
import { FreeUsageCache } from "../../data-access/free-usage-cache";
import { UsageMonth } from "../../models/usage-month";
import { AgentVaultUsageService } from "./service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));

const ROOT_ORG_ID = "org-root";

const build = (isCloud = true, agentVault: boolean | null = false) => {
  const usageMeteringService = { recordMeteringEvents: vi.fn() };
  const freeUsageCache = new FreeUsageCache(new InMemoryKeyStore());
  const planState = { agentVault };
  const service = new AgentVaultUsageService(
    {
      getInstanceEntitlements: () => ({ isCloud: () => isCloud }) as never,
      getPlan: async () => Plan.restore({ ...testFeatures(), agentVault: planState.agentVault })
    },
    usageMeteringService,
    { resolveRootOrgId: async () => ROOT_ORG_ID },
    freeUsageCache
  );
  return { service, usageMeteringService, freeUsageCache, planState };
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

  test("should return a warning with its percent when the count passes 75%", async () => {
    // Setup
    const { service } = build();
    await service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 3_700 });

    // Action
    const due = await service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 100 });

    // Assert
    expect(due).toEqual([
      expect.objectContaining({
        rootOrgId: ROOT_ORG_ID,
        threshold: AgentVaultFreeUsageThreshold.Warning,
        percent: 75,
        limit: 5_000
      })
    ]);
  });

  test("should return nothing below 75%", async () => {
    // Setup
    const { service } = build();

    // Action
    const due = await service.recordProxyUsage({ ...report, brokered: 3_749 });

    // Assert
    expect(due).toEqual([]);
  });

  test("should return only the limit when one report passes both", async () => {
    // Setup
    const { service } = build();

    // Action
    const due = await service.recordProxyUsage({ ...report, brokered: 5_200 });

    // Assert
    expect(due.map((d) => [d.threshold, d.percent])).toEqual([[AgentVaultFreeUsageThreshold.Limit, 100]]);
  });

  test("should never return the warning once past the limit, even when its send failed", async () => {
    // Setup: one report holds the warning while another passes the limit.
    const { service } = build();
    const [warning] = await service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 3_800 });
    const [limit] = await service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 1_300 });
    await service.releaseNotice(warning);
    await service.completeNotice(limit);

    // Action
    const later = await service.recordProxyUsage({ ...report, reportId: "r-3", brokered: 10 });

    // Assert
    expect(limit.threshold).toBe(AgentVaultFreeUsageThreshold.Limit);
    expect(later).toEqual([]);
  });

  test("should not return a notice again while it's being sent", async () => {
    // Setup
    const { service } = build();
    await service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 3_800 });

    // Action
    const again = await service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 10 });

    // Assert
    expect(again).toEqual([]);
  });

  test("should return a notice to only one of two reports at the same time", async () => {
    // Setup
    const { service } = build();

    // Action
    const [first, second] = await Promise.all([
      service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 3_800 }),
      service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 10 })
    ]);

    // Assert
    expect([...first, ...second].map((d) => d.threshold)).toEqual([AgentVaultFreeUsageThreshold.Warning]);
  });

  test("should never return a notice again this month once it was marked sent", async () => {
    // Setup
    const { service } = build();
    const [due] = await service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 3_800 });
    await service.completeNotice(due);

    // Action
    const again = await service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 10 });

    // Assert
    expect(again).toEqual([]);
  });

  test("should not return a notice that another report sent after this one first saw it unsent", async () => {
    // Setup
    const { service, freeUsageCache } = build();
    const [due] = await service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 3_800 });
    await service.completeNotice(due);
    // The second report read the sent key before the first one marked it.
    vi.spyOn(freeUsageCache, "isNoticeSent").mockResolvedValueOnce(false);

    // Action
    const late = await service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 10 });

    // Assert
    expect(late).toEqual([]);
    expect(await freeUsageCache.lockNotice(ROOT_ORG_ID, UsageMonth.of(new Date()), due.threshold)).toBe(true);
  });

  test("should return a notice again on the next report when sending it failed", async () => {
    // Setup
    const { service } = build();
    const [due] = await service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 3_800 });
    await service.releaseNotice(due);

    // Action
    const retry = await service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 10 });

    // Assert
    expect(retry.map((d) => d.threshold)).toEqual([AgentVaultFreeUsageThreshold.Warning]);
  });

  test("should return the notices on a later report when the org becomes limited after passing them", async () => {
    // Setup: a trial passes both thresholds while its plan includes Agent Vault, then ends.
    const { service, planState } = build(true, true);
    const duringTrial = await service.recordProxyUsage({ ...report, reportId: "r-1", brokered: 5_100 });
    planState.agentVault = false;

    // Action
    const afterTrial = await service.recordProxyUsage({ ...report, reportId: "r-2", brokered: 10 });

    // Assert
    expect(duringTrial).toEqual([]);
    expect(afterTrial.map((d) => d.threshold)).toEqual([AgentVaultFreeUsageThreshold.Limit]);
  });

  test.each([
    ["a plan that includes Agent Vault", true],
    ["a plan that says nothing", null]
  ] as const)("should return nothing for %s", async (_, agentVault) => {
    // Setup
    const { service } = build(true, agentVault);

    // Action
    const due = await service.recordProxyUsage({ ...report, brokered: 5_200 });

    // Assert
    expect(due).toEqual([]);
  });

  test("should return nothing on self-hosted", async () => {
    // Setup
    const { service } = build(false);

    // Action
    const due = await service.recordProxyUsage({ ...report, brokered: 5_200 });

    // Assert
    expect(due).toEqual([]);
  });
});
