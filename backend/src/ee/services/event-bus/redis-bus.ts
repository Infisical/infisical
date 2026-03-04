import { Cluster, Redis } from "ioredis";

import { logger } from "@app/lib/logger";

import { EventBusSchema, EventBusTopicName, TEventBusEvent } from "./event-bus-types";

export type TRedisBusOnMessage = (event: TEventBusEvent) => void;

export const createRedisBus = (redis: Redis | Cluster, topic: EventBusTopicName) => {
  // Duplicate the redis connection for pub/sub
  // Redis doesn't allow a single connection to both publish and subscribe
  const publisher = redis.duplicate();
  const subscriber = publisher.duplicate();

  let messageHandler: TRedisBusOnMessage | null = null;

  /**
   * Initialize the Redis bus by subscribing to the topic
   */
  const init = async (): Promise<void> => {
    subscriber.on("error", (error) => {
      logger.error(error, "Event bus Redis subscriber error");
    });

    publisher.on("error", (error) => {
      logger.error(error, "Event bus Redis publisher error");
    });

    subscriber.on("message", (channel: string, message: string) => {
      if (channel !== topic || !messageHandler) {
        logger.info("Received emtpy channel or message in event bus");
        return;
      }

      try {
        const validated = EventBusSchema.safeParse(JSON.parse(message));

        if (!validated.success) {
          logger.error({ error: validated.error, message }, `Invalid event received on channel ${channel}`);
          return;
        }

        messageHandler(validated.data);
      } catch (error) {
        logger.error(error, `Error parsing event from channel ${channel}`);
      }
    });

    await subscriber.subscribe(topic);
    logger.info({ topic }, "Event bus subscribed to Redis topic");
  };

  /**
   * Set the message handler for incoming events
   */
  const onMessage = (handler: TRedisBusOnMessage): void => {
    messageHandler = handler;
  };

  /**
   * Publish an event to the Redis channel
   */
  const publish = async (event: TEventBusEvent): Promise<void> => {
    const json = JSON.stringify(event);
    await publisher.publish(topic, json);
  };

  /**
   * Close the Redis connections
   */
  const close = async (): Promise<void> => {
    try {
      await subscriber.unsubscribe(topic);
      await publisher.quit();
      await subscriber.quit();
      logger.info({ topic }, "Event bus Redis connections closed");
    } catch (error) {
      logger.error(error, "Error closing event bus Redis connections");
    }
  };

  return {
    init,
    onMessage,
    publish,
    close
  };
};

export type TRedisBus = ReturnType<typeof createRedisBus>;
