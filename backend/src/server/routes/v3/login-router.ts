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
          serverPublicKey: z.string().nullish(),
          salt: z.string().nullish()
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
    url: "/select-sub-organization",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        subOrganizationId: z.string().trim(),
        userAgent: z.enum(["cli"]).optional()
      }),
      response: {
        200: z.object({
          token: z.string(),
          isMfaEnabled: z.boolean(),
          mfaMethod: z.string().optional(),
          subOrganization: z
            .object({
              id: z.string(),
              name: z.string(),
              slug: z.string()
            })
            .optional()
        })
      }
    },
    handler: async (req, res) => {
      const cfg = getConfig();
      const result = await server.services.login.selectSubOrganization({
        userAgent: req.body.userAgent ?? req.headers["user-agent"],
        authJwtToken: req.headers.authorization,
        subOrganizationId: req.body.subOrganizationId,
        ipAddress: req.realIp
      });

      if (result.isMfaEnabled) {
        return {
          token: result.mfa as string,
          isMfaEnabled: true,
          mfaMethod: result.mfaMethod
        };
      }

      void res.setCookie("jid", result.refresh, {
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

      return {
        token: result.access,
        isMfaEnabled: false,
        subOrganization: result.subOrganization
      };
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
          encryptionVersion: z.number().default(1).nullish(),
          protectedKey: z.string().nullish(),
          protectedKeyIV: z.string().nullish(),
          protectedKeyTag: z.string().nullish(),
          publicKey: z.string().nullish(),
          encryptedPrivateKey: z.string().nullish(),
          iv: z.string().nullish(),
          tag: z.string().nullish(),
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

  // New login route that doesn't use SRP
  server.route({
    method: "POST",
    url: "/login",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      body: z.object({
        email: z.string().trim(),
        password: z.string().trim(),
        providerAuthToken: z.string().trim().optional(),
        captchaToken: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          accessToken: z.string()
        })
      }
    },
    handler: async (req, res) => {
      const userAgent = req.headers["user-agent"];
      if (!userAgent) throw new Error("user agent header is required");

      const { tokens } = await server.services.login.login({
        email: req.body.email,
        password: req.body.password,
        ip: req.realIp,
        userAgent,
        providerAuthToken: req.body.providerAuthToken,
        captchaToken: req.body.captchaToken
      });
      const appCfg = getConfig();

      void res.setCookie("jid", tokens.refreshToken, {
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

      return { accessToken: tokens.accessToken };
    }
  });
};
