import crypto from "crypto";

import { logger } from "@app/lib/logger";

import {
  DataExplorerClientMessageSchema,
  DataExplorerClientMessageType,
  DataExplorerServerMessageType,
  type TConnectionController,
  type TDataExplorerServerMessage
} from "./pam-data-explorer-ws-types";
import { parseClientMessage } from "./pam-web-access-fns";
import {
  SessionEndReason,
  TerminalServerMessageType,
  TSessionContext,
  TSessionHandlerResult
} from "./pam-web-access-types";

const MAX_CONNECTIONS_PER_WS = 20;

export type OneShotOptions = {
  relayPort: number;
  username: string;
  database?: string;
};

type ControllerParams = {
  relayPort: number;
  username: string;
  database?: string;
  sessionId: string;
  connectionId: string;
  sendResponse: (msg: TDataExplorerServerMessage) => void;
  onUnexpectedTermination: (reason: string) => void;
};

export type TDataExplorerDialectConfig = {
  dialectName: string;
  createController: (params: ControllerParams) => Promise<TConnectionController>;
  fetchSchemas: (opts: OneShotOptions) => Promise<{ name: string }[]>;
  fetchTables: (opts: OneShotOptions, schema: string) => Promise<{ name: string; tableType: string }[]>;
  verifyReachability: (opts: OneShotOptions) => Promise<void>;
  extractErrorFields: (err: unknown) => { message?: string; detail?: string; hint?: string };
};

export const createDataExplorerSessionHandler = (config: TDataExplorerDialectConfig) => {
  const { dialectName, createController, fetchSchemas, fetchTables, verifyReachability, extractErrorFields } = config;

  return async (
    ctx: TSessionContext,
    params: { connectionDetails: Record<string, unknown>; credentials: Record<string, unknown> }
  ): Promise<TSessionHandlerResult> => {
    const { socket, relayPort, resourceName, sessionId, sendMessage, sendSessionEnd, onCleanup } = ctx;
    const connectionDetails = params.connectionDetails as { host: string; port: number; database?: string };
    const credentials = params.credentials as { username: string; password: string };

    const oneShotOpts: OneShotOptions = {
      relayPort,
      username: credentials.username,
      database: connectionDetails.database
    };

    await verifyReachability(oneShotOpts);

    const dbLabel = connectionDetails.database ? ` (${connectionDetails.database})` : "";
    sendMessage({
      type: TerminalServerMessageType.Ready,
      data: `Connected to ${resourceName}${dbLabel} as ${credentials.username}\n\n`
    });

    logger.info(`${dialectName} web access session established [sessionId=${sessionId}]`);

    const sendResponse = (msg: TDataExplorerServerMessage) => {
      try {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify(msg));
        }
      } catch (err) {
        logger.error(err, `Failed to send WebSocket message [sessionId=${sessionId}]`);
      }
    };

    const controllers = new Map<string, TConnectionController | null>();
    let metadataPromise: Promise<void> = Promise.resolve();

    const openTabConnection = async (requestId: string) => {
      if (controllers.size >= MAX_CONNECTIONS_PER_WS) {
        sendResponse({
          type: DataExplorerServerMessageType.ConnectionOpenFailed,
          id: requestId,
          error: `Maximum ${MAX_CONNECTIONS_PER_WS} connections per session reached`
        });
        return;
      }

      const connectionId = crypto.randomUUID();
      controllers.set(connectionId, null);
      try {
        const controller = await createController({
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
              type: DataExplorerServerMessageType.ConnectionClosed,
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
          type: DataExplorerServerMessageType.ConnectionOpened,
          id: requestId,
          connectionId,
          backendPid: controller.backendPid
        });
      } catch (err) {
        controllers.delete(connectionId);
        const msg = err instanceof Error ? err.message : "Failed to open connection";
        logger.error(err, `Failed to open ${dialectName} tab connection [sessionId=${sessionId}]`);
        sendResponse({
          type: DataExplorerServerMessageType.ConnectionOpenFailed,
          id: requestId,
          error: msg
        });
      }
    };

    const queueMetadata = <T>(
      requestId: string,
      fetcher: () => Promise<T>,
      onSuccess: (rows: T) => TDataExplorerServerMessage,
      fallbackError: string
    ) => {
      metadataPromise = metadataPromise
        .then(async () => {
          try {
            const rows = await fetcher();
            sendResponse(onSuccess(rows));
          } catch (err) {
            const { message: errMsg, detail, hint } = extractErrorFields(err);
            sendResponse({
              type: DataExplorerServerMessageType.Error,
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
      const message = parseClientMessage(rawData, DataExplorerClientMessageSchema);
      if (!message) return;

      switch (message.type) {
        case DataExplorerClientMessageType.Control: {
          if (message.data === "quit") {
            sendSessionEnd(SessionEndReason.UserQuit);
            onCleanup();
            socket.close();
          }
          break;
        }

        case DataExplorerClientMessageType.OpenConnection: {
          void openTabConnection(message.id);
          break;
        }

        case DataExplorerClientMessageType.CloseConnection: {
          const controller = controllers.get(message.connectionId);
          if (!controller) return;
          controllers.delete(message.connectionId);
          controller.dispose();
          break;
        }

        case DataExplorerClientMessageType.Cancel: {
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

        case DataExplorerClientMessageType.GetSchemas: {
          queueMetadata(
            message.id,
            () => fetchSchemas(oneShotOpts),
            (rows) => ({ type: DataExplorerServerMessageType.Schemas, id: message.id, data: rows }),
            "Failed to fetch schemas"
          );
          break;
        }

        case DataExplorerClientMessageType.GetTables: {
          queueMetadata(
            message.id,
            () => fetchTables(oneShotOpts, message.schema),
            (rows) => ({ type: DataExplorerServerMessageType.Tables, id: message.id, data: rows }),
            "Failed to fetch tables"
          );
          break;
        }

        case DataExplorerClientMessageType.GetTableDetail:
        case DataExplorerClientMessageType.Query: {
          const controller = controllers.get(message.connectionId);
          if (!controller || controller.isDisposing()) {
            sendResponse({
              type: DataExplorerServerMessageType.Error,
              id: message.id,
              connectionId: message.connectionId,
              error: "Connection not found"
            });
            return;
          }
          controller.handleMessage(message);
          break;
        }

        case DataExplorerClientMessageType.Activity: {
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
              logger.debug(err, `Error disposing ${dialectName} controller [sessionId=${sessionId}]`);
            }
          }
        }
      }
    };
  };
};
