import { z } from "zod";

import {
  WorkflowIntegration,
  WorkflowIntegrationStatus
} from "@app/services/workflow-integration/workflow-integration-types";

import { PamNotificationEvent } from "../pam/pam-enums";

const NotificationChannelsSchema = z.array(z.object({ id: z.string(), name: z.string() }));
const NotificationEventsSchema = z.array(z.nativeEnum(PamNotificationEvent));

export const parseNotificationChannels = (value: unknown) => {
  const result = NotificationChannelsSchema.safeParse(value);
  return result.success ? result.data : [];
};

export const parseNotificationEvents = (value: unknown) => {
  const result = NotificationEventsSchema.safeParse(value);
  return result.success ? result.data : [];
};

export type TFolderNotificationConfigRow = {
  workflowIntegrationId: string;
  integration: string;
  status: string;
  channels: unknown;
  events: unknown;
};

// Resolves which Slack sends a folder's configs call for on a given event. Pure so the
// subscription/platform/status filtering is unit-testable without a DB.
export const getSlackSendTargets = (configs: TFolderNotificationConfigRow[], event: PamNotificationEvent) =>
  configs
    .filter(
      (config) =>
        config.integration === WorkflowIntegration.SLACK &&
        config.status === WorkflowIntegrationStatus.INSTALLED &&
        parseNotificationEvents(config.events).includes(event)
    )
    .map((config) => ({
      workflowIntegrationId: config.workflowIntegrationId,
      channelIds: parseNotificationChannels(config.channels).map((channel) => channel.id)
    }))
    .filter((target) => target.channelIds.length > 0);
