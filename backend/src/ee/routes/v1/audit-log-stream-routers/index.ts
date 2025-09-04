import { LogProvider } from "@app/ee/services/audit-log-stream/audit-log-stream-enums";
import {
  CustomProviderSchema,
  SanitizedCustomProviderSchema
} from "@app/ee/services/audit-log-stream/custom/custom-provider-schemas";
import {
  DatadogProviderSchema,
  SanitizedDatadogProviderSchema
} from "@app/ee/services/audit-log-stream/datadog/datadog-provider-schemas";
import {
  SanitizedSplunkProviderSchema,
  SplunkProviderSchema
} from "@app/ee/services/audit-log-stream/splunk/splunk-provider-schemas";

import { registerAuditLogStreamEndpoints } from "./audit-log-stream-endpoints";

export * from "./audit-log-stream-router";

export const AUDIT_LOG_STREAM_REGISTER_ROUTER_MAP: Record<LogProvider, (server: FastifyZodProvider) => Promise<void>> =
  {
    [LogProvider.Custom]: async (server: FastifyZodProvider) => {
      registerAuditLogStreamEndpoints({
        server,
        provider: LogProvider.Custom,
        sanitizedResponseSchema: SanitizedCustomProviderSchema,
        createSchema: CustomProviderSchema,
        updateSchema: CustomProviderSchema
      });
    },
    [LogProvider.Datadog]: async (server: FastifyZodProvider) => {
      registerAuditLogStreamEndpoints({
        server,
        provider: LogProvider.Datadog,
        sanitizedResponseSchema: SanitizedDatadogProviderSchema,
        createSchema: DatadogProviderSchema,
        updateSchema: DatadogProviderSchema
      });
    },
    [LogProvider.Splunk]: async (server: FastifyZodProvider) => {
      registerAuditLogStreamEndpoints({
        server,
        provider: LogProvider.Splunk,
        sanitizedResponseSchema: SanitizedSplunkProviderSchema,
        createSchema: SplunkProviderSchema,
        updateSchema: SplunkProviderSchema
      });
    }
  };
