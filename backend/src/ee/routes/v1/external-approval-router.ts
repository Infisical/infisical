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
};
