import { z } from "zod";

import { UNIVERSAL_AUTH } from "@app/lib/api-docs";
import { writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerIdentityAccessTokenRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/token/renew",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Renew access token",
      body: z.object({
        accessToken: z.string().trim().describe(UNIVERSAL_AUTH.RENEW_ACCESS_TOKEN.accessToken)
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
      const { accessToken, identityAccessToken } = await server.services.identityAccessToken.renewAccessToken({
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

  server.route({
    url: "/token/revoke",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Revoke access token",
      body: z.object({
        accessToken: z.string().trim().describe(UNIVERSAL_AUTH.REVOKE_ACCESS_TOKEN.accessToken)
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.identityAccessToken.revokeAccessToken(req.body.accessToken);
      return {
        message: "Successfully revoked access token"
      };
    }
  });

  server.route({
    url: "/token/revoke-by-id",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      description: "Revoke access token by the id of the token",
      body: z.object({
        tokenId: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.identityAccessToken.revokeAccessTokenById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      return {
        message: "Successfully revoked access token"
      };
    }
  });
};
