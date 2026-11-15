import { z } from "zod";

import { externalInboundCallbackLimit } from "@app/server/config/rateLimiter";
import {
  DELEGATED_APPROVAL_CALLBACK_TOKEN_HEADER,
  DELEGATED_APPROVAL_CALLBACK_TOKEN_MAX_LENGTH
} from "@app/services/delegated-approval-callback/delegated-approval-callback-constants";
import { DelegatedApprovalCallbackEvent } from "@app/services/delegated-approval-callback/delegated-approval-callback-enums";

export const registerDelegatedApprovalCallbackRouter = async (server: FastifyZodProvider) => {
  // Deliberately unauthenticated: the caller is the delegated approval system, which holds no Infisical
  // identity. The per-request token in the header is the credential, checked by the service.
  server.route({
    method: "POST",
    url: "/callback",
    config: {
      rateLimit: externalInboundCallbackLimit
    },
    schema: {
      hide: true,
      operationId: "handleDelegatedApprovalCallback",
      description: "Receive a decision notification from a delegated approval system.",
      headers: z
        .object({
          [DELEGATED_APPROVAL_CALLBACK_TOKEN_HEADER]: z
            .string()
            .trim()
            .max(DELEGATED_APPROVAL_CALLBACK_TOKEN_MAX_LENGTH)
            .optional()
            .describe("The callback token Infisical issued when it sent the request.")
        })
        .passthrough(),
      body: z.object({
        version: z.literal(1).describe("The callback contract version."),
        event: z
          .nativeEnum(DelegatedApprovalCallbackEvent)
          .describe("The event Infisical named when it created the request, returned unchanged."),
        details: z.object({
          externalId: z
            .string()
            .trim()
            .min(1)
            .max(255)
            .describe("The delegated approval system's record ID for the request.")
        })
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.delegatedApprovalCallback.handleCallback({
        token: req.headers[DELEGATED_APPROVAL_CALLBACK_TOKEN_HEADER],
        event: req.body.event,
        externalId: req.body.details.externalId
      });

      return {
        message: "Callback accepted. Infisical will read the decision from the delegated approval system."
      };
    }
  });
};
