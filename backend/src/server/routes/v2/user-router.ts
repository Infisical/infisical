import type { RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";

import { AuthTokenSessionsSchema } from "@app/db/schemas";
import { readLimit, smtpRateLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMethod, AuthMode, MfaMethod } from "@app/services/auth/auth-type";
import { sanitizedOrganizationSchema } from "@app/services/org/org-schema";

import { ensureStepUpMfa, MfaStepUpResource } from "../mfa-step-up-fns";
import { SanitizedUserSchema } from "../sanitizedSchemas";

export const registerUserRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/me/emails/code",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => (req.body as { username?: string })?.username?.trim().substring(0, 100) || req.realIp
      })
    },
    schema: {
      operationId: "sendEmailVerificationCode",
      body: z.object({
        token: z.string().trim()
      }),
      response: {
        200: z.object({})
      }
    },
    handler: async (req) => {
      await server.services.user.sendEmailVerificationCode(req.body.token);
      return {};
    }
  });

  // Set the preferred challenge method among already-configured factors. This
  // never enables/disables MFA and never issues recovery codes.
  server.route({
    method: "PATCH",
    url: "/me/mfa",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserMfaMethod",
      body: z.object({
        selectedMfaMethod: z.nativeEnum(MfaMethod)
      }),
      response: {
        200: z.object({
          user: SanitizedUserSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const user = await server.services.user.setSelectedMfaMethod({
        userId: req.permission.id,
        selectedMfaMethod: req.body.selectedMfaMethod
      });

      return { user };
    }
  });

  // Enroll a factor: proves possession of the factor in-request and persists it.
  // Reachable pre-MFA (requireOrg:false) so the enforced-MFA onboarding flow can set
  // up a factor at login. It NEVER mints recovery codes: those are issued only after
  // the org-required MFA is actually completed (on the first successful verifyMfaToken,
  // or via POST /me/mfa/activate from a full authenticated session). This keeps a
  // password-only, pre-MFA session from bootstrapping recovery codes.
  server.route({
    method: "POST",
    url: "/me/mfa/enroll",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "enrollUserMfa",
      body: z.discriminatedUnion("method", [
        z.object({
          method: z.literal(MfaMethod.EMAIL),
          code: z.string().trim()
        }),
        z.object({
          method: z.literal(MfaMethod.TOTP),
          totp: z.string().trim()
        }),
        z.object({
          method: z.literal(MfaMethod.WEBAUTHN),
          registrationResponse: z
            .object({
              id: z.string(),
              rawId: z.string(),
              response: z
                .object({
                  clientDataJSON: z.string(),
                  attestationObject: z.string()
                })
                .passthrough(),
              clientExtensionResults: z.record(z.unknown()).default({}),
              type: z.literal("public-key")
            })
            .passthrough(),
          name: z.string().optional()
        })
      ]),
      response: {
        200: z.object({})
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      if (req.body.method === MfaMethod.EMAIL) {
        await server.services.user.verifyMfaEnrollmentEmailCode({
          userId: req.permission.id,
          code: req.body.code
        });
      } else if (req.body.method === MfaMethod.TOTP) {
        await server.services.totp.verifyUserTotpConfig({
          userId: req.permission.id,
          totp: req.body.totp
        });
      } else {
        await server.services.webAuthn.verifyRegistrationResponse({
          userId: req.permission.id,
          registrationResponse: req.body.registrationResponse as RegistrationResponseJSON,
          name: req.body.name
        });
      }

      return {};
    }
  });

  // Email enrollment begin: emails a one-time code the user submits to POST
  // /me/mfa/enroll to prove control of the account inbox before codes are minted.
  server.route({
    method: "POST",
    url: "/me/mfa/enroll/email/code",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => req.permission?.id ?? req.realIp
      })
    },
    schema: {
      operationId: "sendMfaEnrollmentEmailCode",
      response: {
        200: z.object({})
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      await server.services.user.sendMfaEnrollmentEmailCode({
        userId: req.permission.id
      });

      return {};
    }
  });

  // Enable MFA from a fully authenticated session (personal settings). Issues a
  // fresh recovery-code pool (invalidating any prior codes), returned once so the
  // client can surface them.
  //
  // Recovery codes bypass any org-required MFA method at login, so they must never
  // be mintable by a session that has not itself completed that method. This route
  // requires an org-scoped token (requireOrg:true): a token for an MFA-enforcing org
  // can only exist after that org's MFA challenge was completed (see
  // selectOrganization), so reaching this handler already proves the org-required
  // method. The transient post-password no-org token used during login/onboarding
  // is rejected here and cannot obtain recovery codes.
  server.route({
    method: "POST",
    url: "/me/mfa/activate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "activateUserMfa",
      body: z.object({
        selectedMfaMethod: z.nativeEnum(MfaMethod).optional()
      }),
      response: {
        200: z.object({
          user: SanitizedUserSchema,
          recoveryCodes: z.string().array()
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { user, recoveryCodes } = await server.services.user.activateMfa({
        userId: req.permission.id,
        selectedMfaMethod: req.body.selectedMfaMethod
      });

      return { user, recoveryCodes };
    }
  });

  // Disable MFA. Disabling weakens account security, so it is gated behind a fresh
  // step-up MFA challenge (same primitive as viewing recovery codes). Enrolled
  // factors are preserved; the recovery-code pool is wiped by the service.
  server.route({
    method: "POST",
    url: "/me/mfa/deactivate",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deactivateUserMfa",
      body: z
        .object({
          mfaSessionId: z.string().trim().optional()
        })
        .optional(),
      response: {
        200: z.object({
          user: SanitizedUserSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      await ensureStepUpMfa(server, {
        userId: req.permission.id,
        resourceId: MfaStepUpResource.DisableMfa,
        mfaSessionId: req.body?.mfaSessionId,
        message: "MFA verification is required to disable two-factor authentication"
      });

      const user = await server.services.user.deactivateMfa({
        userId: req.permission.id
      });

      return { user };
    }
  });

  server.route({
    method: "PATCH",
    url: "/me/name",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserName",
      body: z.object({
        firstName: z.string().trim(),
        lastName: z.string().trim()
      }),
      response: {
        200: z.object({
          user: SanitizedUserSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const user = await server.services.user.updateUserName(req.permission.id, req.body.firstName, req.body.lastName);
      return { user };
    }
  });

  server.route({
    method: "PUT",
    url: "/me/auth-methods",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserAuthMethods",
      body: z.object({
        authMethods: z.nativeEnum(AuthMethod).array().min(1)
      }),
      response: {
        200: z.object({
          user: SanitizedUserSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT, AuthMode.API_KEY], { requireOrg: false }),
    handler: async (req) => {
      const user = await server.services.user.updateAuthMethods(req.permission.id, req.body.authMethods);
      return { user };
    }
  });

  server.route({
    method: "POST",
    url: "/me/email-change/otp",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => req.permission.id
      })
    },
    schema: {
      operationId: "requestEmailChangeOtp",
      body: z.object({
        newEmail: z.string().email().trim()
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string()
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const result = await server.services.user.requestEmailChangeOTP({
        userId: req.permission.id,
        newEmail: req.body.newEmail
      });
      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/me/email-change/verify-current",
    config: {
      rateLimit: smtpRateLimit({
        keyGenerator: (req) => req.permission.id
      })
    },
    schema: {
      operationId: "verifyCurrentEmailOtp",
      body: z.object({
        otpCode: z.string().trim().length(6)
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          newEmail: z.string()
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const result = await server.services.user.verifyCurrentEmailOTP({
        userId: req.permission.id,
        otpCode: req.body.otpCode
      });
      return result;
    }
  });

  server.route({
    method: "PATCH",
    url: "/me/email",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserEmail",
      body: z.object({
        newEmail: z.string().email().trim(),
        otpCode: z.string().trim().length(6)
      }),
      response: {
        200: z.object({
          user: SanitizedUserSchema
        })
      }
    },
    preHandler: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const user = await server.services.user.updateUserEmail({
        userId: req.permission.id,
        newEmail: req.body.newEmail,
        otpCode: req.body.otpCode
      });
      return { user };
    }
  });

  server.route({
    method: "GET",
    url: "/me/organizations",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listUserOrganizations",
      description: "Return organizations that current user is part of",
      response: {
        200: z.object({
          organizations: sanitizedOrganizationSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const organizations = await server.services.org.findAllOrganizationOfUser(req.permission.id);
      return { organizations };
    }
  });

  server.route({
    method: "GET",
    url: "/me/sessions",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listUserSessions",
      response: {
        200: AuthTokenSessionsSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sessions = await server.services.authToken.getTokenSessionByUser(req.permission.id);
      return sessions;
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/sessions",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "revokeAllUserSessions",
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.authToken.revokeAllMySessions(req.permission.id);
      return {
        message: "Successfully revoked all sessions"
      };
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/sessions/:sessionId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "revokeUserSession",
      params: z.object({
        sessionId: z.string().trim()
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.authToken.revokeMySessionById(req.permission.id, req.params.sessionId);
      return {
        message: "Successfully revoked session"
      };
    }
  });

  server.route({
    method: "GET",
    url: "/me",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getCurrentUser",
      description: "Retrieve the current user on the request",
      response: {
        200: z.object({
          user: z.object({
            id: z.string().uuid(),
            email: z.string().nullable().optional(),
            authMethods: z.string().array().nullable().optional(),
            superAdmin: z.boolean().default(false).nullable().optional(),
            firstName: z.string().nullable().optional(),
            lastName: z.string().nullable().optional(),
            isAccepted: z.boolean().default(false).nullable().optional(),
            isMfaEnabled: z.boolean().default(false).nullable().optional(),
            mfaMethods: z
              .string()
              .array()
              .nullable()
              .optional()
              .default(null)
              .describe(
                JSON.stringify({
                  deprecated: true,
                  description: "Deprecated: no longer used and always null. Use selectedMfaMethod instead."
                })
              ),
            devices: z.unknown().nullable().optional(),
            createdAt: z.date(),
            updatedAt: z.date(),
            isGhost: z.boolean().default(false),
            username: z.string(),
            isEmailVerified: z.boolean().default(false).nullable().optional(),
            consecutiveFailedMfaAttempts: z.number().default(0).nullable().optional(),
            isLocked: z.boolean().default(false).nullable().optional(),
            temporaryLockDateEnd: z.date().nullable().optional(),
            consecutiveFailedPasswordAttempts: z.number().default(0).nullable().optional(),
            selectedMfaMethod: z.string().nullable().optional(),
            isGitHubVerified: z.boolean().nullable().optional(),
            isGitLabVerified: z.boolean().nullable().optional(),
            isGoogleVerified: z.boolean().nullable().optional(),
            encryptedPrivateKey: z.string().nullable().optional(),
            iv: z.string().nullable().optional(),
            tag: z.string().nullable().optional(),
            salt: z.string().nullable().optional(),
            protectedKey: z.string().nullable().optional(),
            protectedKeyIV: z.string().nullable().optional(),
            protectedKeyTag: z.string().nullable().optional()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const user = await server.services.user.getMe(req.permission.id);
      return { user };
    }
  });

  server.route({
    method: "DELETE",
    url: "/me",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteUser",
      response: {
        200: z.object({
          user: SanitizedUserSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const user = await server.services.user.deleteUser(req.permission.id);
      return { user };
    }
  });
};
