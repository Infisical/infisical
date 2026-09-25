import { z } from "zod";

import {
  AgentVaultActivityHistoryQuerySchema,
  AgentVaultActivityHistoryResponseSchema,
  AgentVaultActivityTailQuerySchema,
  AgentVaultActivityTailResponseSchema
} from "@app/ee/services/agent-vault-activity/agent-vault-activity-schemas";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit } from "@app/server/config/rateLimiter";
import { addNoCacheHeaders } from "@app/server/lib/caching";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAgentVaultActivityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:sessionId/activity",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "getAgentVaultSessionActivity",
      description:
        "Lists a session's activity in chunks, newest first. A chunk is an encrypted batch of [records](/documentation/platform/agent-vault/session-logs#whats-recorded) that a proxy uploaded. To decrypt the chunks, follow [Reading session logs through the API](/documentation/platform/agent-vault/session-logs#reading-session-logs-through-the-api). To keep receiving new activity, pass `liveCursor` to [the endpoint that tails session activity](/api-reference/endpoints/agent-vault-activity/tail-session-activity).",
      tags: [ApiDocsTags.AgentVaultActivity],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      querystring: AgentVaultActivityHistoryQuerySchema,
      response: { 200: AgentVaultActivityHistoryResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultActivity.listSessionActivity({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        sessionId: req.params.sessionId,
        limit: req.query.limit,
        before: req.query.cursor,
        from: req.query.from,
        to: req.query.to
      });
    }
  });

  server.route({
    method: "GET",
    url: "/:sessionId/activity/tail",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "tailAgentVaultSessionActivity",
      description:
        "Lists a session's new activity since your last call, oldest first. The same chunk can appear in more than one response, so skip any `chunkId` you've already read. The chunks decrypt the same way as the ones from [the endpoint that lists session activity](/api-reference/endpoints/agent-vault-activity/get-session-activity).",
      tags: [ApiDocsTags.AgentVaultActivity],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      querystring: AgentVaultActivityTailQuerySchema,
      response: { 200: AgentVaultActivityTailResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req, reply) => {
      addNoCacheHeaders(reply);
      return server.services.agentVaultActivity.tailSessionActivity({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        sessionId: req.params.sessionId,
        limit: req.query.limit,
        receivedAfter: req.query.cursor
      });
    }
  });
};
