import { z } from "zod";

import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { AuthMode } from "@app/services/auth/auth-type";
import { DelegatedApprovalPolicyType } from "@app/services/delegated-approval/delegated-approval-enums";

const DelegatedApprovalOptionSchema = z.object({
  name: z.string().describe("The display name of the delegated approval system."),
  type: z
    .nativeEnum(DelegatedApprovalPolicyType)
    .describe("The value to send as delegatedApproval.type when creating or updating a policy."),
  connection: z
    .nativeEnum(AppConnection)
    .describe("The App Connection type that delegatedApproval.connectionId must reference.")
});

export const registerDelegatedApprovalRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/options",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      operationId: "listDelegatedApprovalOptions",
      description: "List the delegated approval systems that approval policies can hand their requests to.",
      response: {
        200: z.object({
          delegatedApprovalOptions: DelegatedApprovalOptionSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN, AuthMode.OAUTH]),
    handler: () => {
      const delegatedApprovalOptions = server.services.delegatedApproval.listDelegatedApprovalOptions();
      return { delegatedApprovalOptions };
    }
  });
};
