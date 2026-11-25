import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { DynamicSecretExternalUserIdSchema } from "@app/ee/services/dynamic-secret-user-credential/dynamic-secret-user-credential-types";
import { ApiDocsTags, DYNAMIC_SECRET_LEASES } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedDynamicSecretLeaseSchema, SanitizedDynamicSecretSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerOAuth2DynamicSecretLeaseRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "createOAuth2DynamicSecretLease",
      tags: [ApiDocsTags.DynamicSecrets],
      description:
        "Get a valid access token for one of your application's users from an OAuth 2.0 dynamic secret that uses the authorization code grant. Infisical refreshes the user's stored tokens when the current access token would expire before the lease ends.",
      body: z.object({
        dynamicSecretName: z
          .string()
          .trim()
          .min(1)
          .max(64)
          .describe(DYNAMIC_SECRET_LEASES.CREATE.dynamicSecretName)
          .toLowerCase(),
        projectSlug: z.string().trim().min(1).max(64).describe(DYNAMIC_SECRET_LEASES.CREATE.projectSlug),
        ttl: z
          .string()
          .optional()
          .describe(DYNAMIC_SECRET_LEASES.CREATE.ttl)
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be greater than 1min" });
            if (valMs > ms("10y"))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
          }),
        path: z
          .string()
          .trim()
          .max(1024)
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRET_LEASES.CREATE.path),
        environmentSlug: z.string().trim().min(1).max(64).describe(DYNAMIC_SECRET_LEASES.CREATE.environmentSlug),
        config: z.object({
          externalUserId: DynamicSecretExternalUserIdSchema.describe(
            DYNAMIC_SECRET_LEASES.OAUTH2.CREATE.config.externalUserId
          )
        })
      }),
      response: {
        200: z.object({
          lease: SanitizedDynamicSecretLeaseSchema,
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
            leaseExpireAt: lease.expireAt,
            externalUserId: req.body.config.externalUserId
          }
        }
      });

      return { lease, data, dynamicSecret };
    }
  });
};
