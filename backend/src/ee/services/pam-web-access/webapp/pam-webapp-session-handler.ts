import { logger } from "@app/lib/logger";

import { TerminalServerMessageType, TSessionContext, TSessionHandlerResult } from "../pam-web-access-types";

// Phase 1 scaffold: echoes WS messages back to the client to validate the
// browser -> backend WebSocket path before wiring the relay/gateway tunnel and Chromium.
// The relay server is set up by the service but this handler intentionally ignores `relayPort`.
export const handleWebAppSession = async (
  ctx: TSessionContext,
  _params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
): Promise<TSessionHandlerResult> => {
  const { socket, resourceName, sessionId, sendMessage } = ctx;

  sendMessage({
    type: TerminalServerMessageType.Ready,
    data: `web-app echo: connected to ${resourceName}\r\n`
  });
  logger.info({ sessionId }, "web-app echo session opened");

  const onMessage = (raw: Buffer | ArrayBuffer | Buffer[]) => {
    const buf = Array.isArray(raw) ? Buffer.concat(raw) : Buffer.isBuffer(raw) ? raw : Buffer.from(raw);
    sendMessage({ type: TerminalServerMessageType.Output, data: `echo: ${buf.toString("utf-8")}` });
  };
  socket.on("message", onMessage);

  return {
    cleanup: async () => {
      socket.off("message", onMessage);
    }
  };
};
