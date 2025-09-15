import { LogProvider } from "@app/ee/services/audit-log-stream/audit-log-stream-enums";
import {
  CreateAzureProviderLogStreamSchema,
  SanitizedAzureProviderSchema,
  UpdateAzureProviderLogStreamSchema
} from "@app/ee/services/audit-log-stream/azure/azure-provider-schemas";
import {
  CreateCriblProviderLogStreamSchema,
  SanitizedCriblProviderSchema,
  UpdateCriblProviderLogStreamSchema
} from "@app/ee/services/audit-log-stream/cribl/cribl-provider-schemas";
import {
  CreateCustomProviderLogStreamSchema,
  SanitizedCustomProviderSchema,
  UpdateCustomProviderLogStreamSchema
} from "@app/ee/services/audit-log-stream/custom/custom-provider-schemas";
import {
  CreateDatadogProviderLogStreamSchema,
  SanitizedDatadogProviderSchema,
  UpdateDatadogProviderLogStreamSchema
} from "@app/ee/services/audit-log-stream/datadog/datadog-provider-schemas";
import {
  CreateSplunkProviderLogStreamSchema,
  SanitizedSplunkProviderSchema,
  UpdateSplunkProviderLogStreamSchema
} from "@app/ee/services/audit-log-stream/splunk/splunk-provider-schemas";

import { registerAuditLogStreamEndpoints } from "./audit-log-stream-endpoints";

export * from "./audit-log-stream-router";

export const AUDIT_LOG_STREAM_REGISTER_ROUTER_MAP: Record<LogProvider, (server: FastifyZodProvider) => Promise<void>> =
  {
    [LogProvider.Azure]: async (server: FastifyZodProvider) => {
      registerAuditLogStreamEndpoints({
        server,
        provider: LogProvider.Azure,
        sanitizedResponseSchema: SanitizedAzureProviderSchema,
        createSchema: CreateAzureProviderLogStreamSchema,
        updateSchema: UpdateAzureProviderLogStreamSchema
      });
    },
    [LogProvider.Custom]: async (server: FastifyZodProvider) => {
      registerAuditLogStreamEndpoints({
        server,
        provider: LogProvider.Custom,
        sanitizedResponseSchema: SanitizedCustomProviderSchema,
        createSchema: CreateCustomProviderLogStreamSchema,
        updateSchema: UpdateCustomProviderLogStreamSchema
      });
    },
    [LogProvider.Datadog]: async (server: FastifyZodProvider) => {
      registerAuditLogStreamEndpoints({
        server,
        provider: LogProvider.Datadog,
        sanitizedResponseSchema: SanitizedDatadogProviderSchema,
        createSchema: CreateDatadogProviderLogStreamSchema,
        updateSchema: UpdateDatadogProviderLogStreamSchema
      });
    },
    [LogProvider.Splunk]: async (server: FastifyZodProvider) => {
      registerAuditLogStreamEndpoints({
        server,
        provider: LogProvider.Splunk,
        sanitizedResponseSchema: SanitizedSplunkProviderSchema,
        createSchema: CreateSplunkProviderLogStreamSchema,
        updateSchema: UpdateSplunkProviderLogStreamSchema
      });
    },
    [LogProvider.Cribl]: async (server: FastifyZodProvider) => {
      registerAuditLogStreamEndpoints({
        server,
        provider: LogProvider.Cribl,
        sanitizedResponseSchema: SanitizedCriblProviderSchema,
        createSchema: CreateCriblProviderLogStreamSchema,
        updateSchema: UpdateCriblProviderLogStreamSchema
      });
    }
  };
