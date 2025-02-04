import { z } from "zod";

import { KmipClientsSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { KmipPermission } from "@app/ee/services/kmip/kmip-enum";
import { KmipClientOrderBy } from "@app/ee/services/kmip/kmip-types";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const KmipClientResponseSchema = KmipClientsSchema.pick({
  projectId: true,
  name: true,
  id: true,
  description: true,
  permissions: true
});

export const registerKmipRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/clients",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        projectId: z.string(),
        name: z.string().trim().min(1),
        description: z.string().optional(),
        permissions: z.nativeEnum(KmipPermission).array()
      }),
      response: {
        200: KmipClientResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipClient = await server.services.kmip.createKmipClient({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: kmipClient.projectId,
        event: {
          type: EventType.CREATE_KMIP_CLIENT,
          metadata: {
            id: kmipClient.id,
            name: kmipClient.name,
            permissions: (kmipClient.permissions ?? []) as KmipPermission[]
          }
        }
      });
    }
  });

  server.route({
    method: "PATCH",
    url: "/clients/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        name: z.string().trim().min(1),
        description: z.string().optional(),
        permissions: z.nativeEnum(KmipPermission).array()
      }),
      response: {
        200: KmipClientResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipClient = await server.services.kmip.updateKmipClient({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: kmipClient.projectId,
        event: {
          type: EventType.UPDATE_KMIP_CLIENT,
          metadata: {
            id: kmipClient.id,
            name: kmipClient.name,
            permissions: (kmipClient.permissions ?? []) as KmipPermission[]
          }
        }
      });
    }
  });

  server.route({
    method: "DELETE",
    url: "/clients/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: KmipClientResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipClient = await server.services.kmip.deleteKmipClient({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: kmipClient.projectId,
        event: {
          type: EventType.DELETE_KMIP_CLIENT,
          metadata: {
            id: kmipClient.id
          }
        }
      });
    }
  });

  server.route({
    method: "GET",
    url: "/clients/:id",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      response: {
        200: KmipClientResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const kmipClient = await server.services.kmip.getKmipClient({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.params
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        projectId: kmipClient.projectId,
        event: {
          type: EventType.GET_KMIP_CLIENT,
          metadata: {
            id: kmipClient.id
          }
        }
      });
    }
  });

  server.route({
    method: "GET",
    url: "/clients",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List KMIP clients",
      querystring: z.object({
        projectId: z.string(),
        offset: z.coerce.number().min(0).optional().default(0),
        limit: z.coerce.number().min(1).max(100).optional().default(100),
        orderBy: z.nativeEnum(KmipClientOrderBy).optional().default(KmipClientOrderBy.Name),
        orderDirection: z.nativeEnum(OrderByDirection).optional().default(OrderByDirection.ASC),
        search: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          kmipClients: KmipClientResponseSchema.array(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { kmipClients, totalCount } = await server.services.kmip.listKmipClientsByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_KMIP_CLIENTS,
          metadata: {
            ids: kmipClients.map((key) => key.id)
          }
        }
      });

      return { kmipClients, totalCount };
    }
  });
};
