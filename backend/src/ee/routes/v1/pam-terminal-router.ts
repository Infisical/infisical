import type WebSocket from "ws";
import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerPamTerminalRouter = async (server: FastifyZodProvider) => {
  // WebSocket endpoint for terminal access
  server.route({
    method: "GET",
    url: "/accounts/:accountId/terminal-access",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "WebSocket endpoint for browser-based terminal access to PAM accounts",
      params: z.object({
        accountId: z.string().uuid()
      }),
      querystring: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.object({ message: z.string() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    wsHandler: async (connection: WebSocket, req) => {
      await server.services.pamTerminal.handleWebSocketConnection({
        socket: connection,
        accountId: req.params.accountId,
        projectId: req.query.projectId,
        orgId: req.permission.orgId,
        actor: req.permission,
        auditLogInfo: req.auditLogInfo
      });
    },
    handler: async () => {
      // This handler is required but won't be called for WebSocket connections
      // The wsHandler will be used instead
      return { message: "WebSocket upgrade required" };
    }
  });
};
