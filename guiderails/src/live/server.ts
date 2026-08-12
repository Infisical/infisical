import http from "node:http";

import { WebSocketServer } from "ws";

import type { RunEvents } from "../run/events.js";
import { DASHBOARD_HTML } from "./dashboard.js";

/**
 * Live view: one static page plus one WebSocket carrying the run's own event stream.
 *
 * The dashboard is a consumer of the same stream the console reporter reads, never a separate
 * source of truth, so it cannot show the audience something the log does not contain.
 *
 * A client that connects mid-run gets the buffered history replayed first, so joining late (or
 * reloading during a demo) still shows the steps already walked instead of an empty pane.
 */

export type LiveServer = {
  url: string;
  close: () => Promise<void>;
};

export const startLiveServer = async (
  events: RunEvents,
  port = Number.parseInt(process.env.GUIDERAILS_LIVE_PORT ?? "4488", 10)
): Promise<LiveServer> => {
  const server = http.createServer((request, response) => {
    if (request.url === "/" || request.url?.startsWith("/?")) {
      response.writeHead(200, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(DASHBOARD_HTML);
      return;
    }
    response.writeHead(404, { "content-type": "text/plain" });
    response.end("not found");
  });

  const sockets = new WebSocketServer({ server });

  sockets.on("connection", (socket) => {
    for (const event of events.replay()) {
      socket.send(JSON.stringify(event));
    }
    const detach = events.on((event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    socket.on("close", detach);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    url: `http://localhost:${port}`,
    close: async () => {
      await new Promise<void>((resolve) => {
        sockets.close(() => {
          server.close(() => resolve());
        });
      });
    }
  };
};
