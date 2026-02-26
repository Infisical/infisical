import { WebClient } from "@slack/web-api";

import { logger } from "@app/lib/logger";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TProjectSlackConfigDALFactory } from "@app/services/slack/project-slack-config-dal";

type TSendNhiScanNotificationParams = {
  projectId: string;
  sourceName: string;
  identitiesFound: number;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

type TSendNhiPolicyNotificationParams = {
  projectId: string;
  policyName: string;
  identityName: string;
  actionTaken: string;
  status: string;
  statusMessage?: string | null;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

const decryptBotToken = async (
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">,
  orgId: string,
  encryptedBotAccessToken: Buffer
): Promise<string> => {
  const { decryptor } = await kmsService.createCipherPairWithDataKey({
    type: KmsDataKey.Organization,
    orgId
  });
  return decryptor({ cipherTextBlob: encryptedBotAccessToken }).toString("utf8");
};

export const sendNhiScanNotification = async ({
  projectId,
  sourceName,
  identitiesFound,
  projectSlackConfigDAL,
  kmsService
}: TSendNhiScanNotificationParams) => {
  const config = await projectSlackConfigDAL.getIntegrationDetailsByProject(projectId);
  if (!config || !config.isNhiScanNotificationEnabled || !config.nhiScanChannels) {
    return;
  }

  const channelIds = config.nhiScanChannels
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (channelIds.length === 0) return;

  const botKey = await decryptBotToken(kmsService, config.orgId, config.encryptedBotAccessToken);
  const slackClient = new WebClient(botKey);

  const text = `NHI Scan Completed: *${sourceName}* discovered *${identitiesFound}* identities.`;

  for (const channelId of channelIds) {
    await slackClient.chat
      .postMessage({
        channel: channelId,
        text,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "NHI Scan Completed", emoji: true }
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Source:*\n${sourceName}` },
              { type: "mrkdwn", text: `*Identities Found:*\n${identitiesFound}` }
            ]
          }
        ]
      })
      .catch((err) => logger.error(err, "Failed to send NHI scan Slack notification"));
  }
};

export const sendNhiPolicyNotification = async ({
  projectId,
  policyName,
  identityName,
  actionTaken,
  status,
  statusMessage,
  projectSlackConfigDAL,
  kmsService
}: TSendNhiPolicyNotificationParams) => {
  const config = await projectSlackConfigDAL.getIntegrationDetailsByProject(projectId);
  if (!config || !config.isNhiPolicyNotificationEnabled || !config.nhiPolicyChannels) {
    return;
  }

  const channelIds = config.nhiPolicyChannels
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  if (channelIds.length === 0) return;

  const botKey = await decryptBotToken(kmsService, config.orgId, config.encryptedBotAccessToken);
  const slackClient = new WebClient(botKey);

  const statusEmoji = status === "completed" ? "white_check_mark" : "x";
  const text = `NHI Policy Executed: *${policyName}* on identity *${identityName}* — action: ${actionTaken}, status: ${status}`;

  for (const channelId of channelIds) {
    await slackClient.chat
      .postMessage({
        channel: channelId,
        text,
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: "NHI Policy Auto-Remediation", emoji: true }
          },
          {
            type: "section",
            fields: [
              { type: "mrkdwn", text: `*Policy:*\n${policyName}` },
              { type: "mrkdwn", text: `*Identity:*\n${identityName}` },
              { type: "mrkdwn", text: `*Action:*\n${actionTaken}` },
              { type: "mrkdwn", text: `*Status:*\n:${statusEmoji}: ${status}` }
            ]
          },
          ...(statusMessage
            ? [
                {
                  type: "section" as const,
                  text: { type: "mrkdwn" as const, text: `*Details:*\n${statusMessage}` }
                }
              ]
            : [])
        ]
      })
      .catch((err) => logger.error(err, "Failed to send NHI policy Slack notification"));
  }
};
