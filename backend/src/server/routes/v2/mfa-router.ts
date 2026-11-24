import { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { TUsers } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { mfaRateLimit } from "@app/server/config/rateLimiter";
import { addAuthOriginDomainCookie } from "@app/server/lib/cookie";
import { resolveMfaChallenge } from "@app/services/auth/auth-fns";
import { AuthModeMfaJwtTokenPayload, AuthTokenType, MfaMethod } from "@app/services/auth/auth-type";

const handleMfaVerification = async (
  req: FastifyRequest & {
    mfa: { userId: string; orgId?: string; user: TUsers; allowedMfaMethods: MfaMethod[] };
  },
  res: FastifyReply,
  server: FastifyZodProvider,
  mfaToken: string,
  mfaMethod: MfaMethod,
  isRecoveryCode?: boolean
) => {
  const userAgent = req.headers["user-agent"];
  const mfaJwtToken = req.headers.authorization?.replace("Bearer ", "");
  if (!userAgent) throw new BadRequestError({ message: "User agent header is required" });
  if (!mfaJwtToken) throw new UnauthorizedError({ message: "Authorization header is required" });
  const appCfg = getConfig();

  const { user, token } = await server.services.login.verifyMfaToken({
    userAgent,
    mfaJwtToken,
    ip: req.realIp,
    userId: req.mfa.userId,
    orgId: req.mfa.orgId,
    mfaToken,
    mfaMethod,
    allowedMfaMethods: req.mfa.allowedMfaMethods,
    isRecoveryCode
  });

  void res.setCookie("jid", token.refresh, {
    httpOnly: true,
    path: "/api",
    sameSite: "strict",
    secure: appCfg.HTTPS_ENABLED
  });

  addAuthOriginDomainCookie(res);

  return {
    ...user,
    hashedPassword: null,
    token: token.access
  };
};

export const registerMfaRouter = async (server: FastifyZodProvider) => {
  const cfg = getConfig();

  server.decorateRequest("mfa");
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
    if (decodedToken.authTokenType !== AuthTokenType.MFA_TOKEN)
      throw new UnauthorizedError({ message: "Unauthorized access" });

    const user = await server.store.user.findById(decodedToken.userId);
    if (!user) throw new UnauthorizedError({ message: "Unauthorized access" });

    req.mfa = {
      userId: user.id,
      user,
      orgId: decodedToken.organizationId,
      allowedMfaMethods: decodedToken.allowedMfaMethods
    };
  });

  server.route({
    method: "POST",
    url: "/mfa/send",
    config: {
      rateLimit: mfaRateLimit
    },
    schema: {
      operationId: "resendMfaToken",
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    handler: async (req) => {
      await server.services.login.resendMfaToken(req.mfa.userId, req.mfa.allowedMfaMethods);
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
      operationId: "checkTotpMfa",
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
      operationId: "verifyMfa",
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
      operationId: "verifyMfaRecoveryCode",
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
      // A recovery code stands in for any factor. The session records an allowed method so switching orgs
      // doesn't treat it as a changed method and ask for MFA again.
      return handleMfaVerification(req, res, server, req.body.recoveryCode, req.mfa.allowedMfaMethods[0], true);
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
      operationId: "checkWebauthnMfa",
      response: {
        200: z.object({
          hasPasskeys: z.boolean()
        })
      }
    },
    handler: async (req) => {
      try {
        const { credentials } = await server.services.webAuthn.getUserWebAuthnCredentials({
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

  // What the login MFA step offers: the method to show first, the other set-up methods the org allows ("More
  // options"), and, when nothing usable is set up, the allowed methods the user can enroll.
  server.route({
    method: "GET",
    url: "/mfa/methods",
    config: {
      rateLimit: mfaRateLimit
    },
    schema: {
      operationId: "getMfaMethods",
      response: {
        200: z.object({
          challengeMethod: z.nativeEnum(MfaMethod),
          usableMethods: z.nativeEnum(MfaMethod).array(),
          enrollableMethods: z.nativeEnum(MfaMethod).array()
        })
      }
    },
    handler: async (req) => {
      const enrolledMethods = await server.services.user.getEnrolledMfaMethods(req.mfa.user);
      const { usableMethods, challengeMethod } = resolveMfaChallenge({
        allowedMethods: req.mfa.allowedMfaMethods,
        enrolledMethods,
        preferredMethod: req.mfa.user.selectedMfaMethod
      });
      const enrollableMethods = usableMethods.length
        ? []
        : req.mfa.allowedMfaMethods.filter((method) => method !== MfaMethod.EMAIL);

      return {
        challengeMethod: challengeMethod ?? enrollableMethods[0] ?? MfaMethod.EMAIL,
        usableMethods,
        enrollableMethods
      };
    }
  });
};
