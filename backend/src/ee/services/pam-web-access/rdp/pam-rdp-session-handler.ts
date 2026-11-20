import net from "node:net";

import { logger } from "@app/lib/logger";

import { TSessionContext, TSessionHandlerResult } from "../pam-web-access-types";

const RDP_TCP_CONNECT_TIMEOUT_MS = 30_000;

const wsRawToBuffer = (raw: Buffer | ArrayBuffer | Buffer[]): Buffer => {
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.concat(raw);
  return Buffer.from(raw);
};

const relayRawSession = async (
  ctx: TSessionContext,
  { name, wsHighWaterMarkBytes }: { name: string; wsHighWaterMarkBytes: number }
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, sessionId, onCleanup, earlyMessages, releaseEarlyBuffer } = ctx;

  const tcpSocket = new net.Socket();
  tcpSocket.setNoDelay(true);
  let cleanedUp = false;

  const teardown = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    try {
      tcpSocket.destroy();
    } catch (err) {
      logger.debug(err, `${name} session: error destroying tcp socket`);
    }
  };

  return new Promise<TSessionHandlerResult>((resolve, reject) => {
    const connectTimeout = setTimeout(() => {
      logger.error({ sessionId }, `${name} session: relay connect timed out`);
      if (!cleanedUp) onCleanup();
      teardown();
      reject(new Error(`${name} relay connection timed out`));
    }, RDP_TCP_CONNECT_TIMEOUT_MS);

    tcpSocket.once("connect", () => {
      clearTimeout(connectTimeout);
      tcpSocket.removeAllListeners("error");

      releaseEarlyBuffer();
      for (const msg of earlyMessages) {
        if (msg.isBinary && tcpSocket.writable) {
          tcpSocket.write(msg.data);
        }
      }

      socket.on("message", (raw: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
        if (cleanedUp || tcpSocket.destroyed || !tcpSocket.writable) return;
        if (!isBinary) return;
        const buf = wsRawToBuffer(raw);
        if (buf.length === 0) return;
        try {
          tcpSocket.write(buf);
        } catch {
          if (!cleanedUp) onCleanup();
          teardown();
        }
      });

      tcpSocket.on("data", (chunk: Buffer) => {
        if (cleanedUp || socket.readyState !== socket.OPEN) return;
        if (socket.bufferedAmount > wsHighWaterMarkBytes) {
          tcpSocket.pause();
        }
        socket.send(chunk, { binary: true }, (err) => {
          if (err) {
            logger.error(err, `${name} session: ws send failed`);
            if (!cleanedUp) onCleanup();
            teardown();
            return;
          }
          if (tcpSocket.isPaused() && socket.bufferedAmount <= wsHighWaterMarkBytes) {
            tcpSocket.resume();
          }
        });
      });

      tcpSocket.on("close", () => {
        logger.info({ sessionId }, `${name} session: tcp socket closed`);
        if (!cleanedUp) onCleanup();
        teardown();
        try {
          socket.close();
        } catch (err) {
          logger.debug(err, `${name} session: error closing ws after tcp close`);
        }
      });

      tcpSocket.on("error", (err) => {
        logger.error(err, `${name} session: tcp socket error`);
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
      logger.error(err, `${name} session: failed to connect to relay`);
      if (!cleanedUp) onCleanup();
      teardown();
      reject(err);
    });

    tcpSocket.connect(relayPort, "127.0.0.1");
  });
};

export const handleRdpSession = (ctx: TSessionContext) =>
  relayRawSession(ctx, { name: "rdp", wsHighWaterMarkBytes: 1024 * 1024 });

// A web app session streams whole screenshots, so a deep buffer queues frames the viewer will only
// see late. A shallow one pauses the tunnel sooner, and the gateway then sends only the newest frame.
export const handleWebAppSession = (ctx: TSessionContext) =>
  relayRawSession(ctx, { name: "web app", wsHighWaterMarkBytes: 256 * 1024 });
