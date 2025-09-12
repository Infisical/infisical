import { TAuditLogs } from "@app/db/schemas";

import { LogProvider } from "./audit-log-stream-enums";
import { TCriblProvider, TCriblProviderCredentials } from "./cribl/cribl-provider-types";
import { TCustomProvider, TCustomProviderCredentials } from "./custom/custom-provider-types";
import { TDatadogProvider, TDatadogProviderCredentials } from "./datadog/datadog-provider-types";
import { TSplunkProvider, TSplunkProviderCredentials } from "./splunk/splunk-provider-types";

export type TAuditLogStream = TDatadogProvider | TSplunkProvider | TCustomProvider | TCriblProvider;

export type TAuditLogStreamCredentials =
  | TDatadogProviderCredentials
  | TSplunkProviderCredentials
  | TCustomProviderCredentials
  | TCriblProviderCredentials;

export type TCreateAuditLogStreamDTO = {
  provider: LogProvider;
  credentials: TAuditLogStreamCredentials;
};

export type TUpdateAuditLogStreamDTO = {
  logStreamId: string;
  provider: LogProvider;
  credentials: TAuditLogStreamCredentials;
};

export type TLogStreamFactoryValidateCredentials<C extends TAuditLogStreamCredentials> = (input: {
  credentials: C;
}) => Promise<C>;

export type TLogStreamFactoryStreamLog<C extends TAuditLogStreamCredentials> = (input: {
  credentials: C;
  auditLog: TAuditLogs;
}) => Promise<void>;

export type TLogStreamFactory<C extends TAuditLogStreamCredentials> = () => {
  validateCredentials: TLogStreamFactoryValidateCredentials<C>;
  streamLog: TLogStreamFactoryStreamLog<C>;
};
