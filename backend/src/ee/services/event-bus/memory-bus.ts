import { EventEmitter } from "events";

import { logger } from "@app/lib/logger";

import { EventBusServiceEvents, TEventBusEvent, TEventBusSubscriber, TEventBusUnsubscribe } from "./event-bus-types";

const ALL_EVENTS_CHANNEL = "__all__";

export const createMemoryBus = () => {
  const emitter = new EventEmitter();
  // Increase max listeners to avoid warnings with many subscribers
  emitter.setMaxListeners(100);

  /**
   * Emit an event to all subscribers of that event type
   * Also emits to the ALL_EVENTS_CHANNEL for global subscribers
   */
  const emit = (event: TEventBusEvent): void => {
    emitter.emit(event.type, event);
    emitter.emit(ALL_EVENTS_CHANNEL, event);
  };

  /**
   * Subscribe to events of a specific type
   * @returns Unsubscribe function
   */
  const subscribe = (type: EventBusServiceEvents, callback: TEventBusSubscriber): TEventBusUnsubscribe => {
    const wrappedCallback = (event: TEventBusEvent) => {
      try {
        const result = callback(event);
        // Handle async callbacks - log errors but don't throw
        if (result instanceof Promise) {
          result.catch((error) => {
            logger.error(error, `Error in event bus subscriber for event type: ${type}`);
          });
        }
      } catch (error) {
        logger.error(error, `Error in event bus subscriber for event type: ${type}`);
      }
    };

    emitter.on(type, wrappedCallback);

    return () => {
      emitter.off(type, wrappedCallback);
    };
  };

  /**
   * Subscribe to ALL events (useful for debugging/logging)
   * @returns Unsubscribe function
   */
  const subscribeAll = (callback: TEventBusSubscriber): TEventBusUnsubscribe => {
    const wrappedCallback = (event: TEventBusEvent) => {
      try {
        const result = callback(event);
        if (result instanceof Promise) {
          result.catch((error) => {
            logger.error(error, "Error in event bus global subscriber");
          });
        }
      } catch (error) {
        logger.error(error, "Error in event bus global subscriber");
      }
    };

    emitter.on(ALL_EVENTS_CHANNEL, wrappedCallback);

    return () => {
      emitter.off(ALL_EVENTS_CHANNEL, wrappedCallback);
    };
  };

  /**
   * Remove all listeners from the memory bus
   */
  const removeAllListeners = (): void => {
    emitter.removeAllListeners();
  };

  return {
    emit,
    subscribe,
    subscribeAll,
    removeAllListeners
  };
};

export type TMemoryBus = ReturnType<typeof createMemoryBus>;
