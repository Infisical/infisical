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
  percent: threshold === AgentVaultFreeUsageThreshold.Warning ? 75 : 100,
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
  const agentVaultUsageService = { completeNotice: vi.fn(async () => {}), releaseNotice: vi.fn(async () => {}) };
  const service = agentVaultFreeUsageNoticeServiceFactory({
    agentVaultUsageService,
    orgDAL: orgDAL as never,
    smtpService,
    telemetryService
  });
  return { service, smtpService, telemetryService, agentVaultUsageService };
};

describe("agentVaultFreeUsageNoticeService.notify", () => {
  test("should email the root org's active admins, mark the notice sent and send the event for a warning", async () => {
    // Setup
    const { service, smtpService, telemetryService, agentVaultUsageService } = build([
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
      percent: 75,
      url: `https://app.infisical.com/organizations/${ROOT_ORG_ID}/billing?upgradeProduct=agent_vault`
    });
    expect(telemetryService.sendPostHogEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        event: PostHogEventTypes.AgentVaultFreeUsageWarningReached,
        organizationId: ROOT_ORG_ID,
        properties: { orgId: ROOT_ORG_ID, month: "2026-11", limit: 5_000, threshold: "warning" }
      })
    );
    expect(agentVaultUsageService.completeNotice).toHaveBeenCalledWith(crossing(AgentVaultFreeUsageThreshold.Warning));
    expect(agentVaultUsageService.releaseNotice).not.toHaveBeenCalled();
  });

  test("should send both events and mark both sent, but send only the limit email, when both are due", async () => {
    // Setup
    const { service, smtpService, telemetryService, agentVaultUsageService } = build();

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
    expect(agentVaultUsageService.completeNotice).toHaveBeenCalledTimes(2);
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

  test("should release the notice and send no event when the email fails, so a later report retries", async () => {
    // Setup
    const { service, smtpService, telemetryService, agentVaultUsageService } = build();
    smtpService.sendMail.mockRejectedValue(new Error("smtp down"));

    // Action
    await expect(service.notify([crossing(AgentVaultFreeUsageThreshold.Limit)])).resolves.toBeUndefined();

    // Assert
    expect(agentVaultUsageService.releaseNotice).toHaveBeenCalledWith(crossing(AgentVaultFreeUsageThreshold.Limit));
    expect(agentVaultUsageService.completeNotice).not.toHaveBeenCalled();
    expect(telemetryService.sendPostHogEvents).not.toHaveBeenCalled();
  });

  test("should not throw when the event fails after the notice was marked sent", async () => {
    // Setup
    const { service, telemetryService, agentVaultUsageService } = build();
    telemetryService.sendPostHogEvents.mockRejectedValue(new Error("posthog down"));

    // Action, Assert
    await expect(service.notify([crossing(AgentVaultFreeUsageThreshold.Limit)])).resolves.toBeUndefined();
    expect(agentVaultUsageService.completeNotice).toHaveBeenCalled();
  });
});
