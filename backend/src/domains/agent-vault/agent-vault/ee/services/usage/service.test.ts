import { RuleViolationError } from "@app/domains/lib/errors";
import { Meter } from "@app/domains/platform/license/ce/module";

import { AgentVaultUsageService } from "./service";

const build = (isCloud = true) => {
  const usageMeteringService = { recordMeteringEvents: vi.fn() };
  const service = new AgentVaultUsageService(
    { getInstanceEntitlements: () => ({ isCloud: () => isCloud }) as never },
    usageMeteringService
  );
  return { service, usageMeteringService };
};

const report = { orgId: "org-1", reportId: "report-1", endedAt: new Date(), brokered: 100 };

describe("AgentVaultUsageService.recordProxyUsage", () => {
  test("should send the report as one event keyed by the proxy's report id and time", () => {
    // Setup
    const { service, usageMeteringService } = build();

    // Action
    service.recordProxyUsage(report);

    // Assert
    expect(usageMeteringService.recordMeteringEvents).toHaveBeenCalledWith("org-1", [
      { eventId: "report-1", meter: Meter.AgentVaultBrokeredRequests, quantity: 100, occurredAt: report.endedAt }
    ]);
  });

  test("should send nothing for an empty report or on self-hosted", () => {
    // Setup
    const cloud = build();
    const selfHosted = build(false);

    // Action
    cloud.service.recordProxyUsage({ ...report, brokered: 0 });
    selfHosted.service.recordProxyUsage(report);

    // Assert
    expect(cloud.usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
    expect(selfHosted.usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
  });

  test("should refuse a report dated too far from now", () => {
    // Setup
    const { service, usageMeteringService } = build();
    const ahead = new Date(Date.now() + 10 * 60_000);
    const old = new Date(Date.now() - 8 * 24 * 60 * 60_000);

    // Action, Assert
    expect(() => service.recordProxyUsage({ ...report, endedAt: ahead })).toThrow(RuleViolationError);
    expect(() => service.recordProxyUsage({ ...report, endedAt: old })).toThrow(RuleViolationError);
    expect(usageMeteringService.recordMeteringEvents).not.toHaveBeenCalled();
  });
});
