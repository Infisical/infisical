import { z } from "zod";

import { getConfig } from "@app/lib/config/env";
import { authRateLimit } from "@app/server/config/rateLimiter";

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
          token: z.string()
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
        clientProof: z.string().trim(),
        captchaToken: z.string().trim().optional(),
        password: z.string().optional()
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
        captchaToken: req.body.captchaToken,
        email: req.body.email,
        ip: req.realIp,
        userAgent,
        providerAuthToken: req.body.providerAuthToken,
        clientProof: req.body.clientProof,
        password: req.body.password
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
