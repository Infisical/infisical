import { z } from "zod";

import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerChatRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        message: z.string().describe("The message to send to the chat"),
        conversationId: z.string().optional().describe("The id of the conversation"),
        documentationLink: z.string().describe("The documentation link to use for the chat")
      }),
      response: {
        200: z.object({
          conversationId: z.string().describe("The id of the conversation"),
          message: z.string().describe("The response from the chat"),
          citations: z
            .array(
              z.object({
                title: z.string(),
                url: z.string()
              })
            )
            .describe("The citations used to answer the question")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),

    handler: async (req) => {
      const response = await server.services.chat.createChat({
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        message: req.body.message,
        documentationLink: req.body.documentationLink,
        conversationId: req.body.conversationId
      });

      return response;
    }
  });
};
