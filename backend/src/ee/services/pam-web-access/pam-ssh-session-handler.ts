import { Client, type ClientChannel, type ConnectConfig } from "ssh2";

import {
  TSSHAccountCredentials,
  TSSHResourceConnectionDetails
} from "@app/ee/services/pam-resource/ssh/ssh-resource-types";
import { logger } from "@app/lib/logger";

import { SshClientMessageSchema } from "./pam-ssh-ws-types";
import { parseClientMessage, resolveEndReason } from "./pam-web-access-fns";
import { SessionEndReason, TSessionContext, TSessionHandlerResult } from "./pam-web-access-types";

type TSSHSessionParams = {
  connectionDetails: TSSHResourceConnectionDetails;
  credentials: TSSHAccountCredentials;
};

export const handleSSHSession = async (
  ctx: TSessionContext,
  params: TSSHSessionParams
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, isNearSessionExpiry, onCleanup } =
    ctx;
  const { credentials } = params;

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

        // Send Ready message
        sendMessage({
          type: "ready",
          data: `Connected to ${resourceName} as ${credentials.username}\r\n`
        });

        logger.info({ sessionId }, "SSH web access session shell opened");

        // SSH -> WS: forward output from remote shell to WebSocket
        shellStream.on("data", (data: Buffer) => {
          sendMessage({
            type: "output",
            data: data.toString("utf-8")
          });
        });

        shellStream.stderr.on("data", (data: Buffer) => {
          sendMessage({
            type: "output",
            data: data.toString("utf-8")
          });
        });

        // WS -> SSH: forward input from WebSocket to remote shell
        socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
          const message = parseClientMessage(rawData, SshClientMessageSchema);
          if (!message) return;

          if (message.type === "input") {
            // Raw keystroke forwarding — no buffering, no local echo
            shellStream.write(message.data);
          } else if (message.type === "resize") {
            try {
              const { rows, cols } = JSON.parse(message.data) as { rows: number; cols: number };
              shellStream.setWindow(rows, cols, 0, 0);
            } catch {
              logger.debug("Invalid resize data received");
            }
          } else if (message.type === "control") {
            if (message.data === "quit") {
              shellStream.close();
              client.end();
            }
          }
        });

        // Shell stream close
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
        // Session was established, then errored
        sendSessionEnd(resolveEndReason(isNearSessionExpiry));
        onCleanup();
        socket.close();
      } else {
        // Connection never established
        reject(err);
      }
    });

    client.on("end", () => {
      logger.debug({ sessionId }, "SSH client connection ended");
    });

    client.connect(connectConfig);
  });
};
