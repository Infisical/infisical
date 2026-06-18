import { Client, type ClientChannel, type ConnectConfig } from "ssh2";

import { logger } from "@app/lib/logger";

import { parseClientMessage, resolveEndReason } from "../pam-web-access-fns";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
} from "../pam-web-access-types";
import { SshClientMessageSchema, SshClientMessageType } from "./pam-ssh-ws-types";

export const handleSSHSession = async (
  ctx: TSessionContext,
  params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, isNearSessionExpiry, onCleanup } =
    ctx;
  const credentials = params.credentials as { username: string };

  const client = new Client();
  let stream: ClientChannel | null = null;

  const connectConfig: ConnectConfig = {
    host: "localhost",
    port: relayPort,
    username: credentials.username,
    readyTimeout: 30_000,
    authHandler: ["none"]
  };

  return new Promise((resolve, reject) => {
    client.on("ready", () => {
      client.shell({ term: "xterm-256color", rows: 24, cols: 80 }, (err, shellStream) => {
        if (err) {
          logger.error(err, "Failed to open SSH shell");
          sendSessionEnd(SessionEndReason.SetupFailed);
          client.end();
          reject(err);
          return;
        }

        stream = shellStream;

        sendMessage({
          type: TerminalServerMessageType.Ready,
          data: `Connected to ${resourceName} as ${credentials.username}\r\n`
        });

        logger.info({ sessionId }, "SSH web access session shell opened");

        shellStream.on("data", (data: Buffer) => {
          sendMessage({
            type: TerminalServerMessageType.Output,
            data: data.toString("utf-8")
          });
        });

        shellStream.stderr.on("data", (data: Buffer) => {
          sendMessage({
            type: TerminalServerMessageType.Output,
            data: data.toString("utf-8")
          });
        });

        socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
          const message = parseClientMessage(rawData, SshClientMessageSchema);
          if (!message) return;

          if (message.type === SshClientMessageType.Input) {
            shellStream.write(message.data);
          } else if (message.type === SshClientMessageType.Resize) {
            try {
              const { rows, cols } = JSON.parse(message.data) as { rows: number; cols: number };
              shellStream.setWindow(rows, cols, 0, 0);
            } catch {
              logger.debug("Invalid resize data received");
            }
          } else if (message.type === SshClientMessageType.Control) {
            if (message.data === "quit") {
              shellStream.close();
              client.end();
            }
          }
        });

        shellStream.on("close", () => {
          sendSessionEnd(resolveEndReason(isNearSessionExpiry));
          onCleanup();
          socket.close();
        });

        resolve({
          cleanup: async () => {
            try {
              stream?.close();
            } catch (streamErr) {
              logger.debug(streamErr, "Error closing SSH stream");
            }
            try {
              client.end();
            } catch (clientErr) {
              logger.debug(clientErr, "Error closing SSH client");
            }
          }
        });
      });
    });

    client.on("error", (err) => {
      logger.error(err, "SSH client connection error");
      if (stream) {
        sendSessionEnd(resolveEndReason(isNearSessionExpiry));
        onCleanup();
        socket.close();
      } else {
        reject(err);
      }
    });

    client.on("end", () => {
      logger.debug({ sessionId }, "SSH client connection ended");
    });

    client.connect(connectConfig);
  });
};
