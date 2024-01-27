import { z } from "zod";

export const registerIdentityAccessTokenRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/token/renew",
    method: "POST",
    schema: {
      body: z.object({
        accessToken: z.string().trim()
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          expiresIn: z.coerce.number(),
          accessTokenMaxTTL: z.coerce.number(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req) => {
      const { accessToken, identityAccessToken } =
        await server.services.identityAccessToken.renewAccessToken({
          accessToken: req.body.accessToken
        });
      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityAccessToken.accessTokenTTL,
        accessTokenMaxTTL: identityAccessToken.accessTokenMaxTTL
      };
    }
  });
};
