import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { registerAwsConnectionRouter } from "./aws-connection-router";
import { registerGitHubConnectionRouter } from "./github-connection-router";

export * from "./app-connection-router";

export const APP_CONNECTION_REGISTER_ROUTER_MAP: Record<AppConnection, (server: FastifyZodProvider) => Promise<void>> =
  {
    [AppConnection.AWS]: registerAwsConnectionRouter,
    [AppConnection.GitHub]: registerGitHubConnectionRouter
  };
