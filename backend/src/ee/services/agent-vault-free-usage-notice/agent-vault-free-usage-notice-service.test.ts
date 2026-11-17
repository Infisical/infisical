import { OrgMembershipStatus } from "@app/db/schemas";
import { AgentVaultFreeUsageThreshold } from "@app/domains/agent-vault/agent-vault/ce/module";
import { SmtpTemplates, TSmtpSendMail } from "@app/services/smtp/smtp-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { agentVaultFreeUsageNoticeServiceFactory } from "./agent-vault-free-usage-notice-service";

vi.mock("@app/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => ({ SITE_URL: "https://app.infisical.com" }) }));

const ROOT_ORG_ID = "org-root";

const admin = (email: string, status = OrgMembershipStatus.Accepted, isActive = true) => ({
  status,
  user: { email, isActive }
});

const crossing = (threshold: AgentVaultFreeUsageThreshold) => ({
  rootOrgId: ROOT_ORG_ID,
  threshold,
  month: "2026-11",
  limit: 5_000,
  resetsAt: new Date("2026-12-01T00:00:00Z")
});

const build = (admins = [admin("a@acme.com"), admin("b@acme.com")]) => {
  const orgDAL = {
    findOrgById: vi.fn(async () => ({ id: ROOT_ORG_ID, name: "Acme" })),
    findOrgMembersByRole: vi.fn(async () => admins)
  };
  const smtpService = { sendMail: vi.fn<(mail: TSmtpSendMail) => Promise<void>>(async () => {}) };
  const telemetryService = { sendPostHogEvents: vi.fn(async () => {}) };
  const service = agentVaultFreeUsageNoticeServiceFactory({
    orgDAL: orgDAL as never,
    smtpService,
    telemetryService
  });
  return { service, smtpService, telemetryService };
};

describe("agentVaultFreeUsageNoticeService.notify", () => {
  test("should email the root org's active admins and send the event for a warning", async () => {
    // Setup
    const { service, smtpService, telemetryService } = build([
      admin("a@acme.com"),
      admin("invited@acme.com", OrgMembershipStatus.Invited),
      admin("off@acme.com", OrgMembershipStatus.Accepted, false)
    ]);

    // Action
    await service.notify([crossing(AgentVaultFreeUsageThreshold.Warning)]);

    // Assert
    const [[mail]] = smtpService.sendMail.mock.calls;
    expect(mail.template).toBe(SmtpTemplates.AgentVaultFreeUsageWarning);
    expect(mail.subjectLine).toBe("Agent Vault Free Requests Running Low");
    expect(mail.recipients).toEqual(["a@acme.com"]);
    expect(mail.substitutions).toMatchObject({
      orgName: "Acme",
      url: `https://app.infisical.com/organizations/${ROOT_ORG_ID}/billing?upgradeProduct=agent_vault`
    });
    expect(telemetryService.sendPostHogEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        event: PostHogEventTypes.AgentVaultFreeUsageWarningReached,
        organizationId: ROOT_ORG_ID,
        properties: { orgId: ROOT_ORG_ID, month: "2026-11", limit: 5_000, threshold: "warning" }
      })
    );
  });

  test("should send both events but only the limit email when both thresholds pass at once", async () => {
    // Setup
    const { service, smtpService, telemetryService } = build();

    // Action
    await service.notify([
      crossing(AgentVaultFreeUsageThreshold.Warning),
      crossing(AgentVaultFreeUsageThreshold.Limit)
    ]);

    // Assert
    expect(telemetryService.sendPostHogEvents).toHaveBeenCalledTimes(2);
    expect(smtpService.sendMail).toHaveBeenCalledTimes(1);
    expect(smtpService.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ template: SmtpTemplates.AgentVaultFreeUsageLimit })
    );
  });

  test("should do nothing without crossings", async () => {
    // Setup
    const { service, smtpService, telemetryService } = build();

    // Action
    await service.notify([]);

    // Assert
    expect(smtpService.sendMail).not.toHaveBeenCalled();
    expect(telemetryService.sendPostHogEvents).not.toHaveBeenCalled();
  });

  test("should not throw when sending fails", async () => {
    // Setup
    const { service, smtpService, telemetryService } = build();
    smtpService.sendMail.mockRejectedValue(new Error("smtp down"));
    telemetryService.sendPostHogEvents.mockRejectedValue(new Error("posthog down"));

    // Action, Assert
    await expect(service.notify([crossing(AgentVaultFreeUsageThreshold.Limit)])).resolves.toBeUndefined();
  });
});
