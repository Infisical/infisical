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

// Channel ids are merged per integration so overlapping configs can't post the same message twice
export const getSlackSendTargets = (configs: TFolderNotificationConfigRow[], event: PamNotificationEvent) => {
  const channelIdsByIntegration = new Map<string, Set<string>>();

  for (const config of configs) {
    const isSubscribed =
      config.integration === WorkflowIntegration.SLACK &&
      config.status === WorkflowIntegrationStatus.INSTALLED &&
      parseNotificationEvents(config.events).includes(event);
    if (!isSubscribed) continue;

    const channelIds = parseNotificationChannels(config.channels).map((channel) => channel.id);
    if (!channelIds.length) continue;

    const existing = channelIdsByIntegration.get(config.workflowIntegrationId) ?? new Set<string>();
    channelIds.forEach((id) => existing.add(id));
    channelIdsByIntegration.set(config.workflowIntegrationId, existing);
  }

  return [...channelIdsByIntegration.entries()].map(([workflowIntegrationId, channelIds]) => ({
    workflowIntegrationId,
    channelIds: [...channelIds]
  }));
};
