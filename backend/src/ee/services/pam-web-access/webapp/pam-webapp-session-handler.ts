import net from "node:net";

import { logger } from "@app/lib/logger";

import { resolveEndReason } from "../pam-web-access-fns";
import { SessionEndReason, TSessionContext, TSessionHandlerResult } from "../pam-web-access-types";

// Blind bridge between the browser WebSocket and the relay/gateway tunnel.
// Forwards raw bytes both ways: the gateway streams length-prefixed JPEG frames
// (reassembled and drawn on a <canvas> by the client), and client input flows back.
export const handleWebAppSession = async (
  ctx: TSessionContext,
  _params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, sessionId, sendSessionEnd, isNearSessionExpiry, onCleanup } = ctx;

  const tunnel = net.connect({ host: "127.0.0.1", port: relayPort });

  const onMessage = (raw: Buffer | ArrayBuffer | Buffer[]) => {
    const buf = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    tunnel.write(buf);
  };

  return new Promise((resolve, reject) => {
    tunnel.on("connect", () => {
      logger.info({ sessionId }, "web-app tunnel bridge opened");

      // tunnel -> browser: raw binary frames
      tunnel.on("data", (chunk: Buffer) => {
        if (socket.readyState === 1) socket.send(chunk);
      });

      // browser -> tunnel: raw input bytes
      socket.on("message", onMessage);

      resolve({
        cleanup: async () => {
          socket.off("message", onMessage);
          tunnel.destroy();
        }
      });
    });

    tunnel.on("close", () => {
      sendSessionEnd(resolveEndReason(isNearSessionExpiry));
      onCleanup();
      socket.close();
    });

    tunnel.on("error", (err) => {
      logger.error(err, `web-app tunnel error [sessionId=${sessionId}]`);
      sendSessionEnd(SessionEndReason.SetupFailed);
      reject(err);
    });
  });
};
