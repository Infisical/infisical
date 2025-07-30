import Redis from "ioredis";
import { z } from "zod";

import { logger } from "@app/lib/logger";

import { EventSchema, TopicName } from "./types";

export const eventBusFactory = (redis: Redis) => {
  const publisher = redis.duplicate();
  // Duplicate the publisher to create a subscriber.
  // This is necessary because Redis does not allow a single connection to both publish and subscribe.
  const subscriber = publisher.duplicate();

  const init = async (topics: TopicName[] = Object.values(TopicName)) => {
    subscriber.on("error", (e) => {
      logger.error(e, "Event Bus subscriber error");
    });

    publisher.on("error", (e) => {
      logger.error(e, "Event Bus publisher error");
    });

    await subscriber.subscribe(...topics);
  };

  /**
   * Publishes an event to the specified topic.
   * @param topic - The topic to publish the event to.
   * @param event - The event data to publish.
   */
  const publish = async <T extends z.input<typeof EventSchema>>(topic: TopicName, event: T) => {
    const json = JSON.stringify(event);

    return publisher.publish(topic, json, (err) => {
      if (err) {
        return logger.error(err, `Error publishing to channel ${topic}`);
      }
    });
  };

  /**
   * @param fn - The function to call when a message is received.
   * It should accept the parsed event data as an argument.
   * @template T - The type of the event data, which should match the schema defined in EventSchema.
   * @returns A function that can be called to unsubscribe from the event bus.
   */
  const subscribe = <T extends z.infer<typeof EventSchema>>(fn: (data: T) => Promise<void> | void) => {
    // Not using async await cause redis client's `on` method does not expect async listeners.
    const listener = (channel: string, message: string) => {
      try {
        const parsed = JSON.parse(message) as T;
        const thenable = fn(parsed);

        // If the function returns a Promise, catch any errors that occur during processing.
        if (thenable instanceof Promise) {
          thenable.catch((error) => {
            logger.error(error, `Error processing message from channel ${channel}`);
          });
        }
      } catch (error) {
        logger.error(error, `Error parsing message data from channel ${channel}`);
      }
    };
    subscriber.on("message", listener);

    return () => {
      subscriber.off("message", listener);
    };
  };

  const close = async () => {
    try {
      await publisher.quit();
      await subscriber.quit();
    } catch (error) {
      logger.error(error, "Error closing event bus connections");
    }
  };

  return { init, publish, subscribe, close };
};

export type TEventBusService = ReturnType<typeof eventBusFactory>;
