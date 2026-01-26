import { logger } from "@app/lib/logger";

import { TEventBusService } from "../event-bus/event-bus-service";
import { EventBusServiceEvents } from "../event-bus/event-bus-types";
import { TProjectEventPayload, TProjectEventSubscriber, TProjectEventUnsubscribe } from "./project-events-types";

type TProjectEventsServiceFactoryDep = {
  eventBus: TEventBusService;
};

export const projectEventsServiceFactory = ({ eventBus }: TProjectEventsServiceFactoryDep) => {
  const publish = async (payload: TProjectEventPayload): Promise<void> => {
    await eventBus.publish(EventBusServiceEvents.ProjectEvents, payload);
  };

  const subscribe = (callback: TProjectEventSubscriber): TProjectEventUnsubscribe => {
    return eventBus.subscribe(EventBusServiceEvents.ProjectEvents, (event) => {
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
    publish,
    subscribe
  };
};

export type TProjectEventsService = ReturnType<typeof projectEventsServiceFactory>;
