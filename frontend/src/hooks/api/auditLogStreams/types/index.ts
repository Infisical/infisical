import { LogProvider, StreamMode } from "../enums";
import { TAzureProviderLogStream } from "./providers/azure-provider";
import { TCriblProviderLogStream } from "./providers/cribl-provider";
import { TCustomProviderLogStream } from "./providers/custom-provider";
import { TDatadogProviderLogStream } from "./providers/datadog-provider";
import { TQRadarProviderLogStream } from "./providers/qradar-provider";
import { TAuditLogStreamFilters } from "./providers/root-provider";
import { TSplunkProviderLogStream } from "./providers/splunk-provider";
import { TSumoLogicProviderLogStream } from "./providers/sumo-logic-provider";

export type { TAuditLogStreamFilters };

export type TAuditLogStream =
  | TCustomProviderLogStream
  | TDatadogProviderLogStream
  | TSplunkProviderLogStream
  | TAzureProviderLogStream
  | TCriblProviderLogStream
  | TSumoLogicProviderLogStream;

export type TAuditLogStreamProviderMap = {
  [LogProvider.Azure]: TAzureProviderLogStream;
  [LogProvider.Cribl]: TCriblProviderLogStream;
  [LogProvider.Custom]: TCustomProviderLogStream;
  [LogProvider.Datadog]: TDatadogProviderLogStream;
  [LogProvider.Splunk]: TSplunkProviderLogStream;
  [LogProvider.QRadar]: TQRadarProviderLogStream;
  [LogProvider.SumoLogic]: TSumoLogicProviderLogStream;
};

export type TCreateAuditLogStreamDTO = Pick<TAuditLogStream, "provider" | "credentials"> & {
  // Products the stream is scoped to. Omitted/empty -> stream all products.
  filters?: TAuditLogStreamFilters | null;
};
export type TUpdateAuditLogStreamDTO = Pick<TAuditLogStream, "credentials"> & {
  provider: LogProvider;
  auditLogStreamId: string;
  // One-way upgrade from "single" to "batch" (custom streams only).
  streamMode?: StreamMode;
  // Products the stream is scoped to. Omitted/empty -> stream all products.
  filters?: TAuditLogStreamFilters | null;
};
export type TDeleteAuditLogStreamDTO = {
  provider: LogProvider;
  auditLogStreamId: string;
};
