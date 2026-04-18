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

    // Remove the early-buffer handler installed by the service, replay
    // anything it captured, then hook up the real forwarder.
    const bufState = socket as unknown as {
      _pamEarlyMessages?: { data: Buffer; isBinary: boolean }[];
      _pamEarlyBufferHandler?: (raw: unknown, isBinary: boolean) => void;
    };
    if (bufState._pamEarlyBufferHandler) {
      socket.off("message", bufState._pamEarlyBufferHandler);
    }
    const buffered = bufState._pamEarlyMessages ?? [];
    bufState._pamEarlyMessages = undefined;
    bufState._pamEarlyBufferHandler = undefined;
    for (const msg of buffered) {
      logger.info(
        {
          sessionId,
          isBinary: msg.isBinary,
          len: msg.data.length,
          head: msg.data.subarray(0, Math.min(16, msg.data.length)).toString("hex")
        },
        `Windows RDP: replay buffered ws->relay [sessionId=${sessionId}] [len=${msg.data.length}]`
      );
      if (msg.isBinary && tcp.writable) tcp.write(msg.data);
    }

    socket.on("message", (raw, isBinary) => {
      const buf = Buffer.isBuffer(raw)
        ? raw
        : Array.isArray(raw)
          ? Buffer.concat(raw as Buffer[])
          : Buffer.from(raw as ArrayBuffer);
      logger.info(
        { sessionId, isBinary, len: buf.length, head: buf.subarray(0, Math.min(16, buf.length)).toString("hex") },
        `Windows RDP: ws->relay [sessionId=${sessionId}] [isBinary=${isBinary}] [len=${buf.length}]`
      );
      if (!isBinary) return;
      if (tcp.writable) tcp.write(buf);
    });
    socket.on("close", (code, reason) => {
      logger.info(
        { sessionId, code, reason: reason?.toString?.() },
        `Windows RDP: ws closed [sessionId=${sessionId}] [code=${code}]`
      );
      clearInterval(ping);
      end(SessionEndReason.UserInitiated);
    });
    socket.on("error", (err) => {
      logger.warn({ sessionId, err }, `Windows RDP: ws error [sessionId=${sessionId}]`);
      clearInterval(ping);
      end(SessionEndReason.UserInitiated);
    });

    tcp.on("data", (chunk: Buffer) => {
      logger.info(
        { sessionId, len: chunk.length, head: chunk.subarray(0, Math.min(16, chunk.length)).toString("hex") },
        `Windows RDP: relay->ws [sessionId=${sessionId}] [len=${chunk.length}]`
      );
      try {
        socket.send(chunk, { binary: true });
      } catch {
        end(SessionEndReason.UserInitiated);
      }
    });
    tcp.on("close", () => {
      logger.info({ sessionId }, `Windows RDP: relay closed [sessionId=${sessionId}]`);
      clearInterval(ping);
      end(SessionEndReason.UserInitiated);
    });
    tcp.on("error", (err) => {
      logger.warn({ sessionId, err }, `Windows RDP: relay error [sessionId=${sessionId}]`);
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
