import { z } from "zod";

import { AgentGatewayPrincipalKind } from "@app/ee/services/agent-gateway/agent-gateway-enums";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_GATEWAYS, ApiDocsTags } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const AccessEntrySchema = z.object({
  id: z.string().uuid(),
  kind: z.nativeEnum(AgentGatewayPrincipalKind),
  principalId: z.string().uuid(),
  name: z.string(),
  email: z.string().nullable(),
  createdAt: z.date()
});

// One route family per principal kind, matching the shape used by every other resource access list in the
// codebase. The kind is in the path rather than the body because these are three different collections of
// principals, not one collection with a discriminator.
const PRINCIPAL_ROUTES = [
  { segment: "users", kind: AgentGatewayPrincipalKind.User, label: "user" },
  { segment: "identities", kind: AgentGatewayPrincipalKind.Identity, label: "machine identity" },
  { segment: "groups", kind: AgentGatewayPrincipalKind.Group, label: "group" }
] as const;

export const registerAgentGatewayAccessRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:agentGatewayId/access",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "List the principals allowed to use an Agent Gateway",
      operationId: "listAgentGatewayAccess",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.ACCESS.agentGatewayId)
      }),
      response: {
        200: z.object({ access: AccessEntrySchema.array() })
      }
    },
    handler: async (req) => {
      const access = await server.services.agentGatewayAccess.listAccess(req.params, req.permission);
      return { access };
    }
  });

  PRINCIPAL_ROUTES.forEach(({ segment, kind, label }) => {
    server.route({
      method: "POST",
      url: `/:agentGatewayId/access/${segment}/:principalId`,
      config: { rateLimit: writeLimit },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
      schema: {
        hide: false,
        tags: [ApiDocsTags.AgentGateways],
        description: `Allow a ${label} to use an Agent Gateway`,
        operationId: `grantAgentGateway${segment.charAt(0).toUpperCase()}${segment.slice(1)}Access`,
        params: z.object({
          agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.ACCESS.agentGatewayId),
          principalId: z.string().uuid().describe(AGENT_GATEWAYS.ACCESS.principalId)
        }),
        response: {
          200: z.object({ access: AccessEntrySchema.array() })
        }
      },
      handler: async (req) => {
        const { agentGateway } = await server.services.agentGatewayAccess.grantAccess(
          { agentGatewayId: req.params.agentGatewayId, kind, principalId: req.params.principalId },
          req.permission
        );

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: agentGateway.projectId,
          event: {
            type: EventType.GRANT_AGENT_GATEWAY_ACCESS,
            metadata: {
              agentGatewayId: agentGateway.id,
              agentGatewayName: agentGateway.name,
              principalKind: kind,
              principalId: req.params.principalId
            }
          }
        });

        const access = await server.services.agentGatewayAccess.listAccess(
          { agentGatewayId: req.params.agentGatewayId },
          req.permission
        );
        return { access };
      }
    });

    server.route({
      method: "DELETE",
      url: `/:agentGatewayId/access/${segment}/:principalId`,
      config: { rateLimit: writeLimit },
      onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
      schema: {
        hide: false,
        tags: [ApiDocsTags.AgentGateways],
        description: `Stop a ${label} from using an Agent Gateway`,
        operationId: `revokeAgentGateway${segment.charAt(0).toUpperCase()}${segment.slice(1)}Access`,
        params: z.object({
          agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.ACCESS.agentGatewayId),
          principalId: z.string().uuid().describe(AGENT_GATEWAYS.ACCESS.principalId)
        }),
        response: {
          200: z.object({ access: AccessEntrySchema.array() })
        }
      },
      handler: async (req) => {
        const { agentGateway } = await server.services.agentGatewayAccess.revokeAccess(
          { agentGatewayId: req.params.agentGatewayId, kind, principalId: req.params.principalId },
          req.permission
        );

        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          projectId: agentGateway.projectId,
          event: {
            type: EventType.REVOKE_AGENT_GATEWAY_ACCESS,
            metadata: {
              agentGatewayId: agentGateway.id,
              agentGatewayName: agentGateway.name,
              principalKind: kind,
              principalId: req.params.principalId
            }
          }
        });

        const access = await server.services.agentGatewayAccess.listAccess(
          { agentGatewayId: req.params.agentGatewayId },
          req.permission
        );
        return { access };
      }
    });
  });
};
