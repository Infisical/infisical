import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas/dynamic-secret-leases";
import { ApiDocsTags, DYNAMIC_SECRET_LEASES } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedDynamicSecretSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerKubernetesDynamicSecretLeaseRouter = async (server: FastifyZodProvider) => {
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
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be greater than 1min" });
            if (valMs > ms("10y"))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
          }),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRET_LEASES.CREATE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRET_LEASES.CREATE.environmentSlug),
        config: z
          .object({
            namespace: z.string().min(1).optional().describe(DYNAMIC_SECRET_LEASES.KUBERNETES.CREATE.config.namespace)
          })
          .optional()
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
      const { data, lease, dynamicSecret } = await server.services.dynamicSecretLease.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.body.dynamicSecretName,
        ...req.body
      });
      return { lease, data, dynamicSecret };
    }
  });
};
