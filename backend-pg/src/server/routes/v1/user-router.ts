import { z } from "zod";

import { UsersSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerUserRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    schema: {
      response: {
        200: z.object({
          user: UsersSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const user = await server.services.user.getMe(req.auth.userId);
      return { user };
    }
  });
};
