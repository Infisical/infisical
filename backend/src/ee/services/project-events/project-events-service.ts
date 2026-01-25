import { logger } from "@app/lib/logger";

import { EventBusServiceEvents, TEventBusService } from "../event-bus";
import { TProjectEventPayload, TProjectEventSubscriber, TProjectEventUnsubscribe } from "./project-events-types";

type TProjectEventsServiceFactoryDep = {
  eventBus: TEventBusService;
};

export const projectEventsServiceFactory = ({ eventBus }: TProjectEventsServiceFactoryDep) => {
  /**
   * Publish a secret mutation event via the event bus
   * Events are broadcast to all containers via Redis
   * Payload contains projectId - subscribers filter as needed
   */
  const publishSecretMutation = async (payload: TProjectEventPayload): Promise<void> => {
    await eventBus.publish(EventBusServiceEvents.SecretMutation, payload);
  };

  /**
   * Subscribe to secret mutation events from the event bus
   * Subscriber is responsible for filtering by projectId if needed
   * @returns Unsubscribe function
   */
  const subscribeToSecretMutation = (callback: TProjectEventSubscriber): TProjectEventUnsubscribe => {
    return eventBus.subscribe(EventBusServiceEvents.SecretMutation, (event) => {
      try {
        const payload = event.payload as TProjectEventPayload;
        const result = callback(payload);
        if (result instanceof Promise) {
          result.catch((error) => {
            logger.error(error, "Error in project event subscriber");
          });
        }
      } catch (error) {
        logger.error(error, "Error in project event subscriber");
      }
    });
  };

  return {
    publishSecretMutation,
    subscribeToSecretMutation
  };
};

export type TProjectEventsService = ReturnType<typeof projectEventsServiceFactory>;
