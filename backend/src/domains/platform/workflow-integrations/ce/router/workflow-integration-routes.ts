import { WorkflowIntegrationsSchema } from "@app/db/schemas";
import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

import { toWorkflowIntegrationResponse } from "./responses";
import { TWorkflowIntegrationsRouterDeps } from "./types";

const sanitizedWorkflowIntegrationSchema = WorkflowIntegrationsSchema.pick({
  id: true,
  description: true,
  slug: true,
  integration: true,
  status: true
});

export const registerWorkflowIntegrationRoutes = async (
  server: FastifyZodProvider,
  { workflowIntegrationService }: Pick<TWorkflowIntegrationsRouterDeps, "workflowIntegrationService">
) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listWorkflowIntegrations",
      security: [
        {
          bearerAuth: []
        }
      ],
      response: {
        200: sanitizedWorkflowIntegrationSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const workflowIntegrations = await workflowIntegrationService.listByOrg({ actor: req.actor });

      return workflowIntegrations.map(toWorkflowIntegrationResponse);
    }
  });
};
