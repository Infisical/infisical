import { LogProvider } from "../audit-log-stream-enums";

export const getSplunkProviderListItem = () => {
  return {
    name: "Splunk" as const,
    provider: LogProvider.Splunk as const
  };
};
