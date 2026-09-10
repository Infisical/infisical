import { z } from "zod";

import { ExternalApprovalType } from "@app/ee/services/external-approval/external-approval-enums";
import { ExternalApprovals } from "@app/lib/api-docs";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerExternalApprovalRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/options",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      description: "List the available external approval options.",
      response: {
        200: z.object({
          externalApprovalOptions: z
            .object({
              type: z.nativeEnum(ExternalApprovalType).describe(ExternalApprovals.LIST_OPTIONS.type),
              app: z.nativeEnum(AppConnection).describe(ExternalApprovals.LIST_OPTIONS.app),
              name: z.string().describe(ExternalApprovals.LIST_OPTIONS.name)
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: () => {
      const externalApprovalOptions = server.services.externalApproval.listExternalApprovalOptions();
      return { externalApprovalOptions };
    }
  });

  server.route({
    url: "/approver-identities",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listExternalApprovalApproverIdentities",
      description: "List the machine identities in the organization that can report external approval decisions.",
      querystring: z.object({
        projectId: z.string().uuid().describe(ExternalApprovals.LIST_APPROVER_IDENTITIES.projectId)
      }),
      response: {
        200: z.object({
          approverIdentities: z
            .object({
              id: z.string().uuid().describe(ExternalApprovals.LIST_APPROVER_IDENTITIES.id),
              name: z.string().describe(ExternalApprovals.LIST_APPROVER_IDENTITIES.name),
              orgId: z.string().uuid().describe(ExternalApprovals.LIST_APPROVER_IDENTITIES.orgId),
              projectId: z
                .string()
                .nullable()
                .describe(ExternalApprovals.LIST_APPROVER_IDENTITIES.identityProjectId)
            })
            .array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const approverIdentities = await server.services.externalApproval.listApproverIdentities({
        projectId: req.query.projectId,
        actor: req.permission
      });

      return { approverIdentities };
    }
  });
};
