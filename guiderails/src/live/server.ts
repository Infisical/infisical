import http from "node:http";

import { WebSocketServer } from "ws";

import type { RunEvents } from "../run/events.js";
import { ensureDashboardBuild } from "./build.js";
import { serveStatic } from "./static.js";

/**
 * Live view: the built dashboard plus one WebSocket carrying the run's own event stream.
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

/** So the dev proxy in `dashboard/vite.config.ts` has one path to forward, and no others. */
const EVENTS_PATH = "/events";

export const startLiveServer = async (
  events: RunEvents,
  port = Number.parseInt(process.env.GUIDERAILS_LIVE_PORT ?? "4488", 10)
): Promise<LiveServer> => {
  const built = await ensureDashboardBuild();
  if (!built.ok) {
    // Degrade, do not fail: a walk costs API calls and a live instance, and the console reporter
    // still has every event. Same call `screencast.ts` makes when CDP is unavailable.
    process.stdout.write(
      `\n  the live dashboard could not be built, continuing without it\n  ${built.reason}\n`
    );
  } else if (built.built) {
    process.stdout.write("  built the live dashboard (sources changed)\n");
  }

  const server = http.createServer((request, response) => {
    if (!built.ok) {
      response.writeHead(503, { "content-type": "text/plain; charset=utf-8" });
      response.end(`The dashboard could not be built:\n\n${built.reason}\n`);
      return;
    }
    // Query strings are for the client, never for file resolution.
    const urlPath = (request.url ?? "/").split("?")[0] ?? "/";
    serveStatic(built.dist, urlPath, response);
  });

  const sockets = new WebSocketServer({ server, path: EVENTS_PATH });

  sockets.on("connection", (socket) => {
    for (const event of events.replay()) {
      socket.send(JSON.stringify(event));
    }
    // Lets the client paint several hundred replayed events at once instead of animating each one
    // as though it had just happened.
    socket.send(JSON.stringify({ type: "replay_end" }));

    const detach = events.on((event) => {
      if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(event));
    });
    socket.on("close", detach);
  });

  await new Promise<void>((resolve, reject) => {
    const fail = (error: NodeJS.ErrnoException): void => {
      // A second walk while one is already serving is the common case, and the bare stack trace it
      // used to print buried the one fact that matters. `ws` also re-emits the error on the socket
      // server, so it has to be silenced there or Node kills the process on an unhandled 'error'.
      sockets.on("error", () => {});
      reject(
        error.code === "EADDRINUSE"
          ? new Error(
              `Port ${port} is already in use, most likely by another guiderails run. ` +
                `Stop it, or set GUIDERAILS_LIVE_PORT to a free port.`
            )
          : error
      );
    };

    server.once("error", fail);
    server.listen(port, () => {
      server.off("error", fail);
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
