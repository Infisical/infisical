import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas/dynamic-secret-leases";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, DYNAMIC_SECRET_LEASES } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedDynamicSecretSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerDynamicSecretLeaseRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      body: z.object({
        dynamicSecretName: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.CREATE.dynamicSecretName).toLowerCase(),
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.CREATE.projectSlug),
        ttl: z
          .string()
          .optional()
          .describe(DYNAMIC_SECRET_LEASES.CREATE.ttl)
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > ms("10y"))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
          }),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRET_LEASES.CREATE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.CREATE.environmentSlug),
        config: z.any().optional()
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema,
          dynamicSecret: SanitizedDynamicSecretSchema,
          data: z.unknown()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { data, lease, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretLease.create({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.body.dynamicSecretName,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.CREATE_DYNAMIC_SECRET_LEASE,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretType: dynamicSecret.type,
            dynamicSecretId: dynamicSecret.id,
            projectId,
            environment,
            secretPath,
            leaseId: lease.id,
            leaseExternalEntityId: lease.externalEntityId,
            leaseExpireAt: lease.expireAt
          }
        }
      });

      return { lease, data, dynamicSecret };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:leaseId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        leaseId: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.DELETE.leaseId)
      }),
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.DELETE.projectSlug),
        path: z
          .string()
          .min(1)
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRET_LEASES.DELETE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.DELETE.environmentSlug),
        isForced: z.boolean().default(false).describe(DYNAMIC_SECRET_LEASES.DELETE.isForced)
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { lease, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretLease.revokeLease({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          leaseId: req.params.leaseId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.DELETE_DYNAMIC_SECRET_LEASE,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretType: dynamicSecret.type,
            dynamicSecretId: dynamicSecret.id,
            leaseId: lease.id,
            leaseExternalEntityId: lease.externalEntityId,
            leaseStatus: lease.status,
            environment,
            secretPath,
            projectId,
            isForced: req.body.isForced
          }
        }
      });

      return { lease };
    }
  });

  server.route({
    method: "POST",
    url: "/:leaseId/renew",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        leaseId: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.RENEW.leaseId)
      }),
      body: z.object({
        ttl: z
          .string()
          .describe(DYNAMIC_SECRET_LEASES.RENEW.ttl)
          .optional()
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > ms("10y"))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
          }),
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.RENEW.projectSlug),
        path: z
          .string()
          .min(1)
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRET_LEASES.RENEW.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.RENEW.environmentSlug)
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { lease, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretLease.renewLease({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          leaseId: req.params.leaseId,
          ...req.body
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.RENEW_DYNAMIC_SECRET_LEASE,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretType: dynamicSecret.type,
            dynamicSecretId: dynamicSecret.id,
            leaseId: lease.id,
            leaseExternalEntityId: lease.externalEntityId,
            newLeaseExpireAt: lease.expireAt,
            environment,
            secretPath,
            projectId
          }
        }
      });

      return { lease };
    }
  });

  server.route({
    url: "/:leaseId",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        leaseId: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.GET_BY_LEASEID.leaseId)
      }),
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.GET_BY_LEASEID.projectSlug),
        path: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRET_LEASES.GET_BY_LEASEID.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.GET_BY_LEASEID.environmentSlug)
      }),
      response: {
        200: z.object({
          lease: DynamicSecretLeasesSchema.extend({
            dynamicSecret: SanitizedDynamicSecretSchema
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { lease, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretLease.getLeaseDetails({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          leaseId: req.params.leaseId,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.GET_DYNAMIC_SECRET_LEASE,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretId: dynamicSecret.id,
            dynamicSecretType: dynamicSecret.type,
            leaseId: lease.id,
            leaseExternalEntityId: lease.externalEntityId,
            leaseExpireAt: lease.expireAt,
            environment,
            secretPath,
            projectId
          }
        }
      });

      return {
        lease: {
          ...lease,
          dynamicSecret
        }
      };
    }
  });
};
