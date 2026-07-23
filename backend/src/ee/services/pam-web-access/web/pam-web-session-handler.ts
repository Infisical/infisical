import net from "node:net";

import { logger } from "@app/lib/logger";

import { TSessionContext, TSessionHandlerResult } from "../pam-web-access-types";

// The backend is a transparent byte pump between the browser WebSocket and the
// relay→gateway tunnel (a loopback TCP port). It does NOT understand the web
// session protocol: the gateway (driving Chromium over CDP) and the browser
// speak a length-prefixed JSON framing directly to each other through this pipe.
// This mirrors the RDP handler exactly — only the payload on the wire differs.
const WEB_TCP_CONNECT_TIMEOUT_MS = 30_000;
const WS_HIGH_WATER_MARK = 1024 * 1024;

const wsRawToBuffer = (raw: Buffer | ArrayBuffer | Buffer[]): Buffer => {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
};

export const handleWebSession = async (ctx: TSessionContext): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, sessionId, onCleanup, earlyMessages, releaseEarlyBuffer } = ctx;

  const tcpSocket = new net.Socket();
  let cleanedUp = false;

  const teardown = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      tcpSocket.destroy();
    } catch (err) {
      logger.debug(err, "web session: error destroying tcp socket");
    }
  };

  return new Promise<TSessionHandlerResult>((resolve, reject) => {
    const connectTimeout = setTimeout(() => {
      logger.error({ sessionId }, `web session: relay connect timed out [sessionId=${sessionId}]`);
      if (!cleanedUp) onCleanup();
      teardown();
      reject(new Error("Web session relay connection timed out"));
    }, WEB_TCP_CONNECT_TIMEOUT_MS);

    tcpSocket.once("connect", () => {
      clearTimeout(connectTimeout);
      tcpSocket.removeAllListeners("error");

      releaseEarlyBuffer();
      for (const msg of earlyMessages) {
        if (tcpSocket.writable) {
          tcpSocket.write(wsRawToBuffer(msg.data));
        }
      }

      // browser → gateway (input events / navigate). Accept text or binary;
      // the framing lives inside the payload, so we forward raw bytes.
      socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[]) => {
        if (cleanedUp || tcpSocket.destroyed || !tcpSocket.writable) return;
        const buf = wsRawToBuffer(raw);
        if (buf.length === 0) return;
        try {
          tcpSocket.write(buf);
        } catch {
          if (!cleanedUp) onCleanup();
          teardown();
        }
      });

      // gateway → browser (screencast frames / network events). Forwarded as
      // binary; the browser reframes the length-prefixed stream.
      tcpSocket.on("data", (chunk: Buffer) => {
        if (cleanedUp || socket.readyState !== socket.OPEN) return;
        if (socket.bufferedAmount > WS_HIGH_WATER_MARK) {
          tcpSocket.pause();
        }
        socket.send(chunk, { binary: true }, (err) => {
          if (err) {
            logger.error(err, `web session: ws send failed [sessionId=${sessionId}]`);
            if (!cleanedUp) onCleanup();
            teardown();
            return;
          }
          if (tcpSocket.isPaused() && socket.bufferedAmount <= WS_HIGH_WATER_MARK) {
            tcpSocket.resume();
          }
        });
      });

      tcpSocket.on("close", () => {
        logger.info({ sessionId }, `web session: tcp socket closed [sessionId=${sessionId}]`);
        if (!cleanedUp) onCleanup();
        teardown();
        try {
          socket.close();
        } catch (err) {
          logger.debug(err, "web session: error closing ws after tcp close");
        }
      });

      tcpSocket.on("error", (err) => {
        logger.error(err, `web session: tcp socket error [sessionId=${sessionId}]`);
        if (!cleanedUp) onCleanup();
        teardown();
      });

      resolve({
        cleanup: async () => {
          teardown();
        }
      });
    });

    tcpSocket.once("error", (err) => {
      clearTimeout(connectTimeout);
      logger.error(err, `web session: failed to connect to relay [sessionId=${sessionId}]`);
      if (!cleanedUp) onCleanup();
      teardown();
      reject(err);
    });

    tcpSocket.connect(relayPort, "127.0.0.1");
  });
};
