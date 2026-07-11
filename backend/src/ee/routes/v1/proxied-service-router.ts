import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  CredentialsArraySchema,
  hostPatternSchema,
  ProxiedServiceWithCredentialsSchema,
  SanitizedProxiedServiceBaseSchema
} from "@app/ee/services/proxied-service/proxied-service-schemas";
import { ApiDocsTags, PROXIED_SERVICES } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { isUuidV4 } from "@app/lib/validator";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerProxiedServiceRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProxiedServices],
      description: "Create a proxied service",
      body: z.object({
        projectId: z.string().trim().min(1).describe(PROXIED_SERVICES.CREATE.projectId),
        environment: z.string().trim().min(1).describe(PROXIED_SERVICES.CREATE.environment),
        secretPath: z.string().trim().default("/").describe(PROXIED_SERVICES.CREATE.secretPath),
        name: slugSchema({ field: "name" }).describe(PROXIED_SERVICES.CREATE.name),
        hostPattern: hostPatternSchema.describe(PROXIED_SERVICES.CREATE.hostPattern),
        isEnabled: z.boolean().optional().describe(PROXIED_SERVICES.CREATE.isEnabled),
        credentials: CredentialsArraySchema.describe(PROXIED_SERVICES.CREATE.credentials)
      }),
      response: {
        200: z.object({ service: ProxiedServiceWithCredentialsSchema })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.create(req.body, req.permission);
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.CREATE_PROXIED_SERVICE,
          metadata: {
            proxiedServiceId: service.id,
            name: service.name,
            hostPattern: service.hostPattern,
            secretKeys: [...new Set(req.body.credentials.map((c) => c.secretKey))],
            environment: req.body.environment,
            secretPath: req.body.secretPath
          }
        }
      });
      return { service };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProxiedServices],
      description:
        "List proxied services in a folder. Returns the services the caller can read or proxy through; the canProxy field indicates whether the caller can route traffic through each service.",
      querystring: z.object({
        projectId: z.string().trim().min(1).describe(PROXIED_SERVICES.LIST.projectId),
        environment: z.string().trim().min(1).describe(PROXIED_SERVICES.LIST.environment),
        secretPath: z.string().trim().default("/").describe(PROXIED_SERVICES.LIST.secretPath)
      }),
      response: {
        200: z.object({
          services: ProxiedServiceWithCredentialsSchema.extend({ canProxy: z.boolean() }).array()
        })
      }
    },
    handler: async (req) => {
      return server.services.proxiedService.list(req.query, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: "/:serviceIdOrName",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProxiedServices],
      description:
        "Get a proxied service by ID, or by name when the projectId and environment query params are provided",
      params: z.object({
        serviceIdOrName: z.string().trim().min(1).describe(PROXIED_SERVICES.GET.serviceIdOrName)
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1).describe(PROXIED_SERVICES.GET.projectId).optional(),
        environment: z.string().trim().min(1).describe(PROXIED_SERVICES.GET.environment).optional(),
        secretPath: z.string().trim().describe(PROXIED_SERVICES.GET.secretPath).optional()
      }),
      response: {
        200: z.object({
          service: ProxiedServiceWithCredentialsSchema.extend({ canProxy: z.boolean() })
        })
      }
    },
    handler: async (req) => {
      const { serviceIdOrName } = req.params;
      const { projectId, environment, secretPath } = req.query;
      if (projectId && environment) {
        const service = await server.services.proxiedService.getByName(
          { projectId, environment, secretPath: secretPath ?? "/", name: serviceIdOrName },
          req.permission
        );
        return { service };
      }
      if (!isUuidV4(serviceIdOrName)) {
        throw new BadRequestError({
          message: "projectId and environment query params are required when fetching a proxied service by name"
        });
      }
      const service = await server.services.proxiedService.getById({ serviceId: serviceIdOrName }, req.permission);
      return { service };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:serviceId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProxiedServices],
      description: "Update a proxied service",
      params: z.object({ serviceId: z.string().uuid().describe(PROXIED_SERVICES.UPDATE.serviceId) }),
      body: z.object({
        name: slugSchema({ field: "name" }).optional().describe(PROXIED_SERVICES.UPDATE.name),
        hostPattern: hostPatternSchema.optional().describe(PROXIED_SERVICES.UPDATE.hostPattern),
        isEnabled: z.boolean().optional().describe(PROXIED_SERVICES.UPDATE.isEnabled),
        credentials: CredentialsArraySchema.optional().describe(PROXIED_SERVICES.UPDATE.credentials)
      }),
      response: {
        200: z.object({ service: ProxiedServiceWithCredentialsSchema })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.updateById(
        { serviceId: req.params.serviceId, ...req.body },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: service.projectId,
        event: {
          type: EventType.UPDATE_PROXIED_SERVICE,
          metadata: {
            proxiedServiceId: service.id,
            name: service.name,
            hostPattern: service.hostPattern,
            updatedFields: Object.keys(req.body),
            secretKeys: [...new Set(service.credentials.map((c) => c.secretKey))],
            environment: service.environment,
            secretPath: service.secretPath
          }
        }
      });
      return { service };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:serviceId",
    config: { rateLimit: writeLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProxiedServices],
      description: "Delete a proxied service",
      params: z.object({ serviceId: z.string().uuid().describe(PROXIED_SERVICES.DELETE.serviceId) }),
      response: {
        200: z.object({ service: SanitizedProxiedServiceBaseSchema })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.deleteById(
        { serviceId: req.params.serviceId },
        req.permission
      );
      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: service.projectId,
        event: {
          type: EventType.DELETE_PROXIED_SERVICE,
          metadata: {
            proxiedServiceId: service.id,
            name: service.name,
            environment: service.environment,
            secretPath: service.secretPath
          }
        }
      });
      return { service };
    }
  });
};
