import { z } from "zod";

import {
  AgentVaultActivityQuerySchema,
  AgentVaultActivityResponseSchema
} from "@app/ee/services/agent-vault-activity/agent-vault-activity-schemas";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerAgentVaultActivityRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:sessionId/activity",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "getAgentVaultSessionActivity",
      description:
        "Read a session's activity: a page going back through it, newest first, or with `receivedAfter`, what arrived since an earlier read, to follow the session live. Chunks come back sealed, with a presigned URL to fetch each one and the key to open them: the bytes are fetched and decrypted by the caller, never by Infisical.",
      tags: [ApiDocsTags.AgentVaultActivity],
      params: z.object({ sessionId: z.string().uuid().describe(AGENT_VAULT.SESSION.sessionId) }),
      querystring: AgentVaultActivityQuerySchema,
      response: { 200: AgentVaultActivityResponseSchema }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) =>
      server.services.agentVaultActivity.getSessionActivity({
        projectId: req.internalAgentVaultProjectId,
        ctx: {
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod
        },
        sessionId: req.params.sessionId,
        limit: req.query.limit,
        before: req.query.before,
        from: req.query.from,
        to: req.query.to,
        receivedAfter: req.query.receivedAfter
      })
  });
};
