import { LogProvider } from "../audit-log-stream-enums";

export const getSumoLogicProviderListItem = () => {
  return {
    name: "Sumo Logic" as const,
    provider: LogProvider.SumoLogic as const
  };
};
