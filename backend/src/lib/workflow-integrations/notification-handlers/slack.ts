import { TKmsCoreDomain } from "@app/domains/platform/kms-core/ce/module";
import {
  TProjectSlackConfigDALFactory,
  TProjectSlackConfigWithIntegrations
} from "@app/services/slack/project-slack-config-dal";
import { sendSlackNotification } from "@app/services/slack/slack-fns";

import { logger } from "../../logger";
import { TNotification, TriggerFeature } from "../types";

const handleSlackNotification = async ({
  slackConfig,
  notification,
  orgId,
  kmsCoreDomain
}: {
  slackConfig: TProjectSlackConfigWithIntegrations;
  notification: TNotification;
  orgId: string;
  kmsCoreDomain: TKmsCoreDomain;
}): Promise<void> => {
  let targetChannelIds: string[] = [];
  let isEnabled = false;

  switch (notification.type) {
    case TriggerFeature.ACCESS_REQUEST:
    case TriggerFeature.ACCESS_REQUEST_UPDATED:
      targetChannelIds = slackConfig.accessRequestChannels?.split(", ").filter(Boolean) || [];
      isEnabled = slackConfig.isAccessRequestNotificationEnabled;
      break;
    case TriggerFeature.SECRET_APPROVAL:
      targetChannelIds = slackConfig.secretRequestChannels?.split(", ").filter(Boolean) || [];
      isEnabled = slackConfig.isSecretRequestNotificationEnabled;
      break;
    case TriggerFeature.SECRET_SYNC_ERROR:
      targetChannelIds = slackConfig.secretSyncErrorChannels?.split(", ").filter(Boolean) || [];
      isEnabled = slackConfig.isSecretSyncErrorNotificationEnabled;
      break;
    default:
      return;
  }

  if (targetChannelIds.length && isEnabled) {
    await sendSlackNotification({
      orgId,
      notification,
      kmsCoreDomain,
      targetChannelIds,
      slackIntegration: slackConfig
    }).catch((error) => {
      logger.error(
        error,
        `Error sending Slack notification. Notification type: ${notification.type}, Target channel IDs: ${targetChannelIds.join(", ")}, Project ID: ${slackConfig.projectId}`
      );
    });
  }
};

export const triggerSlackNotification = async ({
  projectId,
  notification,
  orgId,
  projectSlackConfigDAL,
  kmsCoreDomain
}: {
  projectId: string;
  notification: TNotification;
  orgId: string;
  projectSlackConfigDAL: Pick<TProjectSlackConfigDALFactory, "getIntegrationDetailsByProject">;
  kmsCoreDomain: TKmsCoreDomain;
}): Promise<void> => {
  try {
    const config = await projectSlackConfigDAL.getIntegrationDetailsByProject(projectId);
    if (config) {
      await handleSlackNotification({ slackConfig: config, notification, orgId, kmsCoreDomain });
    }
  } catch (error) {
    logger.error(error, `Error handling Slack notification. Project ID: ${projectId}`);
  }
};
