import jwt from "jsonwebtoken";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { getMinExpiresIn } from "@app/lib/fn";
import { authRateLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode, AuthTokenType } from "@app/services/auth/auth-type";

export const registerAuthRoutes = async (server: FastifyZodProvider) => {
  server.route({
    url: "/logout",
    method: "POST",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const { decodedToken } = await server.services.authToken.validateRefreshToken(req.cookies.jid);
      const appCfg = getConfig();

      await server.services.login.logout(decodedToken.userId, decodedToken.tokenVersionId);

      void res.cookie("jid", "", {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      void res.cookie("infisical-project-assume-privileges", "", {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED,
        maxAge: 0
      });

      return { message: "Successfully logged out" };
    }
  });

  server.route({
    method: "POST",
    url: "/checkAuth",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      response: {
        200: z.object({
          message: z.literal("Authenticated")
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: () => ({ message: "Authenticated" as const })
  });

  server.route({
    method: "POST",
    url: "/token",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      response: {
        200: z.object({
          token: z.string(),
          organizationId: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      const { decodedToken, tokenVersion } = await server.services.authToken.validateRefreshToken(req.cookies.jid);
      const appCfg = getConfig();
      let expiresIn: string | number = appCfg.JWT_AUTH_LIFETIME;
      if (decodedToken.organizationId) {
        const org = await server.services.org.findOrganizationById(
          decodedToken.userId,
          decodedToken.organizationId,
          decodedToken.authMethod,
          decodedToken.organizationId
        );
        if (org && org.userTokenExpiration) {
          expiresIn = getMinExpiresIn(appCfg.JWT_AUTH_LIFETIME, org.userTokenExpiration);
        }
      }

      const token = jwt.sign(
        {
          authMethod: decodedToken.authMethod,
          authTokenType: AuthTokenType.ACCESS_TOKEN,
          userId: decodedToken.userId,
          tokenVersionId: tokenVersion.id,
          accessVersion: tokenVersion.accessVersion,
          organizationId: decodedToken.organizationId,
          isMfaVerified: decodedToken.isMfaVerified,
          mfaMethod: decodedToken.mfaMethod
        },
        appCfg.AUTH_SECRET,
        { expiresIn }
      );

      return { token, organizationId: decodedToken.organizationId };
    }
  });
};
