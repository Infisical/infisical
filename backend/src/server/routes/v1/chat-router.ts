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
        messageHistory: z
          .array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string().describe("The content of the message")
            })
          )
          .describe("The message history"),
        documentationLink: z.string().describe("The documentation link to use for the chat")
      }),
      response: {
        200: z.object({
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
        messageHistory: req.body.messageHistory,
        documentationLink: req.body.documentationLink
      });

      return response;
    }
  });
};
