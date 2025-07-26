/* eslint-disable no-continue */
/* eslint-disable no-underscore-dangle */
/* eslint-disable class-methods-use-this */
import { Readable, ReadableOptions } from "node:stream";

import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";
import { Redis } from "ioredis";
import { z } from "zod";

import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { RateLimitError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { EventData, EventSchema, TopicName } from "./types";

interface SubscriptionOptions extends Pick<ReadableOptions, "objectMode" | "signal"> {
  topic: TopicName;
  actorId: string;
  onPermissionCheck: (ability: MongoAbility<ProjectPermissionSet, MongoQuery>) => Promise<void> | void;
  getPermissions: () => Promise<MongoAbility<ProjectPermissionSet, MongoQuery>>;
}

class Subscription extends Readable {
  permissions?: MongoAbility<ProjectPermissionSet, MongoQuery>;

  constructor(
    private client: Redis,
    public options: SubscriptionOptions
  ) {
    super({ objectMode: true, signal: options.signal });

    this.client.on("error", this.emit.bind(this, "error"));
  }

  async init() {
    try {
      await this.client.subscribe(this.options.topic);
      this.client.on("message", this.onMessage);
    } catch (error) {
      this.emit("error", error);
    }
  }

  send(data: unknown) {
    if (!this.push(data)) {
      logger.warn("Backpressure detected: dropped manual event");
    }
  }

  private onMessage = (_channel: string, message: string) => {
    try {
      const parsed = JSON.parse(message) as EventData;
      // Immediately push the event downstream. No buffering.
      if (!this.push(parsed)) {
        // If push returns false, stream is full — drop the message
        logger.warn("Backpressure detected: dropping event");
      }
    } catch (error) {
      this.emit("error", error);
    }
  };

  async refresh() {
    try {
      this.permissions = await this.options.getPermissions();
      await this.check();
    } catch (error) {
      this.emit("error", error);
    }
  }

  async check() {
    if (!this.permissions) {
      this.emit("error", new Error("Subscription not initialized"));
      return;
    }

    try {
      await this.options.onPermissionCheck(this.permissions);
    } catch (error) {
      this.emit("error", error);
    }
  }

  _read() {
    // No-op: we push manually on Redis messages
  }

  _destroy(error: Error | null, callback: (error?: Error | null) => void) {
    this.client.removeListener("message", this.onMessage);
    callback(error);
  }

  close() {
    if (this.closed) return;
    this.push(null); // Signal end of stream
    this.emit("close"); // Explicitly emit 'close'
  }
}

type EventServiceOptions = {
  /**
   * Interval in seconds to send heartbeat messages.
   */
  heartbeat: number | false;
};

export function eventServiceFactory(conn: Redis, keyStore: TKeyStoreFactory, options: EventServiceOptions) {
  let heartbeatInterval: NodeJS.Timeout | undefined;

  const publisher = conn.duplicate();

  const clients = new Set<Subscription>();

  /**
   * Initializes the event bus by subscribing to the specified topics.
   */
  async function init(topics: TopicName[] = Object.values(TopicName)) {
    publisher.on("error", (e) => {
      logger.error(e, "Redis subscription error");
    });

    await conn.subscribe(...topics);
  }

  /**
   * Sends a heartbeat message to all connected clients.
   * This is used to keep the connection alive and check if clients are still connected.
   */
  const heartbeat = () => {
    for (const client of clients) {
      if (client.closed) continue;
      client.send({ type: "heartbeat", time: new Date().toISOString() });
    }
  };

  const refresh = () => {
    try {
      for (const client of clients) {
        if (!client.permissions) continue;
        void client.refresh();
      }
    } catch (error) {
      logger.error(error, "Error refreshing permissions for event bus clients");
    }
  };

  if (options.heartbeat) {
    heartbeatInterval = setInterval(heartbeat, options.heartbeat * 1000);
  }

  const refreshInterval = setInterval(refresh, 60 * 1000 * 1);

  const subscribe = async (opts: SubscriptionOptions) => {
    const key = KeyStorePrefixes.EventBusSubscription(opts.topic, opts.actorId);

    const stream = new Subscription(conn, opts);
    clients.add(stream);

    stream.on("error", (error: Error) => {
      if (error) {
        stream.send({
          type: "error",
          data: {
            message: error.message
          }
        });
        stream.close();
      }
    });

    stream.on("close", () => {
      stream.destroy();
      clients.delete(stream);
      void keyStore.decrementBy(key, 1);
    });

    /**
     * Need to rework the connection tracking logic - I have a better idea in mind
     */
    const connectionCount = await keyStore.getItem(key);

    console.log(`Connection count for ${opts.topic}: ${connectionCount}`);

    if (connectionCount && parseInt(connectionCount, 10) >= 2) {
      stream.emit(
        "error",
        new RateLimitError({
          message: `Too many connections for topic ${opts.topic}. Maximum of 5 connections allowed.`
        })
      );
    }

    await stream.init();
    await stream.refresh();

    await keyStore.incrementBy(key, 1);
    await keyStore.setExpiry(key, 60 * 5); // 5 minutes

    return stream;
  };

  /**
   * Publishes an event to the specified topic.
   * @param topic - The topic to publish the event to.
   * @param event - The event data to publish.
   */
  const publish = async <T extends z.input<typeof EventSchema>>(topic: TopicName, event: T) => {
    // @Sid - I think we can skip validation here since the event is already validated in the route handler
    // const { data, success, error } = await EventSchema.safeParseAsync(event);

    // if (!success) {
    //   logger.error(error, "Invalid event data");
    //   return;
    // }

    const json = JSON.stringify(event);

    await publisher.publish(topic, json, (err) => {
      if (err) {
        return logger.error(err, `Error publishing to channel ${topic}`);
      }
    });
  };

  const close = () => {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    if (refreshInterval) {
      clearInterval(refreshInterval);
    }

    for (const client of clients) {
      client.close();
    }

    clients.clear();
  };

  return { init, publish, subscribe, close };
}

export type TEventService = ReturnType<typeof eventServiceFactory>;
