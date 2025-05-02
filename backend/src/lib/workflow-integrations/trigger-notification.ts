import { validateMicrosoftTeamsChannelsSchema } from "@app/services/microsoft-teams/microsoft-teams-fns";
import { sendSlackNotification } from "@app/services/slack/slack-fns";

import { logger } from "../logger";
import { TriggerFeature, TTriggerWorkflowNotificationDTO } from "./types";

export const triggerWorkflowIntegrationNotification = async (dto: TTriggerWorkflowNotificationDTO) => {
  try {
    const { projectId, notification } = dto.input;
    const { projectDAL, projectSlackConfigDAL, kmsService, projectMicrosoftTeamsConfigDAL, microsoftTeamsService } =
      dto.dependencies;

    const project = await projectDAL.findById(projectId);

    if (!project) {
      return;
    }

    const microsoftTeamsConfig = await projectMicrosoftTeamsConfigDAL.getIntegrationDetailsByProject(projectId);
    const slackConfig = await projectSlackConfigDAL.getIntegrationDetailsByProject(projectId);

    if (slackConfig) {
      if (notification.type === TriggerFeature.ACCESS_REQUEST) {
        const targetChannelIds = slackConfig.accessRequestChannels?.split(", ") || [];
        if (targetChannelIds.length && slackConfig.isAccessRequestNotificationEnabled) {
          await sendSlackNotification({
            orgId: project.orgId,
            notification,
            kmsService,
            targetChannelIds,
            slackIntegration: slackConfig
          }).catch((error) => {
            logger.error(error, "Error sending Slack notification");
          });
        }
      } else if (notification.type === TriggerFeature.SECRET_APPROVAL) {
        const targetChannelIds = slackConfig.secretRequestChannels?.split(", ") || [];
        if (targetChannelIds.length && slackConfig.isSecretRequestNotificationEnabled) {
          await sendSlackNotification({
            orgId: project.orgId,
            notification,
            kmsService,
            targetChannelIds,
            slackIntegration: slackConfig
          }).catch((error) => {
            logger.error(error, "Error sending Slack notification");
          });
        }
      }
    }

    if (microsoftTeamsConfig) {
      if (notification.type === TriggerFeature.ACCESS_REQUEST) {
        if (microsoftTeamsConfig.isAccessRequestNotificationEnabled && microsoftTeamsConfig.accessRequestChannels) {
          const { success, data } = validateMicrosoftTeamsChannelsSchema.safeParse(
            microsoftTeamsConfig.accessRequestChannels
          );

          if (success && data) {
            await microsoftTeamsService
              .sendNotification({
                notification,
                target: data,
                tenantId: microsoftTeamsConfig.tenantId,
                microsoftTeamsIntegrationId: microsoftTeamsConfig.id,
                orgId: project.orgId
              })
              .catch((error) => {
                logger.error(error, "Error sending Microsoft Teams notification");
              });
          }
        }
      } else if (notification.type === TriggerFeature.SECRET_APPROVAL) {
        if (microsoftTeamsConfig.isSecretRequestNotificationEnabled && microsoftTeamsConfig.secretRequestChannels) {
          const { success, data } = validateMicrosoftTeamsChannelsSchema.safeParse(
            microsoftTeamsConfig.secretRequestChannels
          );

          if (success && data) {
            await microsoftTeamsService
              .sendNotification({
                notification,
                target: data,
                tenantId: microsoftTeamsConfig.tenantId,
                microsoftTeamsIntegrationId: microsoftTeamsConfig.id,
                orgId: project.orgId
              })
              .catch((error) => {
                logger.error(error, "Error sending Microsoft Teams notification");
              });
          }
        }
      }
    }
  } catch (error) {
    logger.error(error, "Error triggering workflow integration notification");
  }
};
