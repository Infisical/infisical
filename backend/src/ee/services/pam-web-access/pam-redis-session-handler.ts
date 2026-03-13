import { Redis } from "ioredis";

import {
  TRedisAccountCredentials,
  TRedisResourceConnectionDetails
} from "@app/ee/services/pam-resource/redis/redis-resource-types";
import { logger } from "@app/lib/logger";

import { formatRedisReply, tokenizeRedisInput } from "./pam-redis-formatter";
import {
  parseWsClientMessage,
  resolveEndReason,
  SessionEndReason,
  TSessionContext,
  TSessionHandlerResult,
  WsMessageType
} from "./pam-web-access-types";

type TRedisSessionParams = {
  connectionDetails: TRedisResourceConnectionDetails;
  credentials: TRedisAccountCredentials;
};

const executeCommand = async (redisClient: Redis, input: string): Promise<{ output: string; shouldClose: boolean }> => {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { output: "", shouldClose: false };
  }

  const lower = trimmed.toLowerCase();
  if (lower === "quit" || lower === "exit") {
    return { output: "Goodbye!\n", shouldClose: true };
  }

  const tokens = tokenizeRedisInput(trimmed);
  if (tokens.length === 0) {
    return { output: "", shouldClose: false };
  }

  const [command, ...args] = tokens;

  try {
    const result = await redisClient.call(command, ...args);
    return { output: `${formatRedisReply(result)}\n`, shouldClose: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: `(error) ${message}\n`, shouldClose: false };
  }
};

export const handleRedisSession = async (
  ctx: TSessionContext,
  params: TRedisSessionParams
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, isNearSessionExpiry, onCleanup } =
    ctx;
  const { connectionDetails, credentials } = params;

  const redisClient = new Redis({
    host: "localhost",
    port: relayPort,
    connectTimeout: 30_000,
    maxRetriesPerRequest: 0,
    reconnectOnError: () => false,
    retryStrategy: () => null
  });

  // Wait for connection to be ready
  const connectionReady = new Promise<void>((resolve, reject) => {
    redisClient.once("ready", resolve);
    redisClient.once("error", reject);
  });

  try {
    await connectionReady;
  } catch (err) {
    try {
      redisClient.disconnect();
    } catch {
      /* ignore */
    }
    throw err;
  }

  const prompt = `${connectionDetails.host}:${connectionDetails.port}> `;

  sendMessage({
    type: WsMessageType.Ready,
    data: `Connected to ${resourceName} (${connectionDetails.host}:${connectionDetails.port}) as ${credentials.username || "default"}\n\n`,
    prompt
  });

  logger.info({ sessionId }, "Redis web access session established");

  // Sequential message processing to prevent concurrent command issues
  let processingPromise = Promise.resolve();

  socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    processingPromise = processingPromise
      .then(async () => {
        const message = parseWsClientMessage(rawData);
        if (!message) {
          sendMessage({
            type: WsMessageType.Output,
            data: "Invalid message format\n",
            prompt
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
            return;
          }
          return;
        }

        if (message.type === WsMessageType.Input) {
          const result = await executeCommand(redisClient, message.data);

          if (result.shouldClose) {
            sendSessionEnd(SessionEndReason.UserQuit);
            onCleanup();
            socket.close();
            return;
          }

          sendMessage({
            type: WsMessageType.Output,
            data: result.output,
            prompt
          });
        }
      })
      .catch((err) => {
        logger.error(err, "Error processing Redis message");
        sendMessage({
          type: WsMessageType.Output,
          data: "Internal error\n",
          prompt
        });
      });
  });

  // Tunnel drop detection
  redisClient.on("error", (err) => {
    logger.error(err, "Redis connection error");
    sendSessionEnd(resolveEndReason(isNearSessionExpiry));
    onCleanup();
    socket.close();
  });

  redisClient.on("close", () => {
    sendSessionEnd(resolveEndReason(isNearSessionExpiry));
    onCleanup();
    socket.close();
  });

  return {
    cleanup: async () => {
      try {
        await redisClient.quit();
      } catch (err) {
        logger.debug(err, "Error closing Redis client");
      }
    }
  };
};
