import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
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

      void res.cookie("aod", "", {
        httpOnly: false,
        path: "/",
        sameSite: "lax",
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
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
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
          organizationId: z.string().optional(),
          subOrganizationId: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      const { decodedToken, tokenVersion } = await server.services.authToken.validateRefreshToken(req.cookies.jid);
      const appCfg = getConfig();
      let expiresIn: string | number = appCfg.JWT_AUTH_LIFETIME;

      if (decodedToken.organizationId) {
        const org = await server.services.org.findOrganizationById({
          userId: decodedToken.userId,
          orgId: decodedToken.subOrganizationId ? decodedToken.subOrganizationId : decodedToken.organizationId,
          actorAuthMethod: decodedToken.authMethod,
          actorOrgId: decodedToken.subOrganizationId ? decodedToken.subOrganizationId : decodedToken.organizationId,
          rootOrgId: decodedToken.organizationId
        });
        if (org && org.userTokenExpiration) {
          expiresIn = getMinExpiresIn(appCfg.JWT_AUTH_LIFETIME, org.userTokenExpiration);
        }
      }

      const token = crypto.jwt().sign(
        {
          authMethod: decodedToken.authMethod,
          authTokenType: AuthTokenType.ACCESS_TOKEN,
          userId: decodedToken.userId,
          tokenVersionId: tokenVersion.id,
          accessVersion: tokenVersion.accessVersion,
          organizationId: decodedToken.organizationId,
          ...(decodedToken.subOrganizationId && { subOrganizationId: decodedToken.subOrganizationId }),
          isMfaVerified: decodedToken.isMfaVerified,
          mfaMethod: decodedToken.mfaMethod
        },
        appCfg.AUTH_SECRET,
        { expiresIn }
      );
      return { token, organizationId: decodedToken.organizationId, subOrganizationId: decodedToken.subOrganizationId };
    }
  });
};
