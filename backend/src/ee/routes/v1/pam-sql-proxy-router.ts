import type { FastifyRequest } from "fastify";
import type { WebSocket } from "ws";
import { z } from "zod";

import { ms } from "@app/lib/ms";

import {
  SqlProxyMessageType,
  TSqlProxyIncomingMessage
} from "@app/ee/services/pam-sql-proxy/pam-sql-proxy-types";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode, AuthModeJwtTokenPayload, AuthTokenType } from "@app/services/auth/auth-type";

export const registerPamSqlProxyRouter = async (server: FastifyZodProvider) => {
    // creates a sql session
  server.route({
    method: "POST",
    url: "/sessions",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Create a SQL console session (calls access API internally)",
      body: z.object({
        accountPath: z.string().describe("Path to the account, e.g., 'folder/account-name'"),
        projectId: z.string().uuid(),
        duration: z.string().describe("Session duration, e.g., '4h', '30m'")
      }),
      response: {
        200: z.object({
          sessionId: z.string().uuid(),
          resourceType: z.string(),
          metadata: z.object({
            username: z.string().optional(),
            database: z.string().optional(),
            accountName: z.string().optional(),
            accountPath: z.string().optional()
          }).optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({
          message: "Only JWT authentication is supported for SQL console"
        });
      }

      const { accountPath, projectId, duration } = req.body;
      
      const durationMs = ms(duration);
      if (!durationMs || durationMs <= 0) {
        throw new BadRequestError({ message: "Invalid duration format. Use formats like '4h', '30m', '1d'" });
      }

      const user = await server.services.user.getMe(req.permission.id);
      
      const result = await server.services.pamSqlProxy.createSqlSession({
        accountPath,
        projectId,
        duration: durationMs,
        actorEmail: user?.email || "",
        actorName: user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "",
        actorIp: req.ip,
        actorUserAgent: req.headers["user-agent"] || "Infisical SQL Console",
        actor: {
          id: req.permission.id,
          type: req.permission.type,
          orgId: req.permission.orgId,
          authMethod: req.permission.authMethod,
          rootOrgId: req.permission.rootOrgId,
          parentOrgId: req.permission.parentOrgId
        }
      });

      return result;
    }
  });

  // websocket endpoint for sql proxy connection with auto-connect
  server.get(
    "/:sessionId/ws",
    {
      config: {
        rateLimit: readLimit
      },
      schema: {
        description: "WebSocket endpoint for SQL proxy connection with auto-connect",
        params: z.object({
          sessionId: z.string().uuid()
        })
      },
      websocket: true
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (connection: any, req: FastifyRequest<{ Params: { sessionId: string } }>) => {
      const socket = connection.socket as WebSocket;
      const { sessionId } = req.params;

        // extract token from Sec-WebSocket-Protocol header
        // format: "bearer-<base64url-encoded-token>"
      const protocols = req.headers["sec-websocket-protocol"];
      let token: string | undefined;

      if (protocols) {
        const protocolList = protocols.split(",").map((p) => p.trim());
        const authProtocol = protocolList.find((p) => p.startsWith("bearer-"));
        if (authProtocol) {
          try {
            // decode url safe base64 token
            const base64Url = authProtocol.slice(7); // remove "bearer-" prefix
            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
            const padding = base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
            token = Buffer.from(base64 + padding, "base64").toString("utf-8");
          } catch {
          }
        }
      }

      if (!token) {
        socket.send(
          JSON.stringify({
            type: SqlProxyMessageType.Error,
            message: "Authentication required"
          })
        );
        socket.close();
        return;
      }

      let userId: string;
      try {
        const appCfg = getConfig();
        const decodedToken = crypto.jwt().verify(token, appCfg.AUTH_SECRET) as AuthModeJwtTokenPayload;

        if (decodedToken.authTokenType !== AuthTokenType.ACCESS_TOKEN) {
          throw new UnauthorizedError({ message: "Invalid token type" });
        }

        const tokenPayload = await server.services.authToken.fnValidateJwtIdentity(decodedToken);
        userId = tokenPayload.user.id;
      } catch (error) {
        logger.error({ error }, "WebSocket authentication failed");
        socket.send(
          JSON.stringify({
            type: SqlProxyMessageType.Error,
            message: "Authentication failed: Invalid or expired token"
          })
        );
        socket.close();
        return;
      }

      logger.info({ sessionId, userId }, "SQL proxy WebSocket connection opened, attempting auto-connect");

      let connectionClosed = false;
      try {
        const result = await server.services.pamSqlProxy.autoConnect(sessionId, userId);
        socket.send(
          JSON.stringify({
            type: SqlProxyMessageType.Connected,
            database: result.database,
            host: result.host,
            port: result.port,
            resourceName: result.resourceName,
            accountName: result.accountName
          })
        );
        logger.info(
          { sessionId, userId, host: result.host, database: result.database },
          "SQL proxy auto-connected successfully"
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Auto-connect failed";
        logger.error({ sessionId, userId, error: errorMessage }, "SQL proxy auto-connect failed");
        socket.send(
          JSON.stringify({
            type: SqlProxyMessageType.Error,
            message: errorMessage
          })
        );
        socket.close();
        return;
      }

      // handle queries
      socket.on("message", async (rawData: Buffer) => {
        try {
          const data = rawData.toString();
          const message: TSqlProxyIncomingMessage = JSON.parse(data);

          switch (message.type) {
            case SqlProxyMessageType.Query: {
              try {
                const result = await server.services.pamSqlProxy.executeQuery(
                  sessionId,
                  userId,
                  message.query
                );
                socket.send(
                  JSON.stringify({
                    type: SqlProxyMessageType.Result,
                    data: result
                  })
                );
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Query execution failed";
                socket.send(
                  JSON.stringify({
                    type: SqlProxyMessageType.Error,
                    message: errorMessage
                  })
                );
              }
              break;
            }

            case SqlProxyMessageType.Close: {
              if (connectionClosed) break;
              connectionClosed = true;
              try {
                await server.services.pamSqlProxy.closeConnection(sessionId, userId);
                socket.send(
                  JSON.stringify({
                    type: SqlProxyMessageType.Disconnected
                  })
                );
                socket.close();
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Disconnect failed";
                socket.send(
                  JSON.stringify({
                    type: SqlProxyMessageType.Error,
                    message: errorMessage
                  })
                );
              }
              break;
            }

            case SqlProxyMessageType.Status: {
              try {
                const status = server.services.pamSqlProxy.getConnectionStatus(sessionId, userId);
                socket.send(
                  JSON.stringify({
                    type: status.connected ? SqlProxyMessageType.Connected : SqlProxyMessageType.Disconnected,
                    ...status
                  })
                );
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Status check failed";
                socket.send(
                  JSON.stringify({
                    type: SqlProxyMessageType.Error,
                    message: errorMessage
                  })
                );
              }
              break;
            }

            default:
              socket.send(
                JSON.stringify({
                  type: SqlProxyMessageType.Error,
                  message: "Unknown message type"
                })
              );
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Invalid message format";
          socket.send(
            JSON.stringify({
              type: SqlProxyMessageType.Error,
              message: `Invalid message: ${errorMessage}`
            })
          );
        }
      });

      socket.on("close", async () => {
        logger.info({ sessionId, userId }, "SQL proxy WebSocket connection closed");
        if (connectionClosed) return;
        connectionClosed = true;
        try {
          await server.services.pamSqlProxy.closeConnection(sessionId, userId);
        } catch {
        }
      });

      socket.on("error", (error: Error) => {
        logger.error({ sessionId, userId, error: error.message }, "SQL proxy WebSocket error");
      });
    }
  );

  // gets session info for frontend
  server.route({
    method: "GET",
    url: "/:sessionId/info",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "Get SQL proxy session info",
      params: z.object({
        sessionId: z.string().uuid()
      }),
      response: {
        200: z.object({
          sessionId: z.string(),
          resourceName: z.string(),
          accountName: z.string(),
          resourceType: z.string(),
          expiresAt: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      if (req.auth.authMode !== AuthMode.JWT) {
        throw new BadRequestError({
          message: "Only JWT authentication is supported for SQL proxy"
        });
      }

      const { sessionId } = req.params;
      const userId = req.permission.id;

      const status = server.services.pamSqlProxy.getConnectionStatus(sessionId, userId);

      if (status.connected) {
        return {
          sessionId,
          resourceName: status.resourceName || "Unknown",
          accountName: status.accountName || "Unknown",
          resourceType: "postgres",
          expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        };
      }

      throw new BadRequestError({ message: "Session not yet connected" });
    }
  });
};
