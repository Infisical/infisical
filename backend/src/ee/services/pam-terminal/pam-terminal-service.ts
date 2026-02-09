import { ForbiddenError, subject } from "@casl/ability";
import type WebSocket from "ws";

import { ActionProjectType } from "@app/db/schemas";
import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { PamResource } from "@app/ee/services/pam-resource/pam-resource-enums";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamAccountActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";

import { TPamAccountDALFactory } from "../pam-account/pam-account-dal";
import { TPamFolderDALFactory } from "../pam-folder/pam-folder-dal";
import { getFullPamFolderPath } from "../pam-folder/pam-folder-fns";
import { TPamResourceDALFactory } from "../pam-resource/pam-resource-dal";
import {
  PAM_TERMINAL_PROMPT,
  TIssueWebSocketTicketDTO,
  TWebSocketClientMessage,
  TWebSocketServerMessage,
  WebSocketClientMessageSchema,
  WsMessageType
} from "./pam-terminal-types";

type TPamTerminalServiceFactoryDep = {
  pamAccountDAL: Pick<TPamAccountDALFactory, "findById">;
  pamResourceDAL: Pick<TPamResourceDALFactory, "findById">;
  pamFolderDAL: TPamFolderDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
};

export type TPamTerminalServiceFactory = ReturnType<typeof pamTerminalServiceFactory>;

type THandleWebSocketConnectionDTO = {
  socket: WebSocket;
  accountId: string;
  projectId: string;
};

export const pamTerminalServiceFactory = ({
  pamAccountDAL,
  pamResourceDAL,
  pamFolderDAL,
  permissionService,
  auditLogService,
  tokenService
}: TPamTerminalServiceFactoryDep) => {
  const sendMessage = (socket: WebSocket, message: TWebSocketServerMessage): void => {
    try {
      if (socket.readyState === socket.OPEN) {
        socket.send(JSON.stringify(message));
      }
    } catch (err) {
      logger.error(err, "Failed to send WebSocket message");
    }
  };

  const issueWebSocketTicket = async ({
    accountId,
    projectId,
    orgId,
    actor,
    auditLogInfo
  }: TIssueWebSocketTicketDTO) => {
    const account = await pamAccountDAL.findById(accountId);

    if (!account) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    if (account.projectId !== projectId) {
      throw new NotFoundError({ message: `Account with ID '${accountId}' not found` });
    }

    const resource = await pamResourceDAL.findById(account.resourceId);

    if (!resource) {
      throw new NotFoundError({ message: `Resource with ID '${account.resourceId}' not found` });
    }

    if (resource.resourceType !== PamResource.Postgres) {
      throw new BadRequestError({
        message: "Web terminal is currently only supported for PostgreSQL accounts"
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor: actor.type,
      actorId: actor.id,
      actorAuthMethod: actor.authMethod,
      actorOrgId: actor.orgId,
      projectId: account.projectId,
      actionProjectType: ActionProjectType.PAM
    });

    const accountPath = await getFullPamFolderPath({
      pamFolderDAL,
      folderId: account.folderId,
      projectId: account.projectId
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionPamAccountActions.Access,
      subject(ProjectPermissionSub.PamAccounts, {
        resourceName: resource.name,
        accountName: account.name,
        accountPath
      })
    );

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_PAM_WS_TICKET,
      userId: actor.id,
      payload: JSON.stringify({ accountId, projectId, orgId })
    });

    await auditLogService.createAuditLog({
      ...auditLogInfo,
      orgId,
      projectId,
      event: {
        type: EventType.PAM_TERMINAL_SESSION_TICKET_CREATED,
        metadata: {
          accountId,
          accountPath,
          accountName: account.name
        }
      }
    });

    return { ticket: `${actor.id}:${token}` };
  };

  const handleWebSocketConnection = async ({
    socket,
    accountId,
    projectId
  }: THandleWebSocketConnectionDTO): Promise<void> => {
    try {
      const account = await pamAccountDAL.findById(accountId);

      if (!account || account.projectId !== projectId) {
        throw new BadRequestError({ message: "Invalid account or project" });
      }

      sendMessage(socket, {
        type: WsMessageType.Ready,
        data: "Connected (echo mode)...\n",
        prompt: PAM_TERMINAL_PROMPT
      });

      logger.info({ accountId }, "Terminal session established (echo mode)");

      socket.on("message", (rawData: Buffer | ArrayBuffer | Buffer[]) => {
        const handleMessage = async () => {
          try {
            let data: string;
            if (Buffer.isBuffer(rawData)) {
              data = rawData.toString();
            } else if (Array.isArray(rawData)) {
              data = Buffer.concat(rawData).toString();
            } else {
              data = Buffer.from(rawData).toString();
            }
            const parsed: unknown = JSON.parse(data);

            const result = WebSocketClientMessageSchema.safeParse(parsed);
            if (!result.success) {
              sendMessage(socket, {
                type: WsMessageType.Output,
                data: "Invalid message format\n",
                prompt: PAM_TERMINAL_PROMPT
              });
              return;
            }

            const message: TWebSocketClientMessage = result.data;

            // Programmatic disconnect sent by the frontend's disconnect button
            if (message.type === WsMessageType.Control) {
              if (message.data === "quit") {
                sendMessage(socket, {
                  type: WsMessageType.Output,
                  data: "Session ended\n",
                  prompt: ""
                });
                socket.close();
                return;
              }
            }

            // User-typed input
            if (message.type === WsMessageType.Input) {
              const input = message.data.trim();

              // Empty input — just re-prompt
              if (input.length === 0) {
                sendMessage(socket, {
                  type: WsMessageType.Output,
                  data: "",
                  prompt: PAM_TERMINAL_PROMPT
                });
                return;
              }

              if (input === "\\q" || input === "quit" || input === "exit") {
                sendMessage(socket, {
                  type: WsMessageType.Output,
                  data: "Goodbye!\n",
                  prompt: ""
                });
                socket.close();
                return;
              }

              // Echo mode: split on newlines, combine output, single prompt at end
              const echoLines = input
                .split("\n")
                .map((l) => l.trim())
                .filter((l) => l.length > 0)
                .map((l) => `[echo] ${l}\n`)
                .join("");

              sendMessage(socket, {
                type: WsMessageType.Output,
                data: echoLines,
                prompt: PAM_TERMINAL_PROMPT
              });
            }
          } catch (err) {
            logger.error(err, "Error processing WebSocket message");
            sendMessage(socket, {
              type: WsMessageType.Output,
              data: "Failed to process message\n",
              prompt: PAM_TERMINAL_PROMPT
            });
          }
        };

        void handleMessage();
      });

      socket.on("close", () => {
        logger.info({ accountId }, "WebSocket connection closed");
      });

      socket.on("error", (err: Error) => {
        logger.error(err, "WebSocket error");
      });
    } catch (err) {
      logger.error(err, "Failed to establish terminal session");

      // TODO: always provide generic message to users when database/gateway errors occur
      const errorMessage = err instanceof Error ? err.message : "Failed to establish terminal session";
      sendMessage(socket, {
        type: WsMessageType.Output,
        data: `${errorMessage}\n`,
        prompt: ""
      });
      socket.close();
    }
  };

  return {
    issueWebSocketTicket,
    handleWebSocketConnection
  };
};
