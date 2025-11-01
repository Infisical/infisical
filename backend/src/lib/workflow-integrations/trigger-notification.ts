import { logger } from "../logger";
import { triggerMicrosoftTeamsNotification } from "./notification-handlers/microsoft-teams";
import { triggerSlackNotification } from "./notification-handlers/slack";
import { TTriggerWorkflowNotificationDTO } from "./types";

export const triggerWorkflowIntegrationNotification = async (dto: TTriggerWorkflowNotificationDTO) => {
  try {
    const { projectId, notification } = dto.input;
    const { projectDAL, projectSlackConfigDAL, kmsService, projectMicrosoftTeamsConfigDAL, microsoftTeamsService } =
      dto.dependencies;

    const project = await projectDAL.findById(projectId);

    if (!project) {
      return;
    }

    const handlerPromises = [
      triggerSlackNotification({
        projectId,
        notification,
        orgId: project.orgId,
        projectSlackConfigDAL,
        kmsService
      }),

      triggerMicrosoftTeamsNotification({
        projectId,
        notification,
        orgId: project.orgId,
        projectMicrosoftTeamsConfigDAL,
        microsoftTeamsService
      })
    ];

    await Promise.allSettled(handlerPromises);
  } catch (error) {
    logger.error(error, "Error triggering workflow integration notification");
  }
};
