import crypto from "crypto";

import {
  TPostgresAccountCredentials,
  TPostgresResourceConnectionDetails
} from "@app/ee/services/pam-resource/postgres/postgres-resource-types";
import { logger } from "@app/lib/logger";

import {
  createPostgresConnectionController,
  type TPostgresConnectionController
} from "./pam-postgres-connection-controller";
import { fetchSchemasOneShot, fetchTablesOneShot, verifyReachabilityOneShot } from "./pam-postgres-metadata";
import {
  PostgresClientMessageSchema,
  PostgresClientMessageType,
  PostgresServerMessageType,
  type TPostgresCorrelatedServerMessage
} from "./pam-postgres-ws-types";
import { parseClientMessage } from "./pam-web-access-fns";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
} from "./pam-web-access-types";

type TPostgresSessionParams = {
  connectionDetails: TPostgresResourceConnectionDetails;
  credentials: TPostgresAccountCredentials;
};

// Fan-out bound inside a single already-authenticated WS session.
const MAX_CONNECTIONS_PER_WS = 20;

// Unwrap a pg driver error into the shape our WS error responses expect.
const toPgErrorFields = (err: unknown) => {
  const pgErr = err as { message?: string; detail?: string; hint?: string };
  return { message: pgErr.message, detail: pgErr.detail, hint: pgErr.hint };
};

