import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ProxiedServiceCredentialRole } from "@app/ee/services/proxied-service/proxied-service-enums";
import {
  CredentialsArraySchema,
  hostPatternSchema,
  ProxiedServiceWithCredentialsSchema
} from "@app/ee/services/proxied-service/proxied-service-schemas";
import { ApiDocsTags, PROXIED_SERVICES } from "@app/lib/api-docs";
import { OrderByDirection } from "@app/lib/types";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

// Takes the minimal shape rather than a DTO, so it serves both the request body and a persisted row.
const toSecretRefs = (
  credentials: {
    environment: string;
    secretPath: string;
    secretKey?: string | null;
    dynamicSecretName?: string | null;
  }[]
) =>
  credentials.map((credential) => ({
    environment: credential.environment,
    secretPath: credential.secretPath,
    ...(credential.secretKey ? { secretKey: credential.secretKey } : {}),
    ...(credential.dynamicSecretName ? { dynamicSecretName: credential.dynamicSecretName } : {})
  }));

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
      operationId: "createProxiedService",
      body: z.object({
        projectId: z.string().trim().min(1).max(36).describe(PROXIED_SERVICES.CREATE.projectId),
        name: slugSchema({ max: 64, field: "name" }).describe(PROXIED_SERVICES.CREATE.name),
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
            secretRefs: toSecretRefs(req.body.credentials)
          }
        }
      });

      void server.services.telemetry
        .sendPostHogEvents({
          event: PostHogEventTypes.ProxiedServiceCreated,
          distinctId: getTelemetryDistinctId(req),
          organizationId: req.permission.orgId,
          properties: {
            projectId: req.body.projectId,
            headerRewriteCount: req.body.credentials.filter(
              (c) => c.role === ProxiedServiceCredentialRole.HeaderRewrite
            ).length,
            substitutionCount: req.body.credentials.filter(
              (c) => c.role === ProxiedServiceCredentialRole.CredentialSubstitution
            ).length,
            substitutionSurfaces: [
              ...new Set(
                req.body.credentials
                  .filter((c) => c.role === ProxiedServiceCredentialRole.CredentialSubstitution)
                  .flatMap((c) => c.substitutionSurfaces ?? [])
              )
            ].sort(),
            hostPatternCount: req.body.hostPattern.split(",").filter((p) => p.trim()).length,
            usesDynamicSecret: req.body.credentials.some((c) => Boolean(c.dynamicSecretName)),
            usesBasicAuth: req.body.credentials.some((c) => Boolean(c.headerPurpose)),
            isEnabled: service.isEnabled
          }
        })
        .catch(() => {});

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
      description: "List the proxied services in a project",
      operationId: "listProxiedServices",
      querystring: z.object({
        projectId: z.string().trim().min(1).max(36).describe(PROXIED_SERVICES.LIST.projectId),
        search: z.string().trim().max(255).optional().describe(PROXIED_SERVICES.LIST.search),
        orderDirection: z.nativeEnum(OrderByDirection).optional().describe(PROXIED_SERVICES.LIST.orderDirection),
        limit: z.coerce.number().int().min(1).max(100).default(100).describe(PROXIED_SERVICES.LIST.limit),
        offset: z.coerce.number().int().min(0).default(0).describe(PROXIED_SERVICES.LIST.offset)
      }),
      response: {
        200: z.object({
          services: ProxiedServiceWithCredentialsSchema.array(),
          totalCount: z.number()
        })
      }
    },
    handler: async (req) => server.services.proxiedService.list(req.query, req.permission)
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
      operationId: "getProxiedServiceById",
      params: z.object({
        serviceId: z.string().uuid().describe(PROXIED_SERVICES.GET.serviceId)
      }),
      response: {
        200: z.object({ service: ProxiedServiceWithCredentialsSchema })
      }
    },
    handler: async (req) => {
      const service = await server.services.proxiedService.getById(req.params, req.permission);
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
      operationId: "updateProxiedService",
      params: z.object({
        serviceId: z.string().uuid().describe(PROXIED_SERVICES.UPDATE.serviceId)
      }),
      body: z.object({
        name: slugSchema({ max: 64, field: "name" }).optional().describe(PROXIED_SERVICES.UPDATE.name),
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
            secretRefs: toSecretRefs(service.credentials)
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
      operationId: "deleteProxiedService",
      params: z.object({
        serviceId: z.string().uuid().describe(PROXIED_SERVICES.DELETE.serviceId)
      }),
      response: {
        204: z.void()
      }
    },
    handler: async (req, res) => {
      const service = await server.services.proxiedService.deleteById(req.params, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: service.projectId,
        event: {
          type: EventType.DELETE_PROXIED_SERVICE,
          metadata: {
            proxiedServiceId: service.id,
            name: service.name
          }
        }
      });

      return res.status(204).send();
    }
  });

  // The standalone Agent Proxy reported usage per service with its own machine identity. That flow is gone:
  // usage is now reported through an agent gateway session, by the broker. A shipped CLI still calls this, so
  // it gets an explanation rather than a 404. Remove once those versions are out of support.
  server.route({
    method: "POST",
    url: "/:serviceId/report-usage",
    config: { rateLimit: writeLimit },
    schema: {
      hide: true
    },
    handler: async (req, res) => {
      void res.status(410).send({
        reqId: req.id,
        statusCode: 410,
        error: "Gone",
        message:
          "The standalone Agent Proxy has been replaced by Agent Gateways. Upgrade the Infisical CLI and run 'infisical secrets agent gateway connect' or 'run' instead (https://infisical.com/docs/documentation/platform/agent-gateways/overview)."
      });
    }
  });
};
