/* eslint-disable class-methods-use-this */
/* eslint-disable no-underscore-dangle */
import { Readable } from "node:stream";

import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";

import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
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

export interface IEventStreamClientOpts {
  onPermissionCheck: (ability: MongoAbility<ProjectPermissionSet, MongoQuery>) => Promise<void> | void;
  getPermissions: () => Promise<MongoAbility<ProjectPermissionSet, MongoQuery>>;
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
  permissions?: MongoAbility<ProjectPermissionSet, MongoQuery>;

  constructor(public options: IEventStreamClientOpts) {
    super({ objectMode: true });
  }

  send(data: EventMessage) {
    const chunk = serializeSseEvent(data);
    if (!this.push(chunk)) {
      logger.warn("Backpressure detected: dropped manual event");
    }
  }

  /**
   * Handles incoming messages from Event bus.
   * If parsing fails, emits an error.
   * If the stream is full or closing, logs and drops the message.
   */
  onMessage = (data: EventData) => {
    try {
      const chunk = serializeSseEvent(data);
      // Immediately push the event downstream. No buffering.
      if (!this.push(chunk)) {
        // If push returns false, stream is full or closing — drop the message
        logger.debug("Backpressure detected: dropping event");
      }
    } catch (error) {
      this.emit("error", error);
    }
  };

  /**
   * Refreshes the permissions and checks them.
   * This is useful if the permissions might have changed.
   * Call it to ensure the client has the latest permissions before checking.
   * @throws {never}
   */
  async refresh() {
    try {
      console.log("Refreshing permissions for SSE client");
      this.permissions = await this.options.getPermissions();
      await this.check();
    } catch (error) {
      this.emit("error", error);
    }
  }

  async check() {
    if (!this.permissions) {
      this.emit("error", new Error("Permissions not initialized"));
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

  close() {
    if (this.closed) return;
    this.push(null); // Signal end of stream
  }
}