export const handlePostgresSession = async (
  ctx: TSessionContext,
  params: TPostgresSessionParams
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, onCleanup } = ctx;
  const { connectionDetails, credentials } = params;

  const oneShotOpts = {
    relayPort,
    username: credentials.username,
    database: connectionDetails.database
  };

  // Early reachability check — fail fast before sending ready, preserving the
  // early "Connection error" UX the FE relies on.
  try {
    await verifyReachabilityOneShot(oneShotOpts);
  } catch (err) {
    logger.error(err, `Postgres reachability check failed [sessionId=${sessionId}]`);
    sendSessionEnd(SessionEndReason.SetupFailed);
    onCleanup();
    try {
      socket.close();
    } catch {
      // ignore
    }
    return {
      cleanup: async () => {}
    };
  }

  sendMessage({
    type: TerminalServerMessageType.Ready,
    data: `Connected to ${resourceName} (${connectionDetails.database}) as ${credentials.username}\n\n`
  });

  logger.info(`Postgres web access session established [sessionId=${sessionId}]`);

  const sendResponse = (msg: TPostgresCorrelatedServerMessage) => {
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(msg));
      }
    } catch (err) {
      logger.error(err, `Failed to send WebSocket message [sessionId=${sessionId}]`);
    }
  };

  const controllers = new Map<string, TPostgresConnectionController>();
  // Reserved slots for in-flight opens — counted against the cap so a burst of
  // open-connection messages can't all pass the check before any of them
  // finishes inserting into `controllers`.
  let pendingOpens = 0;

  // Metadata requests (get-schemas / get-tables) are processed outside any
  // controller queue so sidebar refreshes don't block tab work.
  let metadataPromise: Promise<void> = Promise.resolve();

  // --- Per-message handlers ---

  const openTabConnection = async (requestId: string) => {
    if (controllers.size + pendingOpens >= MAX_CONNECTIONS_PER_WS) {
      sendResponse({
        type: PostgresServerMessageType.ConnectionOpenFailed,
        id: requestId,
        error: `Maximum ${MAX_CONNECTIONS_PER_WS} connections per session reached`
      });
      return;
    }

    pendingOpens += 1;
    const connectionId = crypto.randomUUID();
    try {
      const controller = await createPostgresConnectionController({
        relayPort,
        username: credentials.username,
        database: connectionDetails.database,
        sessionId,
        connectionId,
        sendResponse,
        onUnexpectedTermination: (reason) => {
          if (!controllers.has(connectionId)) return;
          controllers.delete(connectionId);
          sendResponse({
            type: PostgresServerMessageType.ConnectionClosed,
            connectionId,
            reason
          });
        }
      });
      controllers.set(connectionId, controller);
      sendResponse({
        type: PostgresServerMessageType.ConnectionOpened,
        id: requestId,
        connectionId,
        backendPid: controller.backendPid
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to open connection";
      logger.error(err, `Failed to open tab connection [sessionId=${sessionId}]`);
      sendResponse({
        type: PostgresServerMessageType.ConnectionOpenFailed,
        id: requestId,
        error: msg
      });
    } finally {
      pendingOpens -= 1;
    }
  };

  // Queue a metadata fetch (schemas / tables) behind any in-flight metadata
  // call so one-shot pg.Clients don't pile up. Errors are normalised into
  // PostgresServerMessageType.Error responses tied to the request id.
  const queueMetadata = <T>(
    requestId: string,
    fetcher: () => Promise<T>,
    onSuccess: (rows: T) => TPostgresCorrelatedServerMessage,
    fallbackError: string
  ) => {
    metadataPromise = metadataPromise
      .then(async () => {
        try {
          const rows = await fetcher();
          sendResponse(onSuccess(rows));
        } catch (err) {
          const { message: errMsg, detail, hint } = toPgErrorFields(err);
          sendResponse({
            type: PostgresServerMessageType.Error,
            id: requestId,
            error: errMsg ?? fallbackError,
            detail,
            hint
          });
        }
      })
      .catch(() => {});
  };

  socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
    const message = parseClientMessage(rawData, PostgresClientMessageSchema);
    if (!message) return;

    switch (message.type) {
      case PostgresClientMessageType.Control: {
        if (message.data === "quit") {
          sendSessionEnd(SessionEndReason.UserQuit);
          onCleanup();
          socket.close();
        }
        break;
      }

      case PostgresClientMessageType.OpenConnection: {
        void openTabConnection(message.id);
        break;
      }

      case PostgresClientMessageType.CloseConnection: {
        const controller = controllers.get(message.connectionId);
        if (!controller) return;
        controllers.delete(message.connectionId);
        controller.dispose();
        break;
      }

      case PostgresClientMessageType.Cancel: {
        const controller = controllers.get(message.connectionId);
        if (!controller || controller.isDisposing()) {
          logger.debug(
            `Cancel on missing/disposing connection [sessionId=${sessionId}] [connectionId=${message.connectionId}]`
          );
          return;
        }
        controller.handleMessage(message);
        break;
      }

      case PostgresClientMessageType.GetSchemas: {
        queueMetadata(
          message.id,
          () => fetchSchemasOneShot(oneShotOpts),
          (rows) => ({ type: PostgresServerMessageType.Schemas, id: message.id, data: rows }),
          "Failed to fetch schemas"
        );
        break;
      }

      case PostgresClientMessageType.GetTables: {
        queueMetadata(
          message.id,
          () => fetchTablesOneShot(oneShotOpts, message.schema),
          (rows) => ({ type: PostgresServerMessageType.Tables, id: message.id, data: rows }),
          "Failed to fetch tables"
        );
        break;
      }

      case PostgresClientMessageType.GetTableDetail:
      case PostgresClientMessageType.Query: {
        const controller = controllers.get(message.connectionId);
        if (!controller || controller.isDisposing()) {
          sendResponse({
            type: PostgresServerMessageType.Error,
            id: message.id,
            connectionId: message.connectionId,
            error: "Connection not found"
          });
          return;
        }
        controller.handleMessage(message);
        break;
      }

      case PostgresClientMessageType.Activity: {
        // No-op. The idle timer is reset by the sibling socket.on("message")
        // listener in pam-web-access-service.ts — this branch just keeps the
        // discriminated-union exhaustive so the `default` arm stays unreachable.
        break;
      }

      default:
        break;
    }
  });

  return {
    cleanup: async () => {
      // dispose() is synchronous and fire-and-forget — no await needed.
      const snapshot = Array.from(controllers.values());
      controllers.clear();
      for (const controller of snapshot) {
        try {
          controller.dispose();
        } catch (err) {
          logger.debug(err, `Error disposing controller [sessionId=${sessionId}]`);
        }
      }
    }
  };
};
