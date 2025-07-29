/* eslint-disable no-continue */
import Redis from "ioredis";

import { KeyStorePrefixes } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { TEventBusService } from "./event-bus-service";
import { EventStreamClient, IEventStreamClientOpts } from "./event-sse-stream";

export type TEventServiceOptions = {
  heartbeat: number | false; // Interval in seconds to send heartbeat messages
};

export const sseServiceFactory = (bus: TEventBusService, redis: Redis, options: TEventServiceOptions) => {
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const clients = new Set<EventStreamClient>();

  if (options.heartbeat) {
    heartbeatInterval = setInterval(() => {
      for (const client of clients) {
        if (client.closed) continue;
        void client.ping();
      }
    }, options.heartbeat * 1000);
  }

  const refreshInterval = setInterval(() => {
    for (const client of clients) {
      if (client.closed) continue;
      void client.refresh();
    }
  }, 60 * 1000);

  const removeActiveConnection = async (projectId: string, identityId: string, connectionId: string) => {
    const set = KeyStorePrefixes.ActiveSSEConnectionsSet(projectId, identityId);
    const key = KeyStorePrefixes.ActiveSSEConnections(projectId, identityId, connectionId);

    await Promise.all([redis.lrem(set, 0, connectionId), redis.del(key)]);
  };

  const getActiveConnectionsCount = async (projectId: string, identityId: string) => {
    const set = KeyStorePrefixes.ActiveSSEConnectionsSet(projectId, identityId);
    const connections = await redis.lrange(set, 0, -1);

    for await (const c of connections) {
      const key = KeyStorePrefixes.ActiveSSEConnections(projectId, identityId, c);
      const exists = await redis.exists(key);

      if (!exists) {
        await removeActiveConnection(projectId, identityId, c);
      }
    }

    return redis.llen(set);
  };

  const onDisconnect = async (stream: EventStreamClient) => {
    try {
      stream.destroy();
      clients.delete(stream);
      const { actorId, projectId } = stream.auth!;
      await removeActiveConnection(projectId, actorId, stream.id);
    } catch (error) {
      logger.error(error, "Error during SSE stream disconnection");
    }
  };

  const subscribe = async (
    opts: IEventStreamClientOpts & {
      onClose?: () => void;
    }
  ) => {
    const stream = new EventStreamClient(redis, opts);

    // Set up event listener on event bus
    const unsubscribe = bus.subscribe(stream.send);

    clients.add(stream);

    stream.on("close", () => {
      unsubscribe();
      void onDisconnect(stream); // This will never throw
    });

    stream.on("error", (error: Error) => {
      if (error.name !== "AbortError") {
        logger.error(error, "Error in SSE stream client");
        stream.send({
          type: "error",
          data: {
            message: error.message
          }
        });
      }

      stream.close();
    });

    await stream.open();

    return stream;
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

  return { subscribe, close, getActiveConnectionsCount };
};

export type TServerSentEventsService = ReturnType<typeof sseServiceFactory>;
