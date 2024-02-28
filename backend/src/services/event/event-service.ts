/* eslint-disable no-console */
import Redis from "ioredis";
import { nanoid } from "nanoid";

import { logger } from "@app/lib/logger";

import { TEvent, TEventType } from "./event-types";

type TEventServiceFactoryDep = {
  redisUrl: string;
};

export type TEventServiceFactory = ReturnType<typeof eventServiceFactory>;

export const eventServiceFactory = ({ redisUrl }: TEventServiceFactoryDep) => {
  const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const internalSubscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });

  // Array of subscriber ID's [channel, subscriberIds]
  const subscribers: Record<
    string,
    {
      id: string;
      listener: (event: TEvent) => void;
    }[]
  > = {};

  // Instead of creating an actual subscriber each time, we will use one global subscriber.
  // We do this because we want to avoid creating too many connections to Redis, as there's a limit to the number of concurrent connections that can be made to a Redis instance.

  internalSubscriber.on("error", (err) => {
    console.log("Error in internalSubscriber", err);
  });

  console.log("internalSubscriber.url", redisUrl);

  // channel would be the projectId
  const publishEvent = async (channel: string, event: TEvent[TEventType]) => {
    const subscriberIds = subscribers?.[channel] || [];

    if (subscriberIds.length === 0) {
      return;
    }

    // This is inefficient if there are a lot of subscribers on the same channel.
    await Promise.all(
      subscriberIds.map(async (subscriber) => {
        await publisher.publish(`${channel}.${subscriber.id}`, JSON.stringify(event));
      })
    );
  };

  const subscribe = async (channel: string, listener: (event: TEvent) => void) => {
    const subscriptionId = nanoid(32);

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    await internalSubscriber.subscribe(`${channel}.${subscriptionId}`, async (msg) => {
      if (msg instanceof Error) {
        throw msg;
      }
    });

    if (!subscribers[channel]) {
      subscribers[channel] = [];

      // Create a single .on listener for this channel
      internalSubscriber.on("message", (subChannel, message) => {
        if (subChannel.startsWith(channel)) {
          const event = JSON.parse(message) as TEvent;
          // Call each subscriber's listener function
          for (const subscriber of subscribers[channel]) {
            if (subChannel === `${channel}.${subscriber.id}`) {
              try {
                subscriber.listener(event);
              } catch (err) {
                logger.error("Error in event listener", err);
              }
            }
          }
        }
      });
    }

    // Add the new subscriber to the subscribers object.
    // The .on listener will take care of calling the listener function when a new event is published to the channel.
    subscribers[channel].push({
      id: subscriptionId,
      listener
    });

    return {
      subscriptionId
    };
  };

  const unsubscribe = async (channel: string, subId: string) => {
    if (subscribers[channel].length === 1) {
      // If there's only 1 subscriber, we can delete the entire channel from the subscribers object.
      delete subscribers[channel];
    } else if (subscribers[channel]) {
      // If there are multiple subscribers, we just remove the subscriber ID from the array.
      subscribers[channel] = subscribers[channel].filter((subscriber) => subscriber.id !== subId);
    }

    // At last, we unsubscribe from the Redis channel.
    await internalSubscriber.unsubscribe(`${channel}.${subId}`);

    internalSubscriber.off("message", (subChannel, ...rest) => {
      if (subChannel === `${channel}.${subId}`) {
        console.log("Unsubscribed from channel", subChannel, rest);
      }
    });
  };

  return {
    publishEvent,
    subscribe,
    unsubscribe
  };
};
