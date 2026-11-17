import { OrgMembershipRole, OrgMembershipStatus } from "@app/db/schemas";
import {
  AgentVaultFreeUsageThreshold,
  TAgentVaultFreeUsageCrossing,
  TAgentVaultUsageService
} from "@app/domains/agent-vault/agent-vault/ce/module";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

type TAgentVaultFreeUsageNoticeServiceFactoryDep = {
  agentVaultUsageService: Pick<TAgentVaultUsageService, "completeNotice" | "releaseNotice">;
  orgDAL: Pick<TOrgDALFactory, "findOrgById" | "findOrgMembersByRole">;
  smtpService: Pick<TSmtpService, "sendMail">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
};

export type TAgentVaultFreeUsageNoticeServiceFactory = ReturnType<typeof agentVaultFreeUsageNoticeServiceFactory>;

const NOTICE_EMAIL = {
  [AgentVaultFreeUsageThreshold.Warning]: {
    template: SmtpTemplates.AgentVaultFreeUsageWarning,
    subjectLine: "Agent Vault Free Requests Running Low"
  },
  [AgentVaultFreeUsageThreshold.Limit]: {
    template: SmtpTemplates.AgentVaultFreeUsageLimit,
    subjectLine: "Agent Vault Free Requests Used Up"
  }
} as const;

const NOTICE_EVENT = {
  [AgentVaultFreeUsageThreshold.Warning]: PostHogEventTypes.AgentVaultFreeUsageWarningReached,
  [AgentVaultFreeUsageThreshold.Limit]: PostHogEventTypes.AgentVaultFreeLimitReached
} as const;

// Tells a free-tier org's admins, and PostHog, when its Agent Vault count passes 75% or the limit. Best effort: a
// notice that fails is logged and never affects the usage report that triggered it.
export const agentVaultFreeUsageNoticeServiceFactory = ({
  agentVaultUsageService,
  orgDAL,
  smtpService,
  telemetryService
}: TAgentVaultFreeUsageNoticeServiceFactoryDep) => {
  const sendEmail = async (crossing: TAgentVaultFreeUsageCrossing) => {
    const org = await orgDAL.findOrgById(crossing.rootOrgId);
    if (!org) return;

    // Billing lives on the root org, and only its admins can add a payment method there by default.
    const recipients = (await orgDAL.findOrgMembersByRole(crossing.rootOrgId, OrgMembershipRole.Admin))
      .filter((admin) => admin.status !== OrgMembershipStatus.Invited && admin.user.isActive)
      .map((admin) => admin.user.email)
      .filter((email): email is string => Boolean(email));
    if (!recipients.length) {
      logger.info(`agentVaultFreeUsageNotice: no admins to email [rootOrgId=${crossing.rootOrgId}]`);
      return;
    }

    const { SITE_URL } = getConfig();
    const { template, subjectLine } = NOTICE_EMAIL[crossing.threshold];
    await smtpService.sendMail({
      template,
      subjectLine,
      recipients,
      substitutions: {
        orgName: org.name,
        resetsAt: crossing.resetsAt,
        percent: crossing.percent,
        url: `${SITE_URL}/organizations/${crossing.rootOrgId}/billing?upgradeProduct=agent_vault`
      }
    });
  };

  // Each crossing holds a short lock: it's marked sent only after the email went out, and released on failure so a
  // later report retries. The event is sent only once the notice is marked sent, so a retry never counts it twice.
  const notify = async (crossings: TAgentVaultFreeUsageCrossing[]) => {
    if (!crossings.length) return;

    // When both are due at once only the limit email goes out, since the warning is already out of date; the warning
    // is marked sent with it so it isn't sent on the next report.
    const emailed =
      crossings.find((crossing) => crossing.threshold === AgentVaultFreeUsageThreshold.Limit) ?? crossings[0];
    try {
      await sendEmail(emailed);
    } catch (error) {
      logger.error(error, `agentVaultFreeUsageNotice: failed to send email [rootOrgId=${emailed.rootOrgId}]`);
      await Promise.all(
        crossings.map((crossing) =>
          agentVaultUsageService
            .releaseNotice(crossing)
            .catch((releaseError) =>
              logger.error(
                releaseError,
                `agentVaultFreeUsageNotice: failed to release notice [rootOrgId=${crossing.rootOrgId}]`
              )
            )
        )
      );
      return;
    }

    await Promise.all(
      crossings.map(async (crossing) => {
        try {
          await agentVaultUsageService.completeNotice(crossing);
          await telemetryService.sendPostHogEvents({
            event: NOTICE_EVENT[crossing.threshold],
            distinctId: `agent-vault-org-${crossing.rootOrgId}`,
            organizationId: crossing.rootOrgId,
            properties: {
              orgId: crossing.rootOrgId,
              month: crossing.month,
              limit: crossing.limit,
              threshold: crossing.threshold
            }
          });
        } catch (error) {
          logger.error(error, `agentVaultFreeUsageNotice: failed to complete notice [rootOrgId=${crossing.rootOrgId}]`);
        }
      })
    );
  };

  return { notify };
};
