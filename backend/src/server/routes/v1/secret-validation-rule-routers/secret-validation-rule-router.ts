import { z } from "zod";

import { ApiDocsTags, SecretValidationRules } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { DynamicSecretsValidationRuleSchema } from "@app/services/secret-validation-rule/dynamic-secrets";
import { SecretRotationsValidationRuleSchema } from "@app/services/secret-validation-rule/secret-rotations";
import { StaticSecretsValidationRuleSchema } from "@app/services/secret-validation-rule/static-secrets";

const SecretValidationRuleSchema = z.discriminatedUnion("type", [
  StaticSecretsValidationRuleSchema,
  DynamicSecretsValidationRuleSchema,
  SecretRotationsValidationRuleSchema
]);

export const registerSecretValidationRuleRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: { rateLimit: readLimit },
    schema: {
      hide: false,
      operationId: "listSecretValidationRules",
      tags: [ApiDocsTags.SecretValidationRules],
      description: "List every Secret Validation Rule in the specified project, of any type.",
      querystring: z.object({
        projectId: z.string().trim().min(1).max(36).describe(SecretValidationRules.LIST().projectId)
      }),
      response: { 200: z.object({ secretValidationRules: SecretValidationRuleSchema.array() }) }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const secretValidationRules = await server.services.secretValidationRule.listSecretValidationRules(
        { projectId: req.query.projectId },
        req.permission
      );
      return { secretValidationRules };
    }
  });
};
