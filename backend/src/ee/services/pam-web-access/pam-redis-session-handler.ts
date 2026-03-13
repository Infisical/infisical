import { Redis } from "ioredis";

import {
  TRedisAccountCredentials,
  TRedisResourceConnectionDetails
} from "@app/ee/services/pam-resource/redis/redis-resource-types";
import { logger } from "@app/lib/logger";

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

const tokenizeInput = (input: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let inQuote: "'" | '"' | null = null;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
};

const formatRedisReply = (reply: unknown, indent: number = 0): string => {
  const prefix = " ".repeat(indent);

  if (reply === null || reply === undefined) {
    return `${prefix}(nil)`;
  }

  if (typeof reply === "number" || typeof reply === "bigint") {
    return `${prefix}(integer) ${reply}`;
  }

  if (typeof reply === "string") {
    return `${prefix}"${reply}"`;
  }

  if (Buffer.isBuffer(reply)) {
    return `${prefix}"${reply.toString()}"`;
  }

  if (Array.isArray(reply)) {
    if (reply.length === 0) {
      return `${prefix}(empty array)`;
    }
    return reply.map((item, i) => `${prefix}${i + 1}) ${formatRedisReply(item, indent + 3).trimStart()}`).join("\n");
  }

  return `${prefix}"${String(reply)}"`;
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

  const tokens = tokenizeInput(trimmed);
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
    enableReadyCheck: false,
    reconnectOnError: () => false,
    retryStrategy: () => null
  });

  // Wait for connection to be ready
  await new Promise<void>((resolve, reject) => {
    redisClient.once("ready", resolve);
    redisClient.once("error", reject);
  });

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
