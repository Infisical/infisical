/* eslint-disable no-continue */
import { subject } from "@casl/ability";
import Redis from "ioredis";

import { KeyStorePrefixes } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { TEventBusService } from "./event-bus-service";
import { createEventStreamClient, EventStreamClient, IEventStreamClientOpts } from "./event-sse-stream";
import { EventData, RegisteredEvent, toBusEventName } from "./types";

const AUTH_REFRESH_INTERVAL = 60 * 1000;
const HEART_BEAT_INTERVAL = 15 * 1000;

export const sseServiceFactory = (bus: TEventBusService, redis: Redis) => {
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const clients = new Set<EventStreamClient>();

  heartbeatInterval = setInterval(() => {
    for (const client of clients) {
      if (client.stream.closed) continue;
      void client.ping();
    }
  }, HEART_BEAT_INTERVAL);

  const refreshInterval = setInterval(() => {
    for (const client of clients) {
      if (client.stream.closed) continue;
      void client.refresh();
    }
  }, AUTH_REFRESH_INTERVAL);

  const removeActiveConnection = async (projectId: string, identityId: string, connectionId: string) => {
    const set = KeyStorePrefixes.ActiveSSEConnectionsSet(projectId, identityId);
    const key = KeyStorePrefixes.ActiveSSEConnections(projectId, identityId, connectionId);

    await Promise.all([redis.lrem(set, 0, connectionId), redis.del(key)]);
  };

  const getActiveConnectionsCount = async (projectId: string, identityId: string) => {
    const set = KeyStorePrefixes.ActiveSSEConnectionsSet(projectId, identityId);
    const connections = await redis.lrange(set, 0, -1);

    if (connections.length === 0) {
      return 0; // No active connections
    }

    const keys = connections.map((c) => KeyStorePrefixes.ActiveSSEConnections(projectId, identityId, c));

    const values = await redis.mget(...keys);

    // eslint-disable-next-line no-plusplus
    for (let i = 0; i < values.length; i++) {
      if (values[i] === null) {
        // eslint-disable-next-line no-await-in-loop
        await removeActiveConnection(projectId, identityId, connections[i]);
      }
    }

    return redis.llen(set);
  };

  const onDisconnect = async (client: EventStreamClient) => {
    try {
      client.close();
      clients.delete(client);
      await removeActiveConnection(client.auth.projectId, client.auth.actorId, client.id);
    } catch (error) {
      logger.error(error, "Error during SSE stream disconnection");
    }
  };

  function filterEventsForClient(client: EventStreamClient, event: EventData, registered: RegisteredEvent[]) {
    const eventType = toBusEventName(event.data.eventType);
    const match = registered.find((r) => r.event === eventType);
    if (!match) return;

    const item = event.data.payload;

    if (Array.isArray(item)) {
      if (item.length === 0) return;

      const baseSubject = {
        eventType,
        environment: undefined as string | undefined,
        secretPath: undefined as string | undefined
      };

      const filtered = item.filter((ev) => {
        baseSubject.secretPath = ev.secretPath ?? "/";
        baseSubject.environment = ev.environment;

        return client.matcher.can("subscribe", subject(event.type, baseSubject));
      });

      if (filtered.length === 0) return;

      return client.send({
        ...event,
        data: {
          ...event.data,
          payload: filtered
        }
      });
    }

    // For single item
    const baseSubject = {
      eventType,
      secretPath: item.secretPath ?? "/",
      environment: item.environment
    };

    if (client.matcher.can("subscribe", subject(event.type, baseSubject))) {
      client.send(event);
    }
  }

  const subscribe = async (
    opts: IEventStreamClientOpts & {
      onClose?: () => void;
    }
  ) => {
    const client = createEventStreamClient(redis, opts);

    // Set up event listener on event bus
    const unsubscribe = bus.subscribe((event) => {
      if (event.type !== opts.type) return;
      filterEventsForClient(client, event, opts.registered);
    });

    client.stream.on("close", () => {
      unsubscribe();
      void onDisconnect(client); // This will never throw
    });

    await client.open();

    clients.add(client);

    return client;
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
