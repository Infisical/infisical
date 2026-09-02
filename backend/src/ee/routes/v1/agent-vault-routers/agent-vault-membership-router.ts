import { FastifyRequest } from "fastify";
import { z } from "zod";

import { TAgentVaultActorContext } from "@app/ee/services/agent-vault/agent-vault-actor-types";
import { AGENT_VAULT } from "@app/lib/api-docs";
import { ApiDocsTags } from "@app/lib/api-docs/constants";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const actorContext = (req: FastifyRequest): TAgentVaultActorContext => ({
  actorId: req.permission.id,
  actor: req.permission.type,
  actorOrgId: req.permission.orgId,
  actorAuthMethod: req.permission.authMethod
});

export const registerAgentVaultMembershipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/identities",
    config: { rateLimit: readLimit },
    schema: {
      operationId: "listAgentVaultProductIdentityMembers",
      description: "List the machine identities that are members of Agent Vault",
      tags: [ApiDocsTags.AgentVaultMemberships],
      response: {
        200: z.object({
          identities: z
            .object({
              id: z.string().uuid().describe(AGENT_VAULT.MEMBER.identityId),
              name: z.string().describe(AGENT_VAULT.MEMBERSHIP.identityName)
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const identities = await server.services.agentVaultMembership.listProductIdentities({
        projectId: req.internalAgentVaultProjectId,
        ctx: actorContext(req)
      });
      return { identities };
    }
  });
};
