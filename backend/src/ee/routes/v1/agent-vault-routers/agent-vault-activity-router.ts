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
        "Page back through a session's activity, newest first. Chunks come back sealed, with a presigned URL to fetch each one and the key to open them: the bytes are fetched and decrypted by the caller, never by Infisical. To follow the session live, pass `liveCursor` to the activity tail endpoint.",
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
        "Follow a session live: the activity that arrived since an earlier read, oldest first. Call it again with `nextCursor`, straight away while `hasMore` is true and on an interval once it is false. A read can return chunks you already hold, so drop repeats by `chunkId`.",
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
