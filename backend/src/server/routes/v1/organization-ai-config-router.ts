import RE2 from "re2";
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ORG_AI_CONFIG } from "@app/lib/api-docs";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const AiConfigResponseSchema = z
  .object({
    connectionId: z.string().uuid().describe(ORG_AI_CONFIG.connectionId),
    connectionName: z.string().describe(ORG_AI_CONFIG.connectionName),
    model: z.string().describe(ORG_AI_CONFIG.model)
  })
  .nullable();

const AI_MODEL_REGEX = new RE2("^[a-zA-Z0-9._:@-]+$");

const AiModelSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .refine((model) => AI_MODEL_REGEX.test(model), "Model IDs can only contain letters, numbers and . _ : @ -");

export const registerOrgAiConfigRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/ai-config",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getOrganizationAiConfig",
      response: {
        200: z.object({ aiConfig: AiConfigResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const aiConfig = await server.services.ai.getOrgAiConfig(req.permission);
      return { aiConfig };
    }
  });

  server.route({
    method: "PUT",
    url: "/ai-config",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateOrganizationAiConfig",
      body: z
        .object({
          connectionId: z.string().uuid().nullable().describe(ORG_AI_CONFIG.connectionId),
          model: AiModelSchema.nullable().describe(ORG_AI_CONFIG.model)
        })
        .refine((body) => !body.connectionId || body.model, {
          message: "Choose a model for the AI connection",
          path: ["model"]
        }),
      response: {
        200: z.object({ aiConfig: AiConfigResponseSchema })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const aiConfig = await server.services.ai.updateOrgAiConfig(req.body, req.permission);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_ORG_AI_CONFIG,
          metadata: {
            connectionId: aiConfig?.connectionId ?? null,
            connectionName: aiConfig?.connectionName ?? null,
            model: aiConfig?.model ?? null
          }
        }
      });

      return { aiConfig };
    }
  });
};
