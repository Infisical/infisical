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
        "Lists a session's logs in chunks, newest first. A chunk is an encrypted batch of [records](/documentation/platform/agent-vault/session-logs#what-gets-recorded) that a proxy uploaded. To decrypt the chunks, follow [Reading session logs through the API](/documentation/platform/agent-vault/session-logs#reading-session-logs-through-the-api). To keep receiving new logs, call [the endpoint that tails session logs](/api-reference/endpoints/agent-vault-session-logs/tail).",
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
        "Lists the chunks proxies have started uploading since your last call, in the order they started. The first call also returns the most recent chunks, which can repeat ones you already have, so skip any chunk whose `chunkId` and `proxyId` you've already read. The chunks decrypt the same way as the ones from [the endpoint that lists session logs](/api-reference/endpoints/agent-vault-session-logs/list).",
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
