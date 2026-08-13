import { z } from "zod";

import { AgentGatewayUnmatchedHostPolicy } from "@app/ee/services/agent-gateway/agent-gateway-enums";
import {
  AgentGatewayListItemSchema,
  AgentGatewayWithServicesSchema,
  allowedHostSchema,
  SanitizedAgentGatewaySchema
} from "@app/ee/services/agent-gateway/agent-gateway-schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { AGENT_GATEWAYS, ApiDocsTags } from "@app/lib/api-docs";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

// Both transport fields accept an explicit null so an Agent Gateway can be returned to local-only. The
// service enforces mutual exclusion against the *effective* pair after the update, not just the body.
const transportBodyFields = {
  gatewayId: z.string().uuid().nullable().optional().describe(AGENT_GATEWAYS.UPDATE.gatewayId),
  gatewayPoolId: z.string().uuid().nullable().optional().describe(AGENT_GATEWAYS.UPDATE.gatewayPoolId)
};

export const registerAgentGatewayRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Create an Agent Gateway",
      operationId: "createAgentGateway",
      body: z.object({
        projectId: z.string().trim().min(1).max(36).describe(AGENT_GATEWAYS.CREATE.projectId),
        name: slugSchema({ max: 64, field: "name" }).describe(AGENT_GATEWAYS.CREATE.name),
        description: z.string().trim().max(500).optional().describe(AGENT_GATEWAYS.CREATE.description),
        gatewayId: z.string().uuid().nullable().optional().describe(AGENT_GATEWAYS.CREATE.gatewayId),
        gatewayPoolId: z.string().uuid().nullable().optional().describe(AGENT_GATEWAYS.CREATE.gatewayPoolId),
        isLocalModeEnabled: z.boolean().optional().describe(AGENT_GATEWAYS.CREATE.isLocalModeEnabled),
        unmatchedHostPolicy: z
          .nativeEnum(AgentGatewayUnmatchedHostPolicy)
          .optional()
          .describe(AGENT_GATEWAYS.CREATE.unmatchedHostPolicy),
        allowedHosts: allowedHostSchema.array().max(50).optional().describe(AGENT_GATEWAYS.CREATE.allowedHosts)
      }),
      response: {
        200: z.object({ agentGateway: AgentGatewayWithServicesSchema })
      }
    },
    handler: async (req) => {
      const agentGateway = await server.services.agentGateway.create(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.CREATE_AGENT_GATEWAY,
          metadata: {
            agentGatewayId: agentGateway.id,
            name: agentGateway.name,
            gatewayId: agentGateway.gateway?.id,
            gatewayPoolId: agentGateway.gatewayPool?.id
          }
        }
      });

      return { agentGateway };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "List the Agent Gateways in a project",
      operationId: "listAgentGateways",
      querystring: z.object({
        projectId: z.string().trim().min(1).max(36).describe(AGENT_GATEWAYS.LIST.projectId),
        search: z.string().trim().max(255).optional().describe(AGENT_GATEWAYS.LIST.search),
        orderDirection: z.nativeEnum(OrderByDirection).optional().describe(AGENT_GATEWAYS.LIST.orderDirection),
        limit: z.coerce.number().int().min(1).max(100).default(100).describe(AGENT_GATEWAYS.LIST.limit),
        offset: z.coerce.number().int().min(0).default(0).describe(AGENT_GATEWAYS.LIST.offset)
      }),
      response: {
        200: z.object({
          agentGateways: AgentGatewayListItemSchema.array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => server.services.agentGateway.list(req.query, req.permission)
  });

  // The CLI's `--name` resolves through here. Names are unique per project, so a projectId is required;
  // making them org-unique would introduce a new namespace that will collide.
  server.route({
    method: "GET",
    url: "/by-name/:name",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Get an Agent Gateway by name",
      operationId: "getAgentGatewayByName",
      params: z.object({
        name: slugSchema({ max: 64, field: "name" }).describe(AGENT_GATEWAYS.GET.name)
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1).max(36).describe(AGENT_GATEWAYS.GET.projectId)
      }),
      response: {
        200: z.object({ agentGateway: AgentGatewayWithServicesSchema })
      }
    },
    handler: async (req) => {
      const agentGateway = await server.services.agentGateway.getByName(
        { projectId: req.query.projectId, name: req.params.name },
        req.permission
      );
      return { agentGateway };
    }
  });

  server.route({
    method: "GET",
    url: "/:agentGatewayId",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Get an Agent Gateway by ID",
      operationId: "getAgentGatewayById",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.GET.agentGatewayId)
      }),
      response: {
        200: z.object({ agentGateway: AgentGatewayWithServicesSchema })
      }
    },
    handler: async (req) => {
      const agentGateway = await server.services.agentGateway.getById(req.params, req.permission);
      return { agentGateway };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:agentGatewayId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Update an Agent Gateway",
      operationId: "updateAgentGateway",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.UPDATE.agentGatewayId)
      }),
      body: z.object({
        name: slugSchema({ max: 64, field: "name" }).optional().describe(AGENT_GATEWAYS.UPDATE.name),
        description: z.string().trim().max(500).nullable().optional().describe(AGENT_GATEWAYS.UPDATE.description),
        ...transportBodyFields,
        isLocalModeEnabled: z.boolean().optional().describe(AGENT_GATEWAYS.UPDATE.isLocalModeEnabled),
        unmatchedHostPolicy: z
          .nativeEnum(AgentGatewayUnmatchedHostPolicy)
          .optional()
          .describe(AGENT_GATEWAYS.UPDATE.unmatchedHostPolicy),
        allowedHosts: allowedHostSchema.array().max(50).optional().describe(AGENT_GATEWAYS.UPDATE.allowedHosts)
      }),
      response: {
        200: z.object({ agentGateway: AgentGatewayWithServicesSchema })
      }
    },
    handler: async (req) => {
      const agentGateway = await server.services.agentGateway.updateById(
        { agentGatewayId: req.params.agentGatewayId, ...req.body },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: agentGateway.projectId,
        event: {
          type: EventType.UPDATE_AGENT_GATEWAY,
          metadata: {
            agentGatewayId: agentGateway.id,
            name: agentGateway.name,
            updatedFields: Object.keys(req.body),
            gatewayId: agentGateway.gateway?.id,
            gatewayPoolId: agentGateway.gatewayPool?.id
          }
        }
      });

      return { agentGateway };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:agentGatewayId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Delete an Agent Gateway",
      operationId: "deleteAgentGateway",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.DELETE.agentGatewayId)
      }),
      response: {
        200: z.object({ agentGateway: SanitizedAgentGatewaySchema })
      }
    },
    handler: async (req) => {
      const agentGateway = await server.services.agentGateway.deleteById(req.params, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: agentGateway.projectId,
        event: {
          type: EventType.DELETE_AGENT_GATEWAY,
          metadata: {
            agentGatewayId: agentGateway.id,
            name: agentGateway.name
          }
        }
      });

      return { agentGateway };
    }
  });

  server.route({
    method: "POST",
    url: "/:agentGatewayId/services/:serviceId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Connect a proxied service to an Agent Gateway",
      operationId: "attachAgentGatewayProxiedService",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.SERVICES.agentGatewayId),
        serviceId: z.string().uuid().describe(AGENT_GATEWAYS.SERVICES.serviceId)
      }),
      response: {
        200: z.object({ agentGateway: AgentGatewayWithServicesSchema })
      }
    },
    handler: async (req) => {
      const { agentGateway, service } = await server.services.agentGateway.linkProxiedService(
        req.params,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: agentGateway.projectId,
        event: {
          type: EventType.ATTACH_AGENT_GATEWAY_SERVICE,
          metadata: {
            agentGatewayId: agentGateway.id,
            agentGatewayName: agentGateway.name,
            proxiedServiceId: service.id,
            proxiedServiceName: service.name
          }
        }
      });

      const updated = await server.services.agentGateway.getById(
        { agentGatewayId: req.params.agentGatewayId },
        req.permission
      );
      return { agentGateway: updated };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:agentGatewayId/services/:serviceId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Disconnect a proxied service from an Agent Gateway",
      operationId: "detachAgentGatewayProxiedService",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.SERVICES.agentGatewayId),
        serviceId: z.string().uuid().describe(AGENT_GATEWAYS.SERVICES.serviceId)
      }),
      response: {
        200: z.object({ agentGateway: AgentGatewayWithServicesSchema })
      }
    },
    handler: async (req) => {
      const { agentGateway, service } = await server.services.agentGateway.unlinkProxiedService(
        req.params,
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: agentGateway.projectId,
        event: {
          type: EventType.DETACH_AGENT_GATEWAY_SERVICE,
          metadata: {
            agentGatewayId: agentGateway.id,
            agentGatewayName: agentGateway.name,
            proxiedServiceId: req.params.serviceId,
            proxiedServiceName: service?.name
          }
        }
      });

      const updated = await server.services.agentGateway.getById(
        { agentGatewayId: req.params.agentGatewayId },
        req.permission
      );
      return { agentGateway: updated };
    }
  });

  // PUT because the whole order is replaced: sending a partial order would leave the tie-break between
  // the omitted services undefined, which is exactly the ambiguity priority exists to remove.
  server.route({
    method: "PUT",
    url: "/:agentGatewayId/services",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.AgentGateways],
      description: "Reorder the proxied services connected to an Agent Gateway",
      operationId: "reorderAgentGatewayProxiedServices",
      params: z.object({
        agentGatewayId: z.string().uuid().describe(AGENT_GATEWAYS.SERVICES.agentGatewayId)
      }),
      body: z.object({
        serviceIds: z.string().uuid().array().max(200).describe(AGENT_GATEWAYS.SERVICES.serviceIds)
      }),
      response: {
        200: z.object({ agentGateway: AgentGatewayWithServicesSchema })
      }
    },
    handler: async (req) => {
      const agentGateway = await server.services.agentGateway.reorderProxiedServices(
        { agentGatewayId: req.params.agentGatewayId, serviceIds: req.body.serviceIds },
        req.permission
      );

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: agentGateway.projectId,
        event: {
          type: EventType.UPDATE_AGENT_GATEWAY,
          metadata: {
            agentGatewayId: agentGateway.id,
            name: agentGateway.name,
            updatedFields: ["proxiedServiceOrder"]
          }
        }
      });

      return { agentGateway };
    }
  });
};
