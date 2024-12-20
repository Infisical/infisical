import { registerAwsConnectionRouter } from "@app/server/routes/v1/app-connection-routers/apps/aws-connection-router";
import { registerGitHubConnectionRouter } from "@app/server/routes/v1/app-connection-routers/apps/github-connection-router";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

export const APP_CONNECTION_REGISTER_MAP: Record<AppConnection, (server: FastifyZodProvider) => Promise<void>> = {
  [AppConnection.AWS]: registerAwsConnectionRouter,
  [AppConnection.GitHub]: registerGitHubConnectionRouter
};
