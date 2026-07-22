import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import {
  CredentialsArraySchema,
  hostPatternSchema,
  ProxiedServiceWithCanProxyAndLeaseAccessSchema,
  ProxiedServiceWithCredentialsSchema,
  SanitizedProxiedServiceBaseSchema
} from "@app/ee/services/proxied-service/proxied-service-schemas";
import { ApiDocsTags, PROXIED_SERVICES } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

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

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ProxiedServiceCreated,
          organizationId: req.permission.orgId,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            proxiedServiceId: service.id,
            name: service.name,
            projectId: req.body.projectId,
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            credentialCount: req.body.credentials.length,
            credentialRoles: [...new Set(req.body.credentials.map((c) => c.role))]
          }
        })
        .catch(() => {});

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.CREATE_PROXIED_SERVICE,
          metadata: {
            proxiedServiceId: service.id,
            name: service.name,
            hostPattern: service.hostPattern,
            secretKeys: [
              ...new Set(req.body.credentials.map((c) => c.secretKey).filter((k): k is string => Boolean(k)))
            ],
            dynamicSecretNames: [
              ...new Set(req.body.credentials.map((c) => c.dynamicSecretName).filter((n): n is string => Boolean(n)))
            ],
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
          projectSlug: z.string(),
          services: ProxiedServiceWithCanProxyAndLeaseAccessSchema.array()
        })
      }
    },
    handler: async (req) => {
      return server.services.proxiedService.list(req.query, req.permission);
    }
  });

  server.route({
    method: "GET",
    url: "/:serviceId",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProxiedServices],
      description: "Get a proxied service by ID",
      params: z.object({
        serviceId: z.string().uuid().describe(PROXIED_SERVICES.GET.serviceId)
      }),
      response: {
        200: z.object({
          service: ProxiedServiceWithCanProxyAndLeaseAccessSchema
        })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.getById({ serviceId: req.params.serviceId }, req.permission);
      return { service };
    }
  });

  server.route({
    method: "GET",
    url: "/slug/:name",
    config: { rateLimit: readLimit },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.ProxiedServices],
      description: "Get a proxied service by name",
      params: z.object({
        name: slugSchema({ field: "name" }).describe(PROXIED_SERVICES.GET.name)
      }),
      querystring: z.object({
        projectId: z.string().trim().min(1).describe(PROXIED_SERVICES.GET.projectId),
        environment: z.string().trim().min(1).describe(PROXIED_SERVICES.GET.environment),
        secretPath: z.string().trim().default("/").describe(PROXIED_SERVICES.GET.secretPath)
      }),
      response: {
        200: z.object({
          service: ProxiedServiceWithCanProxyAndLeaseAccessSchema
        })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.getByName(
        {
          projectId: req.query.projectId,
          environment: req.query.environment,
          secretPath: req.query.secretPath,
          name: req.params.name
        },
        req.permission
      );
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

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ProxiedServiceUpdated,
          organizationId: req.permission.orgId,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            proxiedServiceId: service.id,
            name: service.name,
            projectId: service.projectId,
            environment: service.environment,
            secretPath: service.secretPath,
            credentialCount: service.credentials.length,
            credentialRoles: [...new Set(service.credentials.map((c) => c.role))]
          }
        })
        .catch(() => {});

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
            secretKeys: [
              ...new Set(service.credentials.map((c) => c.secretKey).filter((k): k is string => Boolean(k)))
            ],
            dynamicSecretNames: [
              ...new Set(service.credentials.map((c) => c.dynamicSecretName).filter((n): n is string => Boolean(n)))
            ],
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

      await server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ProxiedServiceDeleted,
          organizationId: req.permission.orgId,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            proxiedServiceId: service.id,
            name: service.name,
            projectId: service.projectId,
            environment: service.environment,
            secretPath: service.secretPath
          }
        })
        .catch(() => {});

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
