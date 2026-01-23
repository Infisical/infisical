/* eslint-disable no-underscore-dangle */
import { Readable } from "node:stream";

import { MongoAbility, PureAbility } from "@casl/ability";
import { MongoQuery } from "@ucast/mongo2js";
import { Cluster, Redis } from "ioredis";
import { nanoid } from "nanoid";

import { ProjectType } from "@app/db/schemas/models";
import { ProjectPermissionSet } from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes } from "@app/keystore/keystore";
import { conditionsMatcher } from "@app/lib/casl";
import { logger } from "@app/lib/logger";

import { BusEvent, RegisteredEvent } from "./types";

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
  send: (data: EventMessage | BusEvent) => void;
  ping: () => Promise<void>;
  refresh: () => Promise<void>;
  close: () => void;
  get auth(): TAuthInfo;
  signal: AbortSignal;
  abort: () => void;
  matcher: PureAbility;
};

export function createEventStreamClient(redis: Redis | Cluster, options: IEventStreamClientOpts): EventStreamClient {
  const rules = options.registered.map((r) => {
    const secretPath = r.conditions?.secretPath;
    const hasConditions = r.conditions?.environmentSlug || r.conditions?.secretPath;

    return {
      subject: options.type,
      action: "subscribe",
      conditions: hasConditions
        ? {
            environment: r.conditions?.environmentSlug ?? "",
            secretPath: { $glob: secretPath }
          }
        : undefined
    };
  });

  const id = `sse-${nanoid()}`;
  const control = new AbortController();
  const matcher = new PureAbility(rules, { conditionsMatcher });

  let auth: TAuthInfo | undefined;

  const stream = new Readable({
    objectMode: true
  });

  // We will manually push data to the stream
  stream._read = () => {};

  const send = (data: EventMessage | BusEvent) => {
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

    send({ type: "ping" });
  };

  const close = () => {
    if (stream.closed) return;
    stream.push(null);
    stream.destroy();
  };

  /**
   * Refreshes the connection's auth permissions
   * Must be called atleast once when connection is opened
   */
  const refresh = async () => {
    try {
      auth = await options.getAuthInfo();
      await options.onAuthRefresh(auth);
    } catch (error) {
      if (error instanceof Error) {
        send({
          type: "error",
          data: {
            ...error
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
    matcher,
    get auth() {
      if (!auth) {
        throw new Error("Auth info not set");
      }

      return auth;
    }
  };
}
