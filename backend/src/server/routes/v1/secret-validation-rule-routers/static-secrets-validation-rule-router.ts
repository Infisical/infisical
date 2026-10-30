import { z } from "zod";

import { ApiDocsTags, SecretValidationRules } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SecretValidationRuleType } from "@app/services/secret-validation-rule/secret-validation-rule-enums";
import {
  CreateStaticSecretsValidationRuleSchema,
  StaticSecretsValidationRuleSchema,
  UpdateStaticSecretsValidationRuleSchema
} from "@app/services/secret-validation-rule/static-secrets";

import { registerSecretValidationRuleEndpoints } from "./secret-validation-rule-endpoints";

export const registerStaticSecretsValidationRuleRouter = async (server: FastifyZodProvider) => {
  registerSecretValidationRuleEndpoints({
    server,
    type: SecretValidationRuleType.StaticSecrets,
    responseSchema: StaticSecretsValidationRuleSchema,
    createSchema: CreateStaticSecretsValidationRuleSchema,
    updateSchema: UpdateStaticSecretsValidationRuleSchema
  });

  // Creating a generated value is a POST that persists nothing. The value is deliberately kept out of audit logs and telemetry.
  server.route({
    method: "POST",
    url: "/:ruleId/generated-values",
    config: { rateLimit: writeLimit },
    schema: {
      hide: false,
      operationId: "generateStaticSecretsValidationRuleValue",
      tags: [ApiDocsTags.SecretValidationRules],
      description:
        "Generate a secret value that satisfies the value constraints of the specified Static Secrets Validation Rule. The value is not stored.",
      params: z.object({
        ruleId: z.string().uuid().describe(SecretValidationRules.GENERATE_STATIC_SECRET_VALUE.ruleId)
      }),
      response: {
        200: z.object({ value: z.string().describe(SecretValidationRules.GENERATE_STATIC_SECRET_VALUE.value) })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req, res) => {
      const value = await server.services.secretValidationRule.generateStaticSecretValue(
        { ruleId: req.params.ruleId },
        req.permission
      );

      void res.header("Cache-Control", "no-store");
      return { value };
    }
  });
};
