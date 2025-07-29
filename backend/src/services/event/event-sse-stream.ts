/* eslint-disable class-methods-use-this */
/* eslint-disable no-underscore-dangle */
import { Readable } from "node:stream";

import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";
import Redis from "ioredis";
import { nanoid } from "nanoid";

import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { EventData } from "./types";

export const getServerSentEventsHeaders = () => {
  return {
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no" // Disable buffering for Nginx
  } as const;
};

type TAuthInfo = {
  actorId: string;
  projectId: string;
  permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
};
export interface IEventStreamClientOpts {
  onAuthRefresh: (info: TAuthInfo) => Promise<void> | void;
  getAuthInfo: () => Promise<TAuthInfo> | TAuthInfo;
}

interface EventMessage {
  time?: string | number;
  type: string;
  data?: unknown;
}

function serializeSseEvent(chunk: EventMessage): string {
  let payload = "";

  if (chunk.time) {
    payload += `id: ${chunk.time}\n`;
  }

  if (chunk.type) {
    payload += `event: ${chunk.type}\n`;
  }

  if (chunk.data) {
    payload += `data: ${JSON.stringify(chunk)}\n`;
  }

  payload += "\n";

  return payload;
}

export class EventStreamClient extends Readable {
  id: string;

  auth?: TAuthInfo;

  constructor(
    private redis: Redis,
    public options: IEventStreamClientOpts
  ) {
    super({ objectMode: true });
    this.id = `sse-${nanoid()}`;
  }

  /**
   * Marks the connection as active in Redis.
   * This is used to track active SSE connections for a user.
   * It adds the connection ID to a set of active connections and sets an expiration time.
   * This should be called when the connection is established.
   * @throws {never}
   */
  async open() {
    await this.refresh(); // Initialize permissions before marking a connection as active
    const { actorId, projectId } = this.auth!;

    const set = KeyStorePrefixes.ActiveSSEConnectionsSet(projectId, actorId);
    const key = KeyStorePrefixes.ActiveSSEConnections(projectId, actorId, this.id);

    await Promise.all([this.redis.rpush(set, this.id), this.redis.set(key, "1", "EX", 60)]);
  }

  send = (data: EventMessage | EventData) => {
    const chunk = serializeSseEvent(data);
    if (!this.push(chunk)) {
      logger.warn("Backpressure detected: dropped manual event");
    }
  };

  /**
   * Sends a ping message to the client.
   * This is used to keep the connection alive and check if clients are still connected.
   * It sets a key in Redis to mark the connection as active.
   * @throws {never}
   */
  async ping() {
    const { actorId, projectId } = this.auth!;
    const key = KeyStorePrefixes.ActiveSSEConnections(projectId, actorId, this.id);

    await this.redis.set(key, "1", "EX", 60); // Expiry is double of the heartbeat interval

    this.send({
      type: "ping",
      time: Date.now()
    });
  }

  /**
   * Refreshes the permissions and checks them.
   * This is useful if the permissions might have changed.
   * Call it to ensure the client has the latest permissions before checking.
   * @throws {never}
   */
  async refresh() {
    try {
      this.auth = await this.options.getAuthInfo();
      await this.check();
    } catch (error) {
      this.emit("error", error);
    }
  }

  async check() {
    if (!this.auth) {
      this.emit("error", new Error("Permissions not initialized"));
      return;
    }

    try {
      await this.options.onAuthRefresh(this.auth);
    } catch (error) {
      this.emit("error", error);
    }
  }

  _read() {
    // No-op: we push manually on Redis messages
  }

  close() {
    if (this.closed) return;
    this.push(null); // Signal end of stream
  }
}
