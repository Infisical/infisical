import net from "node:net";

import { logger } from "@app/lib/logger";

import { resolveEndReason } from "../pam-web-access-fns";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
} from "../pam-web-access-types";

// Blind bridge between the browser WebSocket and the relay/gateway tunnel.
// The backend copies bytes both ways without interpreting them. The gateway
// currently answers with a stub; Phase 2 replaces that with headless Chromium.
export const handleWebAppSession = async (
  ctx: TSessionContext,
  _params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, isNearSessionExpiry, onCleanup } =
    ctx;

  const tunnel = net.connect({ host: "127.0.0.1", port: relayPort });

  const onMessage = (raw: Buffer | ArrayBuffer | Buffer[]) => {
    const buf = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    tunnel.write(buf);
  };

  return new Promise((resolve, reject) => {
    tunnel.on("connect", () => {
      sendMessage({
        type: TerminalServerMessageType.Ready,
        data: `web-app: connected to ${resourceName}\r\n`
      });
      logger.info({ sessionId }, "web-app tunnel bridge opened");

      // tunnel -> browser
      tunnel.on("data", (chunk: Buffer) => {
        sendMessage({ type: TerminalServerMessageType.Output, data: chunk.toString("utf-8") });
      });

      // browser -> tunnel
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
