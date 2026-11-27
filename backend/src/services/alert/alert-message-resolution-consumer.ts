import {
  EventResultStatus,
  runEventsSerially,
  TEvent,
  TEventConsumer,
  TEventConsumerResult
} from "@app/domains/platform/events/ce/module";

import { AlertEventPayloadSchema } from "./alert-event-consumer";
import { TAlertMessageResolutionService } from "./alert-message-resolution-fns";
import { TAlertProviderRegistry } from "./alert-provider-registry";

export const ALERT_MESSAGE_RESOLUTION_CONSUMER = "alert-message-resolution";

export type TAlertMessageResolutionConsumerDep = {
  alertProviderRegistry: Pick<TAlertProviderRegistry, "messageClosingKeys">;
  alertMessageResolution: Pick<TAlertMessageResolutionService, "resolveMessages">;
};

export const alertMessageResolutionConsumerFactory = ({
  alertProviderRegistry,
  alertMessageResolution
}: TAlertMessageResolutionConsumerDep): TEventConsumer => {
  const subscribesTo = (eventType: string): boolean => alertProviderRegistry.messageClosingKeys().has(eventType);

  const $handleEvent = async (event: TEvent): Promise<TEventConsumerResult> => {
    const { id } = event;

    const payload = AlertEventPayloadSchema.safeParse(event.data);
    if (!payload.success) {
      return { id, status: EventResultStatus.Failed, error: "Unreadable alert event payload" };
    }
    const { orgId, projectId, resourceType, targetIds } = payload.data;

    const errors = await alertMessageResolution.resolveMessages({ orgId, projectId, resourceType, targetIds });
    if (errors.length === 0) return { id, status: EventResultStatus.Delivered };
    return {
      id,
      status: event.isFinalAttempt ? EventResultStatus.Failed : EventResultStatus.Retry,
      error: errors.join("; ")
    };
  };

  const handle = (events: TEvent[]) => runEventsSerially(events, $handleEvent);

  return {
    name: ALERT_MESSAGE_RESOLUTION_CONSUMER,
    dataSchema: AlertEventPayloadSchema,
    subscribesTo,
    handle
  };
};
