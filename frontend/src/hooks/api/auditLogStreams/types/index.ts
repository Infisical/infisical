import { LogProvider } from "../enums";
import { TAzureProviderLogStream } from "./providers/azure-provider";
import { TCriblProviderLogStream } from "./providers/cribl-provider";
import { TCustomProviderLogStream } from "./providers/custom-provider";
import { TDatadogProviderLogStream } from "./providers/datadog-provider";
import { TSplunkProviderLogStream } from "./providers/splunk-provider";

export type TAuditLogStream =
  | TCustomProviderLogStream
  | TDatadogProviderLogStream
  | TSplunkProviderLogStream
  | TAzureProviderLogStream
  | TCriblProviderLogStream;

export type TAuditLogStreamProviderMap = {
  [LogProvider.Azure]: TAzureProviderLogStream;
  [LogProvider.Cribl]: TCriblProviderLogStream;
  [LogProvider.Custom]: TCustomProviderLogStream;
  [LogProvider.Datadog]: TDatadogProviderLogStream;
  [LogProvider.Splunk]: TSplunkProviderLogStream;
};

export type TCreateAuditLogStreamDTO = Pick<TAuditLogStream, "provider" | "credentials">;
export type TUpdateAuditLogStreamDTO = Pick<TAuditLogStream, "credentials"> & {
  provider: LogProvider;
  auditLogStreamId: string;
};
export type TDeleteAuditLogStreamDTO = {
  provider: LogProvider;
  auditLogStreamId: string;
};
