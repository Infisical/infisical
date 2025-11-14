import { validateMicrosoftTeamsChannelsSchema } from "@app/services/microsoft-teams/microsoft-teams-fns";
import { TMicrosoftTeamsServiceFactory } from "@app/services/microsoft-teams/microsoft-teams-service";
import {
  TProjectMicrosoftTeamsConfigDALFactory,
  TProjectMicrosoftTeamsConfigWithIntegrations
} from "@app/services/microsoft-teams/project-microsoft-teams-config-dal";

import { logger } from "../../logger";
import { TNotification, TriggerFeature } from "../types";

const handleMicrosoftTeamsNotification = async ({
  microsoftTeamsConfig,
  notification,
  orgId,
  microsoftTeamsService
}: {
  microsoftTeamsConfig: TProjectMicrosoftTeamsConfigWithIntegrations;
  notification: TNotification;
  orgId: string;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
}): Promise<void> => {
  let targetChannels: unknown;
  let isEnabled = false;

  switch (notification.type) {
    case TriggerFeature.ACCESS_REQUEST:
    case TriggerFeature.ACCESS_REQUEST_UPDATED:
      targetChannels = microsoftTeamsConfig.accessRequestChannels;
      isEnabled = microsoftTeamsConfig.isAccessRequestNotificationEnabled;
      break;
    case TriggerFeature.SECRET_APPROVAL:
      targetChannels = microsoftTeamsConfig.secretRequestChannels;
      isEnabled = microsoftTeamsConfig.isSecretRequestNotificationEnabled;
      break;
    default:
      return;
  }

  if (isEnabled && targetChannels) {
    const { success, data, error: validationError } = validateMicrosoftTeamsChannelsSchema.safeParse(targetChannels);

    if (!success) {
      logger.error(validationError, "Invalid Microsoft Teams channel configuration");
      return;
    }

    if (data) {
      await microsoftTeamsService
        .sendNotification({
          notification,
          target: data,
          tenantId: microsoftTeamsConfig.tenantId,
          microsoftTeamsIntegrationId: microsoftTeamsConfig.id,
          orgId
        })
        .catch((error) => {
          logger.error(
            error,
            `Error sending Microsoft Teams notification. Notification type: ${notification.type}, Tenant ID: ${microsoftTeamsConfig.tenantId}, Project ID: ${microsoftTeamsConfig.projectId}`
          );
        });
    }
  }
};

export const triggerMicrosoftTeamsNotification = async ({
  projectId,
  notification,
  orgId,
  projectMicrosoftTeamsConfigDAL,
  microsoftTeamsService
}: {
  projectId: string;
  notification: TNotification;
  orgId: string;
  projectMicrosoftTeamsConfigDAL: Pick<TProjectMicrosoftTeamsConfigDALFactory, "getIntegrationDetailsByProject">;
  microsoftTeamsService: Pick<TMicrosoftTeamsServiceFactory, "sendNotification">;
}): Promise<void> => {
  try {
    const config = await projectMicrosoftTeamsConfigDAL.getIntegrationDetailsByProject(projectId);
    if (config) {
      await handleMicrosoftTeamsNotification({
        microsoftTeamsConfig: config,
        notification,
        orgId,
        microsoftTeamsService
      });
    }
  } catch (error) {
    logger.error(error, `Error handling Microsoft Teams notification. Project ID: ${projectId}`);
  }
};
