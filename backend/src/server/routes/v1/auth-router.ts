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
      operationId: "logout",
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const appCfg = getConfig();

      try {
        const { decodedToken } = await server.services.authToken.validateRefreshToken(req.cookies.jid);
        await server.services.login.logout(decodedToken.userId, decodedToken.tokenVersionId);
      } catch (err) {
        // If token validation fails (e.g. expired/malformed refresh token),
        // we still proceed to clear all session cookies below.
        req.log.warn(err, "Logout token validation failed; proceeding to clear cookies");
      }

      void res.cookie("jid", "", {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED,
        maxAge: 0
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
      operationId: "checkAuth",
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
      operationId: "refreshAuthToken",
      response: {
        200: z.object({
          token: z.string(),
          refreshToken: z.string().optional(),
          organizationId: z.string().optional(),
          subOrganizationId: z.string().optional()
        })
      }
    },
    handler: async (req, res) => {
      const appCfg = getConfig();

      let decodedToken;
      let tokenVersion;
      let isGraceHit;
      try {
        ({ decodedToken, tokenVersion, isGraceHit } = await server.services.authToken.validateRefreshToken(
          req.cookies.jid
        ));
      } catch (err) {
        // Clear the expired/invalid jid cookie so it doesn't cause login loops
        // when the browser keeps sending the stale cookie on subsequent requests.
        void res.cookie("jid", "", {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: appCfg.HTTPS_ENABLED,
          maxAge: 0
        });
        throw err;
      }

      let newRefreshToken: string | undefined;
      let sessionForAccessToken = tokenVersion;

      if (!isGraceHit) {
        // Normal rotation: issue new refresh token and invalidate the old one
        const rotation = await server.services.authToken.rotateRefreshToken(decodedToken, tokenVersion);
        newRefreshToken = rotation.newRefreshToken;
        sessionForAccessToken = rotation.updatedSession;
      }

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
          tokenVersionId: sessionForAccessToken.id,
          accessVersion: sessionForAccessToken.accessVersion,
          organizationId: decodedToken.organizationId,
          ...(decodedToken.subOrganizationId && { subOrganizationId: decodedToken.subOrganizationId }),
          isMfaVerified: decodedToken.isMfaVerified,
          mfaMethod: decodedToken.mfaMethod
        },
        appCfg.AUTH_SECRET,
        { expiresIn }
      );

      // Set rotated refresh token cookie (only when rotation happened, not on grace hits)
      if (newRefreshToken) {
        void res.setCookie("jid", newRefreshToken, {
          httpOnly: true,
          path: "/",
          sameSite: "strict",
          secure: appCfg.HTTPS_ENABLED
        });
      }

      return {
        token,
        refreshToken: newRefreshToken,
        organizationId: decodedToken.organizationId,
        subOrganizationId: decodedToken.subOrganizationId
      };
    }
  });
};
