import { LogProvider } from "../audit-log-stream-enums";

export const getCustomProviderListItem = () => {
  return {
    name: "Custom" as const,
    provider: LogProvider.Custom as const
  };
};
