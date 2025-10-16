import { LogProvider } from "../audit-log-stream-enums";

export const getCriblProviderListItem = () => {
  return {
    name: "Cribl" as const,
    provider: LogProvider.Cribl as const
  };
};
