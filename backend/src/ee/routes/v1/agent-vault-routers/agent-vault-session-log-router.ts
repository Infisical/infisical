import { z } from "zod";

import {
  AgentVaultSessionLogHistoryQuerySchema,
  AgentVaultSessionLogHistoryResponseSchema,
  AgentVaultSessionLogTailQuerySchema,
  AgentVaultSessionLogTailResponseSchema
} from "@app/ee/services/agent-vault-session-log/agent-vault-session-log-schemas";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit } from "@app/server/config/rateLimiter";
import { addNoCacheHeaders } from "@app/server/lib/caching";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

import { actorContext } from "./agent-vault-router-fns";

export const registerAgentVaultSessionLogRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:sessionId/logs",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listAgentVaultSessionLogs",
      description:
        "Lists a session's logs newest first, as encrypted chunks of [records](/documentation/platform/agent-vault/session-logs#what-gets-recorded). To decrypt them, follow [Reading session logs through the API](/documentation/platform/agent-vault/session-logs#reading-session-logs-through-the-api). To follow new logs as they arrive, use [the endpoint that tails session logs](/api-reference/endpoints/agent-vault-session-logs/tail). If Infisical can't read the bucket, the request fails with the error `AgentVaultSessionLogStorageUnavailable`.",
      tags: [ApiDocsTags.AgentVaultSessionLogs],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      querystring: AgentVaultSessionLogHistoryQuerySchema,
      response: { 200: AgentVaultSessionLogHistoryResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultSessionLog.listSessionLogs({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        sessionId: req.params.sessionId,
        cursor: req.query.cursor,
        from: req.query.from,
        to: req.query.to
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId/logs/tail",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "tailAgentVaultSessionLogs",
      description:
        "Lists chunks added since your last call. Call it every few seconds with the previous `nextCursor`. Any call can return a chunk you already have, so skip any whose `chunkId` and `proxyId` you've read. The chunks decrypt the same way as the ones from [the endpoint that lists session logs](/api-reference/endpoints/agent-vault-session-logs/list). If Infisical can't read the bucket, the request fails with the error `AgentVaultSessionLogStorageUnavailable`.",
      tags: [ApiDocsTags.AgentVaultSessionLogs],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      querystring: AgentVaultSessionLogTailQuerySchema,
      response: { 200: AgentVaultSessionLogTailResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultSessionLog.tailSessionLogs({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req),
        sessionId: req.params.sessionId,
        cursor: req.query.cursor
      });
    }
  });
};
