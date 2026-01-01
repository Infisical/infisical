import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ConvexConnectionMethod } from "./convex-connection-constants";
import { TConvexConnectionConfig } from "./convex-connection-types";

export const getConvexConnectionListItem = () => {
  return {
    name: "Convex" as const,
    app: AppConnection.Convex as const,
    methods: Object.values(ConvexConnectionMethod)
  };
};

export const validateConvexConnectionCredentials = async ({ credentials }: TConvexConnectionConfig) => {
  return credentials;
};
