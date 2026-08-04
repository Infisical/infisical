import { Redis } from "ioredis";

import { logger } from "@app/lib/logger";

import { parseClientMessage, resolveEndReason } from "../pam-web-access-fns";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
} from "../pam-web-access-types";
import { escapeTerminalControlBytes, formatRedisReply, tokenizeRedisInput } from "./pam-redis-formatter";
import { RedisClientMessageSchema, RedisClientMessageType } from "./pam-redis-ws-types";

const COMMAND_TIMEOUT_MS = 30_000;

const CLEANUP_QUIT_TIMEOUT_MS = 2_000;

// these put the connection into a mode ioredis cannot follow
const BLOCKED_COMMANDS = new Set([
  "subscribe",
  "unsubscribe",
  "psubscribe",
  "punsubscribe",
  "ssubscribe",
  "sunsubscribe",
  "monitor",
  "hello",
  "reset",
  "select",
  "client"
]);

const MAX_REPLY_BYTES = 256 * 1024;

const CONNECT_TIMEOUT_MS = 15_000;

const callWithDeadline = async (redisClient: Redis, command: string, args: string[]): Promise<unknown> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      redisClient.call(command, ...args),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`command timed out after ${COMMAND_TIMEOUT_MS / 1000}s`)),
          COMMAND_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const executeCommand = async (redisClient: Redis, input: string): Promise<{ output: string; shouldClose: boolean }> => {
  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { output: "", shouldClose: false };
  }

  const lower = trimmed.toLowerCase();
  if (lower === "quit" || lower === "exit") {
    return { output: "", shouldClose: true };
  }

  const tokens = tokenizeRedisInput(trimmed);
  if (tokens.length === 0) {
    return { output: "", shouldClose: false };
  }

  const [command, ...args] = tokens;

  if (BLOCKED_COMMANDS.has(command.toLowerCase())) {
    return {
      output: `(error) ${command.toUpperCase()} is not supported in web access, use the Infisical CLI for this\n`,
      shouldClose: false
    };
  }

  try {
    const result = await callWithDeadline(redisClient, command, args);
    const formatted = formatRedisReply(result);
    if (formatted.length > MAX_REPLY_BYTES) {
      return {
        output: `${formatted.slice(0, MAX_REPLY_BYTES)}\n(reply truncated at ${MAX_REPLY_BYTES / 1024}KB)\n`,
        shouldClose: false
      };
    }
    return { output: `${formatted}\n`, shouldClose: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { output: `(error) ${escapeTerminalControlBytes(message)}\n`, shouldClose: false };
  }
};

export const handleRedisSession = async (
  ctx: TSessionContext,
  params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, isNearSessionExpiry, onCleanup } =
    ctx;
  const connectionDetails = params.connectionDetails as { host: string; port: number };
  const credentials = params.credentials as { username?: string };

  const redisClient = new Redis({
    host: "localhost",
    port: relayPort,
    maxRetriesPerRequest: 0,
    reconnectOnError: () => false,
    retryStrategy: () => null
  });

  try {
    let connectTimer: NodeJS.Timeout | undefined;
    try {
      await new Promise<void>((resolve, reject) => {
        connectTimer = setTimeout(
          () => reject(new Error(`Redis connection timed out after ${CONNECT_TIMEOUT_MS / 1000}s`)),
          CONNECT_TIMEOUT_MS
        );
        redisClient.once("ready", resolve);
        redisClient.once("error", reject);
        redisClient.once("close", () => reject(new Error("Redis connection closed before ready")));
      });
    } finally {
      if (connectTimer) clearTimeout(connectTimer);
    }
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
    type: TerminalServerMessageType.Ready,
    data: `Connected to ${resourceName} as ${credentials.username || "default"}\n\n`,
    prompt
  });

  logger.info({ sessionId }, "Redis web access session established");

  // Sequential message processing to prevent concurrent command issues
  let processingPromise = Promise.resolve();

  socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    processingPromise = processingPromise
      .then(async () => {
        const message = parseClientMessage(rawData, RedisClientMessageSchema);
        if (!message) {
          sendMessage({
            type: TerminalServerMessageType.Output,
            data: "Invalid message format\n",
            prompt
          });
          return;
        }

        if (message.type === RedisClientMessageType.Control) {
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

        if (message.type === RedisClientMessageType.Input) {
          const result = await executeCommand(redisClient, message.data);

          if (result.shouldClose) {
            sendSessionEnd(SessionEndReason.UserQuit);
            onCleanup();
            socket.close();
            return;
          }

          sendMessage({
            type: TerminalServerMessageType.Output,
            data: result.output,
            prompt
          });
        }
      })
      .catch((err) => {
        logger.error(err, "Error processing Redis message");
        sendMessage({
          type: TerminalServerMessageType.Output,
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
      let timer: NodeJS.Timeout | undefined;
      try {
        await Promise.race([
          redisClient.quit(),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, CLEANUP_QUIT_TIMEOUT_MS);
          })
        ]);
      } catch (err) {
        logger.debug(err, "Error closing Redis client");
      } finally {
        if (timer) clearTimeout(timer);
        redisClient.disconnect();
      }
    }
  };
};
