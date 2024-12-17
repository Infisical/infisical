import { AppConnection } from "@app/lib/app-connections";
import { registerAwsConnectionRouter } from "@app/server/routes/v1/app-connection-routers/apps/aws-connection-router";
import { registerGitHubConnectionRouter } from "@app/server/routes/v1/app-connection-routers/apps/github-connection-router";

export const APP_CONNECTION_REGISTER_MAP: Record<AppConnection, (server: FastifyZodProvider) => Promise<void>> = {
  [AppConnection.AWS]: registerAwsConnectionRouter,
  [AppConnection.GitHub]: registerGitHubConnectionRouter
};
