import { Socket as NetSocket, createConnection } from "node:net";

import {
  TWindowsAccountCredentials,
  TWindowsResourceConnectionDetails
} from "@app/ee/services/pam-resource/windows-server/windows-server-resource-types";
import { logger } from "@app/lib/logger";

import { SessionEndReason, TSessionContext, TSessionHandlerResult } from "./pam-web-access-types";

type TWindowsSessionParams = {
  connectionDetails: TWindowsResourceConnectionDetails;
  credentials: TWindowsAccountCredentials;
};

/**
 * Windows (RDP) browser session handler.
 *
 * The backend is a thin byte-pump between the browser's WebSocket and
 * the gateway relay. All RDP protocol work -- RDCleanPath handshake,
 * TLS termination with the target, CredSSP credential injection, event
 * decoding for session logs -- happens inside the gateway (Rust bridge
 * in packages/pam/handlers/rdp/native). Keeping everything in one place
 * preserves the gateway-centric event tap and credential-injection
 * story we use for CLI sessions.
 *
 * The credentials argument is unused here deliberately. The gateway
 * fetches them through the existing per-session credentials endpoint.
 */
const WS_IDLE_PING_MS = 25_000;

export const handleWindowsRdpSession = async (
  ctx: TSessionContext,
  _params: TWindowsSessionParams
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, sessionId, onCleanup } = ctx;

  let tcp: NetSocket;
  try {
    tcp = await dialRelay(relayPort);
  } catch (err) {
    logger.error({ sessionId, err }, "Windows RDP: failed to dial relay");
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  logger.info({ sessionId }, "Windows RDP: relay open, entering byte-pump");

  return new Promise((resolve) => {
    let settled = false;
    const end = (reason: SessionEndReason) => {
      if (settled) return;
      settled = true;
      tcp.destroy();
      safeClose(ctx);
      onCleanup();
      resolve({ endReason: reason });
    };

    const ping = setInterval(() => {
      try {
        socket.ping();
      } catch {
        /* socket may be closing */
      }
    }, WS_IDLE_PING_MS);

    socket.on("message", (raw, isBinary) => {
      if (!isBinary) return;
      const buf = Buffer.isBuffer(raw)
        ? raw
        : Array.isArray(raw)
          ? Buffer.concat(raw as Buffer[])
          : Buffer.from(raw as ArrayBuffer);
      if (tcp.writable) tcp.write(buf);
    });
    socket.on("close", () => {
      clearInterval(ping);
      end(SessionEndReason.UserInitiated);
    });
    socket.on("error", () => {
      clearInterval(ping);
      end(SessionEndReason.UserInitiated);
    });

    tcp.on("data", (chunk: Buffer) => {
      try {
        socket.send(chunk, { binary: true });
      } catch {
        end(SessionEndReason.UserInitiated);
      }
    });
    tcp.on("close", () => {
      clearInterval(ping);
      end(SessionEndReason.UserInitiated);
    });
    tcp.on("error", (err) => {
      logger.warn({ sessionId, err }, "Windows RDP: relay error");
      clearInterval(ping);
      end(SessionEndReason.UserInitiated);
    });
  });
};

const dialRelay = (port: number): Promise<NetSocket> =>
  new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => resolve(socket));
    socket.once("error", reject);
  });

const safeClose = (ctx: TSessionContext) => {
  try {
    ctx.socket.close(1000, "session ended");
  } catch {
    /* already closed */
  }
};
