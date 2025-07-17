import { z } from "zod";

import { INFISICAL_PROVIDER_GITHUB_ACCESS_TOKEN } from "@app/lib/config/const";
import { getConfig } from "@app/lib/config/env";
import { authRateLimit } from "@app/server/config/rateLimiter";
import { addAuthOriginDomainCookie } from "@app/server/lib/cookie";

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
        organizationId: z.string().trim(),
        userAgent: z.enum(["cli"]).optional()
      }),
      response: {
        200: z.object({
          token: z.string(),
          isMfaEnabled: z.boolean(),
          mfaMethod: z.string().optional()
        })
      }
    },
    handler: async (req, res) => {
      const cfg = getConfig();
      const tokens = await server.services.login.selectOrganization({
        userAgent: req.body.userAgent ?? req.headers["user-agent"],
        authJwtToken: req.headers.authorization,
        organizationId: req.body.organizationId,
        ipAddress: req.realIp
      });

      if (tokens.isMfaEnabled) {
        return {
          token: tokens.mfa as string,
          isMfaEnabled: true,
          mfaMethod: tokens.mfaMethod
        };
      }

      const githubOauthAccessToken = req.cookies[INFISICAL_PROVIDER_GITHUB_ACCESS_TOKEN];
      if (githubOauthAccessToken) {
        await server.services.githubOrgSync
          .syncUserGroups(req.body.organizationId, tokens.user.userId, githubOauthAccessToken)
          .finally(() => {
            void res.setCookie(INFISICAL_PROVIDER_GITHUB_ACCESS_TOKEN, "", {
              httpOnly: true,
              path: "/",
              sameSite: "strict",
              secure: cfg.HTTPS_ENABLED,
              maxAge: 0
            });
          });
      }

      void res.setCookie("jid", tokens.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: cfg.HTTPS_ENABLED
      });

      addAuthOriginDomainCookie(res);

      void res.cookie("infisical-project-assume-privileges", "", {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: cfg.HTTPS_ENABLED,
        maxAge: 0
      });

      return { token: tokens.access, isMfaEnabled: false };
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
        clientProof: z.string().trim(),
        captchaToken: z.string().trim().optional(),
        password: z.string().optional()
      }),
      response: {
        200: z.object({
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
      }
    },
    handler: async (req, res) => {
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");
      const appCfg = getConfig();

      const data = await server.services.login.loginExchangeClientProof({
        captchaToken: req.body.captchaToken,
        email: req.body.email,
        ip: req.realIp,
        userAgent,
        providerAuthToken: req.body.providerAuthToken,
        clientProof: req.body.clientProof,
        password: req.body.password
      });

      void res.setCookie("jid", data.token.refresh, {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED
      });

      addAuthOriginDomainCookie(res);

      void res.cookie("infisical-project-assume-privileges", "", {
        httpOnly: true,
        path: "/",
        sameSite: "strict",
        secure: appCfg.HTTPS_ENABLED,
        maxAge: 0
      });

      return {
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
