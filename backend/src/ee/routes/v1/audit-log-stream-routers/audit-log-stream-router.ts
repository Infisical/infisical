import { z } from "zod";

import {
  AzureProviderListItemSchema,
  SanitizedAzureProviderSchema
} from "@app/ee/services/audit-log-stream/azure/azure-provider-schemas";
import {
  CriblProviderListItemSchema,
  SanitizedCriblProviderSchema
} from "@app/ee/services/audit-log-stream/cribl/cribl-provider-schemas";
import {
  CustomProviderListItemSchema,
  SanitizedCustomProviderSchema
} from "@app/ee/services/audit-log-stream/custom/custom-provider-schemas";
import {
  DatadogProviderListItemSchema,
  SanitizedDatadogProviderSchema
} from "@app/ee/services/audit-log-stream/datadog/datadog-provider-schemas";
import {
  SanitizedSplunkProviderSchema,
  SplunkProviderListItemSchema
} from "@app/ee/services/audit-log-stream/splunk/splunk-provider-schemas";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

const SanitizedAuditLogStreamSchema = z.union([
  SanitizedCustomProviderSchema,
  SanitizedDatadogProviderSchema,
  SanitizedSplunkProviderSchema,
  SanitizedAzureProviderSchema,
  SanitizedCriblProviderSchema
]);

const ProviderOptionsSchema = z.discriminatedUnion("provider", [
  CustomProviderListItemSchema,
  DatadogProviderListItemSchema,
  SplunkProviderListItemSchema,
  AzureProviderListItemSchema,
  CriblProviderListItemSchema
]);

export const registerAuditLogStreamRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          providerOptions: ProviderOptionsSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: () => {
      const providerOptions = server.services.auditLogStream.listProviderOptions();

      return { providerOptions };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      response: {
        200: z.object({
          auditLogStreams: SanitizedAuditLogStreamSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const auditLogStreams = await server.services.auditLogStream.list(req.permission);

      return { auditLogStreams };
    }
  });
};
