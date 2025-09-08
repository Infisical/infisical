import { LogProvider } from "../audit-log-stream-enums";

export const getDatadogProviderListItem = () => {
  return {
    name: "Datadog" as const,
    provider: LogProvider.Datadog as const
  };
};
