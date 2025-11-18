import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { TUsers } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { mfaRateLimit } from "@app/server/config/rateLimiter";
import { addAuthOriginDomainCookie } from "@app/server/lib/cookie";
import { AuthModeMfaJwtTokenPayload, AuthTokenType, MfaMethod } from "@app/services/auth/auth-type";

const handleMfaVerification = async (
  req: FastifyRequest & { mfa: { userId: string; orgId?: string; user: TUsers } },
  res: FastifyReply,
  server: FastifyZodProvider,
  mfaToken: string,
  mfaMethod: MfaMethod,
  isRecoveryCode?: boolean
) => {
  const userAgent = req.headers["user-agent"];
  const mfaJwtToken = req.headers.authorization?.replace("Bearer ", "");
  if (!userAgent) throw new Error("user agent header is required");
  if (!mfaJwtToken) throw new Error("authorization header is required");
  const appCfg = getConfig();

  const { user, token } = await server.services.login.verifyMfaToken({
    userAgent,
    mfaJwtToken,
    ip: req.realIp,
    userId: req.mfa.userId,
    orgId: req.mfa.orgId,
    mfaToken,
    mfaMethod,
    isRecoveryCode
  });

  void res.setCookie("jid", token.refresh, {
    httpOnly: true,
    path: "/",
    sameSite: "strict",
    secure: appCfg.HTTPS_ENABLED
  });

  addAuthOriginDomainCookie(res);

  return {
    ...user,
    token: token.access,
    protectedKey: user.protectedKey || null,
    protectedKeyIV: user.protectedKeyIV || null,
    protectedKeyTag: user.protectedKeyTag || null
  };
};

export const registerMfaRouter = async (server: FastifyZodProvider) => {
  const cfg = getConfig();

  server.decorateRequest("mfa", null);
  server.addHook("preValidation", async (req, res) => {
    const authorizationHeader = req.headers.authorization;

    if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
      void res.status(401).send({ error: "Missing bearer token" });
      return res;
    }
    const token = authorizationHeader.split(" ")[1];
    if (!token) {
      void res.status(401).send({ error: "Missing bearer token" });
      return res;
    }

    const decodedToken = crypto.jwt().verify(token, cfg.AUTH_SECRET) as AuthModeMfaJwtTokenPayload;
    if (decodedToken.authTokenType !== AuthTokenType.MFA_TOKEN) throw new Error("Unauthorized access");

    const user = await server.store.user.findById(decodedToken.userId);
    if (!user) throw new Error("User not found");
    req.mfa = { userId: user.id, user, orgId: decodedToken.organizationId };
  });

  server.route({
    method: "POST",
    url: "/mfa/send",
    config: {
      rateLimit: mfaRateLimit
    },
    schema: {
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.login.resendMfaToken(req.mfa.userId);
      return { message: "Successfully send new mfa code" };
    }
  });

  server.route({
    method: "GET",
    url: "/mfa/check/totp",
    config: {
      rateLimit: mfaRateLimit
    },
    schema: {
      response: {
        200: z.object({
          isVerified: z.boolean()
        })
      }
    },
    handler: async (req) => {
      try {
        const totpConfig = await server.services.totp.getUserTotpConfig({
          userId: req.mfa.userId
        });

        return {
          isVerified: Boolean(totpConfig)
        };
      } catch (error) {
        if (error instanceof NotFoundError || error instanceof BadRequestError) {
          return { isVerified: false };
        }

        throw error;
      }
    }
  });

  server.route({
    url: "/mfa/verify",
    method: "POST",
    config: {
      rateLimit: mfaRateLimit
    },
    schema: {
      body: z.object({
        mfaToken: z.string().trim(),
        mfaMethod: z.nativeEnum(MfaMethod).optional().default(MfaMethod.EMAIL)
      }),
      response: {
        200: z.object({
          encryptionVersion: z.number().default(1).nullable().optional(),
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
      return handleMfaVerification(req, res, server, req.body.mfaToken, req.body.mfaMethod);
    }
  });

  server.route({
    url: "/mfa/verify/recovery-code",
    method: "POST",
    config: {
      rateLimit: mfaRateLimit
    },
    schema: {
      body: z.object({
        recoveryCode: z.string().trim().length(8, "Recovery code must be 8 characters")
      }),
      response: {
        200: z.object({
          encryptionVersion: z.number().default(1).nullable().optional(),
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
      return handleMfaVerification(req, res, server, req.body.recoveryCode, MfaMethod.TOTP, true);
    }
  });

  // WebAuthn MFA routes
  server.route({
    method: "GET",
    url: "/mfa/check/webauthn",
    config: {
      rateLimit: mfaRateLimit
    },
    schema: {
      response: {
        200: z.object({
          hasPasskeys: z.boolean()
        })
      }
    },
    handler: async (req) => {
      try {
        const credentials = await server.services.webAuthn.getUserWebAuthnCredentials({
          userId: req.mfa.userId
        });

        return {
          hasPasskeys: credentials.length > 0
        };
      } catch (error) {
        if (error instanceof NotFoundError) {
          return { hasPasskeys: false };
        }

        throw error;
      }
    }
  });
};
