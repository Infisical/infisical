/* eslint-disable no-underscore-dangle */
import { Readable } from "node:stream";

import { MongoAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";
import Redis from "ioredis";
import { nanoid } from "nanoid";

import { ProjectType } from "@app/db/schemas";
import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { EventData, RegisteredEvent } from "./types";

export const getServerSentEventsHeaders = () =>
  ({
    "Cache-Control": "no-cache",
    "Content-Type": "text/event-stream",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no"
  }) as const;

type TAuthInfo = {
  actorId: string;
  projectId: string;
  permission: MongoAbility<ProjectPermissionSet, MongoQuery>;
};

export interface IEventStreamClientOpts {
  type: ProjectType;
  registered: RegisteredEvent[];
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

  if (chunk.time) payload += `id: ${chunk.time}\n`;
  if (chunk.type) payload += `event: ${chunk.type}\n`;
  if (chunk.data) payload += `data: ${JSON.stringify(chunk)}\n`;

  return `${payload}\n`;
}

export type EventStreamClient = {
  id: string;
  stream: Readable;
  open: () => Promise<void>;
  send: (data: EventMessage | EventData) => void;
  ping: () => Promise<void>;
  refresh: () => Promise<void>;
  close: () => void;
  get auth(): TAuthInfo;
  signal: AbortSignal;
  abort: () => void;
};

export function createEventStreamClient(redis: Redis, options: IEventStreamClientOpts): EventStreamClient {
  const id = `sse-${nanoid()}`;
  const control = new AbortController();
  let auth: TAuthInfo | undefined;

  const stream = new Readable({
    objectMode: true
  });

  // We will manually push data to the stream
  stream._read = () => {};

  const send = (data: EventMessage | EventData) => {
    const chunk = serializeSseEvent(data);
    if (!stream.push(chunk)) {
      logger.debug("Backpressure detected: dropped manual event");
    }
  };

  stream.on("error", (error: Error) => stream.destroy(error));

  const open = async () => {
    auth = await options.getAuthInfo();
    await options.onAuthRefresh(auth);

    const { actorId, projectId } = auth;
    const set = KeyStorePrefixes.ActiveSSEConnectionsSet(projectId, actorId);
    const key = KeyStorePrefixes.ActiveSSEConnections(projectId, actorId, id);

    await Promise.all([redis.rpush(set, id), redis.set(key, "1", "EX", 60)]);
  };

  const ping = async () => {
    if (!auth) return; // Avoid race condition if ping is called before open

    const { actorId, projectId } = auth;
    const key = KeyStorePrefixes.ActiveSSEConnections(projectId, actorId, id);

    await redis.set(key, "1", "EX", 60);

    send({
      type: "ping"
    });
  };

  const close = () => {
    if (stream.closed) return;
    stream.push(null);
    stream.destroy();
  };

  const refresh = async () => {
    try {
      auth = await options.getAuthInfo();
      await options.onAuthRefresh(auth);
    } catch (error) {
      if (error instanceof Error) {
        send({
          type: "error",
          data: {
            message: error.message
          }
        });
        return close();
      }
      stream.emit("error", error);
    }
  };

  const abort = () => {
    try {
      control.abort();
    } catch (error) {
      logger.debug(error, "Error aborting SSE stream");
    }
  };

  return {
    id,
    stream,
    open,
    send,
    ping,
    refresh,
    close,
    signal: control.signal,
    abort,
    get auth() {
      if (!auth) {
        throw new Error("Auth info not set");
      }

      return auth;
    }
  };
}
