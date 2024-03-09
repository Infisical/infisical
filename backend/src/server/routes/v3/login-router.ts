import jwt from "jsonwebtoken";
import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { AuthModeJwtTokenPayload } from "@app/services/auth/auth-type";

export const registerLoginRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/login1",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().trim(),
        providerAuthToken: z.string().trim().optional(),
        clientPublicKey: z.string().trim()
      }),
      response: {
        200: z.object({
          serverPublicKey: z.string(),
          salt: z.string()
        })
      }
    },
    handler: async (req) => {
      const { serverPublicKey, salt } = await server.services.login.loginGenServerPublicKey({
        email: req.body.email,
        clientPublicKey: req.body.clientPublicKey,
        providerAuthToken: req.body.providerAuthToken
      });

      return { serverPublicKey, salt };
    }
  });

  server.route({
    method: "POST",
    url: "/select-organization",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        organizationId: z.string().trim()
      }),
      response: {
        200: z.object({
          token: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const cfg = getConfig();

      if (!req.headers.authorization) throw new UnauthorizedError({ name: "Authorization header is required" });
      if (!req.headers["user-agent"]) throw new UnauthorizedError({ name: "user agent header is required" });

      const userAgent = req.headers["user-agent"];
      const authToken = req.headers.authorization.slice(7); // slice of after Bearer

      // The decoded JWT token, which contains the auth method.
      const decodedToken = jwt.verify(authToken, cfg.AUTH_SECRET) as AuthModeJwtTokenPayload;

      if (decodedToken.organizationId) {
        throw new UnauthorizedError({ message: "You have already selected an organization" });
      }

      const user = await server.services.user.getMe(decodedToken.userId);

      // Check if the user actually has access to the specified organization.
      const userOrgs = await server.services.org.findAllOrganizationOfUser(user.id);

      if (!userOrgs.some((org) => org.id === req.body.organizationId)) {
        throw new UnauthorizedError({ message: "User does not have access to the organization" });
      }

      await server.services.authToken.clearTokenSessionById(decodedToken.userId, decodedToken.tokenVersionId);
      const tokens = await server.services.login.generateUserTokens({
        authMethod: decodedToken.authMethod,
        user,
        userAgent,
        ip: req.realIp,
        organizationId: req.body.organizationId
      });

      void res.setCookie("jid", tokens.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: cfg.HTTPS_ENABLED
      });

      return { token: tokens.access };
    }
  });

  server.route({
    method: "POST",
    url: "/login2",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().trim(),
        providerAuthToken: z.string().trim().optional(),
        clientProof: z.string().trim()
      }),
      response: {
        200: z.discriminatedUnion("mfaEnabled", [
          z.object({ mfaEnabled: z.literal(true), token: z.string() }),
          z.object({
            mfaEnabled: z.literal(false),
            encryptionVersion: z.number().default(1).nullable().optional(),
            protectedKey: z.string().nullable(),
            protectedKeyIV: z.string().nullable(),
            protectedKeyTag: z.string().nullable(),
            publicKey: z.string(),
            encryptedPrivateKey: z.string(),
            iv: z.string(),
            tag: z.string(),
            token: z.string()
          })
        ])
      }
    },
    handler: async (req, res) => {
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");
      const appCfg = getConfig();

      const data = await server.services.login.loginExchangeClientProof({
        email: req.body.email,
        ip: req.realIp,
        userAgent,
        providerAuthToken: req.body.providerAuthToken,
        clientProof: req.body.clientProof
      });

      if (data.isMfaEnabled) {
        return { mfaEnabled: true, token: data.token } as const; // for discriminated union
      }

      void res.setCookie("jid", data.token.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      return {
        mfaEnabled: false,
        encryptionVersion: data.user.encryptionVersion,
        token: data.token.access,
        publicKey: data.user.publicKey,
        encryptedPrivateKey: data.user.encryptedPrivateKey,
        iv: data.user.iv,
        tag: data.user.tag,
        protectedKey: data.user.protectedKey || null,
        protectedKeyIV: data.user.protectedKeyIV || null,
        protectedKeyTag: data.user.protectedKeyTag || null
      } as const;
    }
  });
};
