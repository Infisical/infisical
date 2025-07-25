/* eslint-disable no-underscore-dangle */
/* eslint-disable class-methods-use-this */
import { Duplex, ReadableOptions } from "node:stream";

import { ForbiddenError, MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";
import { Redis } from "ioredis";
import { z } from "zod";

import {
  TGetProjectPermissionArg,
  TPermissionServiceFactory
} from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionActions,
  ProjectPermissionSet,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { EventSchema, TopicName } from "./types";

interface SubscriptionOptions {
  permission: TGetProjectPermissionArg;
  readable: ReadableOptions;
}
class Subscription extends Duplex {
  permissions?: MongoAbility<ProjectPermissionSet, MongoQuery>;

  constructor(
    private client: Redis,
    private channel: TopicName,
    options: SubscriptionOptions
  ) {
    super(options.readable);
    this.setup();
  }

  setPermissions(permissions: MongoAbility<ProjectPermissionSet, MongoQuery>) {
    this.permissions = permissions;
  }

  _write(chunk: Buffer, encoding: BufferEncoding, callback: (error?: Error | null | undefined) => void) {
    if (Buffer.isBuffer(chunk) || typeof chunk === "string") {
      this.push(JSON.parse(chunk.toString(encoding ?? "utf-8")));
    } else {
      this.push(chunk, encoding ?? "utf-8");
    }

    callback();
  }

  setup() {
    this.client.on("error", this.emit.bind(this, "error"));

    void this.client.subscribe(this.channel, (err) => {
      if (err) {
        return logger.error(err);
      }

      // Just write the message to the stream - we don't buffer it
      this.client.on("message", (_, message) => {
        this.write(message);
      });
    });
  }

  // Manually push chunks to the stream
  _read() {}
}

type EventServiceOptions = {
  /**
   * Interval in seconds to send heartbeat messages.
   */
  heartbeat: number | false;
};

export function eventServiceFactory(
  conn: Redis,
  kv: TKeyStoreFactory,
  permissions: TPermissionServiceFactory,
  options: EventServiceOptions
) {
  let heartbeatInterval: NodeJS.Timeout | undefined;
  const publisher = conn.duplicate();

  const clients = new Set<Subscription>();

  async function init(topics: TopicName[] = [TopicName.CoreServers]) {
    conn.on("error", (e) => {
      logger.error(e, "Redis subscription error");
    });

    await conn.subscribe(...topics);
  }

  function heartbeat() {
    clients.forEach((client) => {
      if (client.writable) {
        client.write({ type: "heartbeat", time: new Date().toISOString() });
      }
    });
  }

  if (options.heartbeat) {
    heartbeatInterval = setInterval(heartbeat, options.heartbeat * 1000);
  }

  function destroy() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }

    clients.forEach((client) => {
      client.destroy?.();
    });

    clients.clear();
  }

  async function subscribe(topic: TopicName, opts: SubscriptionOptions) {
    const stream = new Subscription(conn, topic, opts);

    const perm = await permissions.getProjectPermission(opts.permission);

    ForbiddenError.from(perm.permission).throwUnlessCan(
      ProjectPermissionActions.Subscribe,
      ProjectPermissionSub.Project
    );

    stream.setPermissions(perm.permission);

    clients.add(stream);

    stream.on("close", () => {
      clients.delete(stream);
    });

    return stream;
  }

  /**
   * Publishes an event to the specified topic.
   * @param topic - The topic to publish the event to.
   * @param event - The event data to publish.
   */
  async function publish<T extends z.input<typeof EventSchema>>(topic: TopicName, event: T) {
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
  }

  return { init, publish, subscribe, destroy };
}

export type TEventService = ReturnType<typeof eventServiceFactory>;
