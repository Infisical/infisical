/* eslint-disable no-continue */
import { logger } from "@app/lib/logger";

import { TEventBusService } from "./event-bus-service";
import { EventStreamClient, IEventStreamClientOpts } from "./event-sse-stream";

export type TEventServiceOptions = {
  heartbeat: number | false; // Interval in seconds to send heartbeat messages
};

export const sseServiceFactory = (bus: TEventBusService, options: TEventServiceOptions) => {
  let heartbeatInterval: NodeJS.Timeout | null = null;

  const clients = new Set<EventStreamClient>();

  /**
   * Sends a heartbeat message to all connected clients.
   * This is used to keep the connection alive and check if clients are still connected.
   */
  const heartbeat = () => {
    for (const client of clients) {
      if (client.closed) continue;
      client.send({
        type: "ping",
        time: Date.now()
      });
    }
  };

  const refresh = () => {
    try {
      for (const client of clients) {
        void client.refresh();
      }
    } catch (error) {
      logger.error(error, "Error refreshing permissions for event bus clients");
    }
  };

  if (options.heartbeat) {
    heartbeatInterval = setInterval(heartbeat, options.heartbeat * 1000);
  }

  const refreshInterval = setInterval(refresh, 60 * 1000); // Refresh permissions every minute

  const subscribe = async (
    opts: IEventStreamClientOpts & {
      onClose?: () => void;
    }
  ) => {
    const stream = new EventStreamClient(opts);

    // Set up event listener on event bus
    const unsubscribe = bus.subscribe(stream.onMessage);

    clients.add(stream);

    stream.on("close", () => {
      unsubscribe();
      stream.destroy();
      clients.delete(stream);
      opts.onClose?.();
    });

    stream.on("error", (error: Error) => {
      logger.error(error, "Error in SSE stream client");
      stream.send({
        type: "error",
        data: {
          message: error.message
        }
      });
      stream.close();
    });

    await stream.refresh();

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

  return { subscribe, close };
};

export type TServerSentEventsService = ReturnType<typeof sseServiceFactory>;
