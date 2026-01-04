import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { TriggerDevConnectionMethod } from "./trigger-dev-connection-constants";
import { TTriggerDevConnectionConfig } from "./trigger-dev-connection-types";

export const getTriggerDevConnectionListItem = () => {
  return {
    name: "Trigger.dev" as const,
    app: AppConnection.TriggerDev as const,
    methods: Object.values(TriggerDevConnectionMethod)
  };
};

export const validateTriggerDevConnectionCredentials = async ({ credentials }: TTriggerDevConnectionConfig) => {
  return credentials;
};
