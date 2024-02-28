/* eslint-disable no-console */
import Redis from "ioredis";

// import { logger } from "@app/lib/logger";
import { TEvent, TEventType } from "./event-types";

type TEventServiceFactoryDep = {
  redisUrl: string;
};

export type TEventServiceFactory = ReturnType<typeof eventServiceFactory>;

export const eventServiceFactory = ({ redisUrl }: TEventServiceFactoryDep) => {
  const publisher = new Redis(redisUrl, { maxRetriesPerRequest: null });

  // Map key: the channel ID.
  // connections / total number of connections: We keep track of this to know when to unsubscribe and disconnect the client.
  // client / the subscription: We store this so we can use the same connection/subscription for the same channel. We don't want to create a new connection for each subscription, because that would be a waste of resources and become hard to scale.
  const redisClients = new Map<
    string,
    {
      client: Redis;
      connections: number;
    }
  >();
  // Will this work for vertical scaling? The redisClients

  // channel would be the projectId
  const publish = async (channel: string, event: TEvent[TEventType]) => {
    await publisher.publish(channel, JSON.stringify(event));
  };

  const crateSubscription = async (channel: string) => {
    let subscriber: Redis | null = null;

    const existingSubscriber = redisClients.get(channel);

    if (existingSubscriber) {
      redisClients.set(channel, {
        client: existingSubscriber.client,
        connections: existingSubscriber.connections + 1
      });

      subscriber = existingSubscriber.client;
    } else {
      subscriber = new Redis(redisUrl, { maxRetriesPerRequest: null });

      redisClients.set(channel, {
        client: subscriber,
        connections: 1
      });
    }

    await subscriber.subscribe(channel, (msg) => {
      if (msg instanceof Error) {
        throw msg;
      }
    });

    return {
      on: subscriber.on.bind(subscriber),
      unsubscribe: async () => {
        const subscriberToRemove = redisClients.get(channel);

        if (subscriberToRemove) {
          // If there's only 1 connection, we can fully unsubscribe and disconnect the client.
          if (subscriberToRemove.connections === 1) {
            await subscriberToRemove.client.unsubscribe(`${channel}`);
            await subscriberToRemove.client.quit();
            redisClients.delete(channel);
          } else {
            // If there's more than 1 connection, we just decrement the connections count, because there are still other listeners.
            redisClients.set(channel, {
              client: subscriberToRemove.client,
              connections: subscriberToRemove.connections - 1
            });
          }
        }
      }
    };
  };

  return {
    publish,
    crateSubscription
  };
};
