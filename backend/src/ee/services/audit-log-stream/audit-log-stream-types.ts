import { TAuditLogs } from "@app/db/schemas";

import { LogProvider, StreamMode } from "./audit-log-stream-enums";
import { TAuditLogStreamFilters } from "./audit-log-stream-schemas";
import { TAzureProvider, TAzureProviderCredentials } from "./azure/azure-provider-types";
import { TCriblProvider, TCriblProviderCredentials } from "./cribl/cribl-provider-types";
import { TCustomProvider, TCustomProviderCredentials } from "./custom/custom-provider-types";
import { TDatadogProvider, TDatadogProviderCredentials } from "./datadog/datadog-provider-types";
import { TSplunkProvider, TSplunkProviderCredentials } from "./splunk/splunk-provider-types";

export type TAuditLogStream = TDatadogProvider | TSplunkProvider | TCustomProvider | TAzureProvider | TCriblProvider;

export type TAuditLogStreamCredentials =
  | TDatadogProviderCredentials
  | TSplunkProviderCredentials
  | TCustomProviderCredentials
  | TAzureProviderCredentials
  | TCriblProviderCredentials;

export type TCreateAuditLogStreamDTO = {
  provider: LogProvider;
  credentials: TAuditLogStreamCredentials;
  // Products the stream is scoped to. Omitted/empty -> stream all products.
  filters?: TAuditLogStreamFilters | null;
};

export type TUpdateAuditLogStreamDTO = {
  logStreamId: string;
  provider: LogProvider;
  credentials: TAuditLogStreamCredentials;
  // Optional one-way upgrade from "single" to "batch". Downgrades are rejected.
  streamMode?: StreamMode;
  // Products the stream is scoped to. Omitted leaves the existing filter unchanged; pass null or an
  // empty product list to clear it (stream all products).
  filters?: TAuditLogStreamFilters | null;
};

export type TLogStreamFactoryValidateCredentials<C extends TAuditLogStreamCredentials> = (input: {
  credentials: C;
}) => Promise<C>;

export type TLogStreamFactoryBatchStreamLog<C extends TAuditLogStreamCredentials> = (input: {
  credentials: C;
  auditLogs: TAuditLogs[];
}) => Promise<void>;

// Single-event delivery: one log POSTed per request. Only providers that support
// the legacy "single" stream mode (custom, cribl) implement this.
export type TLogStreamFactoryStreamLog<C extends TAuditLogStreamCredentials> = (input: {
  credentials: C;
  auditLog: TAuditLogs;
}) => Promise<void>;

export type TLogStreamFactoryProviderBatchLimit = {
  maxLogs: number;
  maxBytes: number;
};

export type TLogStreamFactoryGetProviderBatchLimit = () => TLogStreamFactoryProviderBatchLimit;

export type TLogStreamFactory<C extends TAuditLogStreamCredentials> = () => {
  validateCredentials: TLogStreamFactoryValidateCredentials<C>;
  batchStreamLog: TLogStreamFactoryBatchStreamLog<C>;
  getProviderBatchLimit: TLogStreamFactoryGetProviderBatchLimit;
  // Present only for providers that support "single" stream mode (custom, cribl).
  streamLog?: TLogStreamFactoryStreamLog<C>;
};
