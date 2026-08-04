import { logger } from "@app/lib/logger";

import { parseClientMessage, resolveEndReason } from "../pam-web-access-fns";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
} from "../pam-web-access-types";
import { escapeTerminalControlBytes, formatRedisReply, tokenizeRedisInput } from "./pam-redis-formatter";
import { connectRespClient, TRespClient } from "./pam-redis-resp";
import { RedisClientMessageSchema, RedisClientMessageType } from "./pam-redis-ws-types";

const COMMAND_TIMEOUT_MS = 30_000;

const CONNECT_TIMEOUT_MS = 15_000;

const MAX_REPLY_BYTES = 256 * 1024;

// these turn the connection into something other than one reply per command
const BLOCKED_COMMANDS = new Set([
  "subscribe",
  "unsubscribe",
  "psubscribe",
  "punsubscribe",
  "ssubscribe",
  "sunsubscribe",
  "monitor",
  "hello",
  "client"
]);

const executeCommand = async (
  client: TRespClient,
  input: string
): Promise<{ output: string; shouldClose: boolean }> => {
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
    const { reply, truncated } = await client.command(command, args, {
      deadlineMs: COMMAND_TIMEOUT_MS,
      budgetBytes: MAX_REPLY_BYTES
    });
    const formatted = formatRedisReply(reply);
    const notice = truncated ? `\n(reply truncated at ${MAX_REPLY_BYTES / 1024}KB)` : "";
    return { output: `${formatted}${notice}\n`, shouldClose: false };
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

  const client = await connectRespClient({ port: relayPort, connectTimeoutMs: CONNECT_TIMEOUT_MS });

  const prompt = `${connectionDetails.host}:${connectionDetails.port}> `;

  sendMessage({
    type: TerminalServerMessageType.Ready,
    data: `Connected to ${resourceName} as ${credentials.username || "default"}\n\n`,
    prompt
  });

  logger.info({ sessionId }, `Redis web access session established [sessionId=${sessionId}]`);

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
          }
          return;
        }

        if (message.type === RedisClientMessageType.Input) {
          const result = await executeCommand(client, message.data);

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
        logger.error(err, `Error processing Redis message [sessionId=${sessionId}]`);
        sendMessage({
          type: TerminalServerMessageType.Output,
          data: "Internal error\n",
          prompt
        });
      });
  });

  // Tunnel drop detection
  client.onClose((err) => {
    logger.info({ sessionId }, `Redis connection closed [sessionId=${sessionId}] [reason=${err.message}]`);
    sendSessionEnd(resolveEndReason(isNearSessionExpiry));
    onCleanup();
    socket.close();
  });

  return {
    cleanup: async () => {
      client.close();
    }
  };
};
