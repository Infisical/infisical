import pg from "pg";

import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "@app/ee/services/pam-resource/postgres/postgres-resource-types";
import { logger } from "@app/lib/logger";

import { createPamSqlRepl } from "./pam-web-access-repl";
import {
  parseWsClientMessage,
  resolveEndReason,
  SessionEndReason,
  TSessionContext,
  TSessionHandlerResult,
  WsMessageType
} from "./pam-web-access-types";

type TPostgresSessionParams = {
  connectionDetails: TPostgresResourceConnectionDetails;
  credentials: TPostgresAccountCredentials;
};

export const handlePostgresSession = async (
  ctx: TSessionContext,
  params: TPostgresSessionParams
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, isNearSessionExpiry, onCleanup } =
    ctx;
  const { connectionDetails, credentials } = params;

  const pgClient = new pg.Client({
    host: "localhost",
    port: relayPort,
    user: credentials.username,
    database: connectionDetails.database,
    password: "",
    ssl: false,
    connectionTimeoutMillis: 30_000,
    statement_timeout: 30_000,
    types: {
      getTypeParser: () => (val: string | Buffer) => (typeof val === "string" ? val : val.toString("hex"))
    }
  });

  await pgClient.connect();

  const repl = createPamSqlRepl(pgClient);

  sendMessage({
    type: WsMessageType.Ready,
    data: `Connected to ${resourceName} (${connectionDetails.database}) as ${credentials.username}\n\n`,
    prompt: "=> "
  });

  logger.info({ sessionId }, "Postgres web access session established");

  // Sequential message processing to prevent concurrent query issues
  let processingPromise = Promise.resolve();

  socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    processingPromise = processingPromise
      .then(async () => {
        const message = parseWsClientMessage(rawData);
        if (!message) {
          sendMessage({
            type: WsMessageType.Output,
            data: "Invalid message format\n",
            prompt: repl.getPrompt()
          });
          return;
        }

        if (message.type === WsMessageType.Control) {
          if (message.data === "quit") {
            sendSessionEnd(SessionEndReason.UserQuit);
            onCleanup();
            socket.close();
            return;
          }
          if (message.data === "clear-buffer") {
            repl.clearBuffer();
            return;
          }
          return;
        }

        if (message.type === WsMessageType.Input) {
          const replResult = await repl.processInput(message.data);

          if (replResult.shouldClose) {
            sendSessionEnd(SessionEndReason.UserQuit);
            onCleanup();
            socket.close();
            return;
          }

          sendMessage({
            type: WsMessageType.Output,
            data: replResult.output,
            prompt: replResult.prompt
          });
        }
      })
      .catch((err) => {
        logger.error(err, "Error processing Postgres message");
        sendMessage({
          type: WsMessageType.Output,
          data: "Internal error\n",
          prompt: "=> "
        });
      });
  });

  // Tunnel drop detection
  pgClient.on("error", (err) => {
    logger.error(err, "Database connection error");
    sendSessionEnd(resolveEndReason(isNearSessionExpiry));
    onCleanup();
    socket.close();
  });

  pgClient.on("end", () => {
    sendSessionEnd(resolveEndReason(isNearSessionExpiry));
    onCleanup();
    socket.close();
  });

  return {
    cleanup: async () => {
      try {
        await pgClient.end();
      } catch (err) {
        logger.debug(err, "Error closing pg client");
      }
    }
  };
};
