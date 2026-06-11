import crypto from "crypto";

import { PamAccountType } from "@app/ee/services/pam/pam-enums";
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
import { registerSessionHandler } from "./pam-session-handler-registry";
import { parseClientMessage } from "./pam-web-access-fns";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
} from "./pam-web-access-types";

const MAX_CONNECTIONS_PER_WS = 20;

const toPgErrorFields = (err: unknown) => {
  const pgErr = err as { message?: string; detail?: string; hint?: string };
  return { message: pgErr.message, detail: pgErr.detail, hint: pgErr.hint };
};

const handlePostgresSession = async (
  ctx: TSessionContext,
  params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, onCleanup } = ctx;
  const connectionDetails = params.connectionDetails as { host: string; port: number; database: string };
  const credentials = params.credentials as { username: string; password: string };

  const oneShotOpts = {
    relayPort,
    username: credentials.username,
    database: connectionDetails.database
  };

  await verifyReachabilityOneShot(oneShotOpts);

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

  const controllers = new Map<string, TPostgresConnectionController | null>();
  let metadataPromise: Promise<void> = Promise.resolve();

  const openTabConnection = async (requestId: string) => {
    if (controllers.size >= MAX_CONNECTIONS_PER_WS) {
      sendResponse({
        type: PostgresServerMessageType.ConnectionOpenFailed,
        id: requestId,
        error: `Maximum ${MAX_CONNECTIONS_PER_WS} connections per session reached`
      });
      return;
    }

    const connectionId = crypto.randomUUID();
    controllers.set(connectionId, null);
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
      if (!controllers.has(connectionId)) {
        controller.dispose();
        return;
      }
      controllers.set(connectionId, controller);
      sendResponse({
        type: PostgresServerMessageType.ConnectionOpened,
        id: requestId,
        connectionId,
        backendPid: controller.backendPid
      });
    } catch (err) {
      controllers.delete(connectionId);
      const msg = err instanceof Error ? err.message : "Failed to open connection";
      logger.error(err, `Failed to open tab connection [sessionId=${sessionId}]`);
      sendResponse({
        type: PostgresServerMessageType.ConnectionOpenFailed,
        id: requestId,
        error: msg
      });
    }
  };

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
        break;
      }

      default:
        break;
    }
  });

  return {
    cleanup: async () => {
      const snapshot = Array.from(controllers.values());
      controllers.clear();
      for (const controller of snapshot) {
        if (controller) {
          try {
            controller.dispose();
          } catch (err) {
            logger.debug(err, `Error disposing controller [sessionId=${sessionId}]`);
          }
        }
      }
    }
  };
};

registerSessionHandler(PamAccountType.Postgres, {
  gatewayResourceType: PamAccountType.Postgres,
  handler: handlePostgresSession
});
