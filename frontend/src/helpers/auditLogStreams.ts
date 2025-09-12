import { faCode, IconDefinition } from "@fortawesome/free-solid-svg-icons";

import { LogProvider } from "@app/hooks/api/auditLogStreams/enums";
import { TAuditLogStream } from "@app/hooks/api/types";
import { DiscriminativePick } from "@app/types";

export const AUDIT_LOG_STREAM_PROVIDER_MAP: Record<
  LogProvider,
  { name: string; image?: string; icon?: IconDefinition; size?: number }
> = {
  [LogProvider.Cribl]: { name: "Cribl", image: "Cribl.png", size: 60 },
  [LogProvider.Custom]: { name: "Custom", icon: faCode },
  [LogProvider.Datadog]: { name: "Datadog", image: "Datadog.png" },
  [LogProvider.Splunk]: { name: "Splunk", image: "Splunk.png", size: 65 }
};

// Strictly for showing to the client in the front-end
export function getProviderUrl(
  logStream: DiscriminativePick<TAuditLogStream, "provider" | "credentials">
) {
  switch (logStream.provider) {
    case LogProvider.Custom:
    case LogProvider.Datadog:
    case LogProvider.Cribl:
      return logStream.credentials.url;
    case LogProvider.Splunk:
      return `https://${logStream.credentials.hostname}:8088/services/collector/event`;
    default:
      throw new Error(
        `Unhandled provider in getProviderUrl: ${(logStream as TAuditLogStream).provider}`
      );
  }
}
