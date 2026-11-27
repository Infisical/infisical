import { z } from "zod";

import { AuthMode } from "@app/lib/auth/actor-types";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

// Alerting's answer to "how many alerts post through this Slack integration", kept at the URL the delete dialog and API
// clients already call. Mounted at /api/v1/workflow-integrations/slack beside the Workflow Integrations routes.
export const registerAlertSlackIntegrationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:id/alert-count",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getSlackIntegrationAlertCount",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        id: z.string().uuid()
      }),
      response: {
        200: z.object({ alertCount: z.number() })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: async (req) => {
      const alertCount = await server.services.alert.countAlertsUsingSlackIntegration({
        actor: req.actor,
        id: req.params.id
      });

      return { alertCount };
    }
  });
};
