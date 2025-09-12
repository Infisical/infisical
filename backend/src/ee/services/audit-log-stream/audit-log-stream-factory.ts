import { LogProvider } from "./audit-log-stream-enums";
import { TAuditLogStreamCredentials, TLogStreamFactory } from "./audit-log-stream-types";
import { AzureProviderFactory } from "./azure/azure-provider-factory";
import { CriblProviderFactory } from "./cribl/cribl-provider-factory";
import { CustomProviderFactory } from "./custom/custom-provider-factory";
import { DatadogProviderFactory } from "./datadog/datadog-provider-factory";
import { SplunkProviderFactory } from "./splunk/splunk-provider-factory";

type TLogStreamFactoryImplementation = TLogStreamFactory<TAuditLogStreamCredentials>;

export const LOG_STREAM_FACTORY_MAP: Record<LogProvider, TLogStreamFactoryImplementation> = {
  [LogProvider.Azure]: AzureProviderFactory as TLogStreamFactoryImplementation,
  [LogProvider.Datadog]: DatadogProviderFactory as TLogStreamFactoryImplementation,
  [LogProvider.Splunk]: SplunkProviderFactory as TLogStreamFactoryImplementation,
  [LogProvider.Custom]: CustomProviderFactory as TLogStreamFactoryImplementation,
  [LogProvider.Cribl]: CriblProviderFactory as TLogStreamFactoryImplementation
};
