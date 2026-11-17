import { OrgMembershipRole, OrgMembershipStatus } from "@app/db/schemas";
import {
  AgentVaultFreeUsageThreshold,
  TAgentVaultFreeUsageCrossing
} from "@app/domains/agent-vault/agent-vault/ce/module";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

type TAgentVaultFreeUsageNoticeServiceFactoryDep = {
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
        url: `${SITE_URL}/organizations/${crossing.rootOrgId}/billing?upgradeProduct=agent_vault`
      }
    });
  };

  const notify = async (crossings: TAgentVaultFreeUsageCrossing[]) => {
    if (!crossings.length) return;

    await Promise.all(
      crossings.map((crossing) =>
        telemetryService
          .sendPostHogEvents({
            event: NOTICE_EVENT[crossing.threshold],
            distinctId: `agent-vault-org-${crossing.rootOrgId}`,
            organizationId: crossing.rootOrgId,
            properties: {
              orgId: crossing.rootOrgId,
              month: crossing.month,
              limit: crossing.limit,
              threshold: crossing.threshold
            }
          })
          .catch((error) =>
            logger.error(error, `agentVaultFreeUsageNotice: failed to send event [rootOrgId=${crossing.rootOrgId}]`)
          )
      )
    );

    // A report that passes both thresholds at once only needs the limit email: the warning is already out of date.
    const emailed =
      crossings.find((crossing) => crossing.threshold === AgentVaultFreeUsageThreshold.Limit) ?? crossings[0];
    await sendEmail(emailed).catch((error) =>
      logger.error(error, `agentVaultFreeUsageNotice: failed to send email [rootOrgId=${emailed.rootOrgId}]`)
    );
  };

  return { notify };
};
