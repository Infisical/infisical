import { LogProvider } from "../audit-log-stream-enums";

export const getAzureProviderListItem = () => {
  return {
    name: "Azure" as const,
    provider: LogProvider.Azure as const
  };
};
