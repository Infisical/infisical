import { Cluster, Redis } from "ioredis";
import { nanoid } from "nanoid";

import { logger } from "@app/lib/logger";

import {
  EventBusServiceEvents,
  EventBusTopicName,
  TEventBusEvent,
  TEventBusSubscriber,
  TEventBusUnsubscribe
} from "./event-bus-types";
import { createMemoryBus } from "./memory-bus";
import { createRedisBus } from "./redis-bus";

type TEventBusServiceFactoryDep = {
  redis: Redis | Cluster;
};

export const eventBusServiceFactory = ({ redis }: TEventBusServiceFactoryDep) => {
  // Generate unique container ID at startup
  const containerId = `container-${nanoid()}`;

  // Create memory bus for local event delivery
  const memoryBus = createMemoryBus();

  // Create Redis bus for inter-container communication
  const redisBus = createRedisBus(redis, EventBusTopicName.CoreServers);

  /**
   * Initialize the event bus
   * - Sets up Redis subscription
   * - Bridges Redis events to memory bus (excluding events from this container)
   */
  const init = async (): Promise<void> => {
    // Set up handler to bridge Redis events to memory bus
    redisBus.onMessage((event) => {
      // Skip events that originated from this container (already delivered locally)
      if (event.sourceContainer === containerId) {
        return;
      }
      // Forward event to memory bus for local subscribers
      memoryBus.emit(event);
    });

    await redisBus.init();
    logger.info({ containerId }, "Event bus initialized");
  };

  /**
   * Publish an event to all containers
   * - Immediately delivers to local subscribers via memory bus
   * - Broadcasts to other containers via Redis
   */
  const publish = async <T>(type: EventBusServiceEvents, payload: T): Promise<void> => {
    const event: TEventBusEvent = {
      type,
      timestamp: new Date().toISOString(),
      sourceContainer: containerId,
      payload
    };

    // Emit locally first for immediate delivery to local subscribers
    memoryBus.emit(event);

    // Then broadcast to other containers via Redis
    await redisBus.publish(event);
  };

  /**
   * Subscribe to events of a specific type
   * Receives events from both local publishers and other containers
   * @returns Unsubscribe function
   */
  const subscribe = (type: EventBusServiceEvents, callback: TEventBusSubscriber): TEventBusUnsubscribe => {
    return memoryBus.subscribe(type, callback);
  };

  /**
   * Close the event bus and cleanup resources
   */
  const close = async (): Promise<void> => {
    await redisBus.close();
    memoryBus.removeAllListeners();
    logger.info({ containerId }, "Event bus closed");
  };

  return {
    init,
    publish,
    subscribe,
    close
  };
};

export type TEventBusService = ReturnType<typeof eventBusServiceFactory>;
