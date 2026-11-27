import { registerMicrosoftTeamsRoutes } from "./microsoft-teams-routes";
import { registerSlackRoutes } from "./slack-routes";
import { TWorkflowIntegrationsRouterDeps } from "./types";
import { registerWorkflowIntegrationRoutes } from "./workflow-integration-routes";

// Mounted at /api/v1/workflow-integrations. Fastify hands each plugin its options, so the deps travel with them.
export const registerWorkflowIntegrationsRouter = async (
  server: FastifyZodProvider,
  deps: TWorkflowIntegrationsRouterDeps
) => {
  await server.register(registerWorkflowIntegrationRoutes, deps);
  await server.register(registerSlackRoutes, { ...deps, prefix: "/slack" });
  await server.register(registerMicrosoftTeamsRoutes, { ...deps, prefix: "/microsoft-teams" });
};
