import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";

import { UsersSchema } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { authRateLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode, MfaMethod } from "@app/services/auth/auth-type";

const SantizedUserSchema = UsersSchema.omit({
  hashedPassword: true
});

// Recovery codes double as a login second factor, so reading or rotating them must
// require a fresh MFA challenge — not just a valid session token. This binds the
// step-up MFA session to a dedicated resource so a session minted for another
// feature (e.g. PAM access) can't be replayed here.
const RECOVERY_CODE_MFA_RESOURCE = "mfa-recovery-codes";

/**
 * Enforces that the caller has completed an MFA challenge before recovery codes
 * are revealed or rotated, reusing the Redis-backed step-up MFA session primitive
 * (mirrors the PAM account-access flow).
 *
 * A verified session is reusable for the remainder of its TTL (5 min): once the
 * user has completed MFA they can view and rotate their codes repeatedly without
 * re-challenging. The session is NOT consumed on use — expiry is handled purely by
 * the Redis TTL.
 *
 * - With a valid, verified session for this user + resource: returns immediately.
 * - Otherwise (no session id, or one that is missing/expired/unverified/foreign):
 *   mints a fresh pending session (emailing the code when the user's method is
 *   email) and throws `SESSION_MFA_REQUIRED` carrying the new session id + method
 *   so the client can drive the challenge and retry.
 */
const ensureRecoveryCodeMfa = async (server: FastifyZodProvider, userId: string, mfaSessionId?: string) => {
  if (
    mfaSessionId &&
    (await server.services.mfaSession.isMfaSessionActive({
      mfaSessionId,
      userId,
      resourceId: RECOVERY_CODE_MFA_RESOURCE
    }))
  ) {
    return;
  }

  const user = await server.services.user.getMe(userId);
  const mfaMethod = (user.selectedMfaMethod as MfaMethod | null) ?? MfaMethod.EMAIL;

  const newMfaSessionId = await server.services.mfaSession.createMfaSession(
    userId,
    RECOVERY_CODE_MFA_RESOURCE,
    mfaMethod
  );

  if (mfaMethod === MfaMethod.EMAIL && user.email) {
    await server.services.mfaSession.sendMfaCode(userId, user.email);
  }

  throw new BadRequestError({
    message: "MFA verification is required to access recovery codes",
    name: "SESSION_MFA_REQUIRED",
    details: { mfaSessionId: newMfaSessionId, mfaMethod }
  });
};

export const registerUserRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getCurrentUserV1",
      response: {
        200: z.object({
          user: SantizedUserSchema.extend({
            encryptionVersion: z.number()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      const user = await server.services.user.getMe(req.permission.id);
      return { user };
    }
  });

  server.route({
    method: "GET",
    url: "/duplicate-accounts",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getDuplicateUserAccounts",
      response: {
        200: z.object({
          users: SantizedUserSchema.extend({
            isMyAccount: z.boolean(),
            organizations: z.object({ name: z.string(), slug: z.string() }).array()
          }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      if (req.auth.authMode === AuthMode.JWT && req.auth.user.email) {
        const users = await server.services.user.getAllMyAccounts(req.auth.user.email, req.permission.id);
        return { users };
      }
      return { users: [] };
    }
  });

  server.route({
    method: "POST",
    url: "/remove-duplicate-accounts",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "removeDuplicateUserAccounts",
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      if (req.auth.authMode === AuthMode.JWT && req.auth.user.email) {
        await server.services.user.removeMyDuplicateAccounts(req.auth.user.email, req.permission.id);
      }
      return { message: "Removed all duplicate accounts" };
    }
  });

  server.route({
    method: "GET",
    url: "/:userId/unlock",
    config: {
      rateLimit: authRateLimit
    },
    schema: {
      operationId: "unlockUser",
      querystring: z.object({
        token: z.string().trim()
      }),
      params: z.object({
        userId: z.string()
      })
    },
    handler: async (req, res) => {
      try {
        await server.services.user.unlockUser(req.params.userId, req.query.token);
      } catch (err) {
        logger.error(`User unlock failed for ${req.params.userId}`);
        logger.error(err);
      }
      return res.redirect(`${appCfg.SITE_URL}/login`);
    }
  });

  server.route({
    method: "GET",
    url: "/me/project-favorites",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getUserProjectFavorites",
      querystring: z.object({
        orgId: z.string().trim()
      }),
      response: {
        200: z.object({
          projectFavorites: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.user.getUserProjectFavorites(req.permission.id, req.query.orgId);
    }
  });

  server.route({
    method: "PUT",
    url: "/me/project-favorites",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateUserProjectFavorites",
      body: z.object({
        orgId: z.string().trim(),
        projectFavorites: z.string().array()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.user.updateUserProjectFavorites(
        req.permission.id,
        req.body.orgId,
        req.body.projectFavorites
      );
    }
  });

  server.route({
    method: "GET",
    url: "/me/:username/groups",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "listUserGroups",
      params: z.object({
        username: z.string().trim()
      }),
      response: {
        200: z
          .object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
            orgId: z.string()
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const groupMemberships = await server.services.user.listUserGroups({
        username: req.params.username,
        actorOrgId: req.permission.orgId,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type
      });

      return groupMemberships;
    }
  });

  server.route({
    method: "GET",
    url: "/me/totp",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getUserTotpConfig",
      response: {
        200: z.object({
          isVerified: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.totp.getUserTotpConfig({
        userId: req.permission.id
      });
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/totp",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteUserTotpConfig"
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.totp.deleteUserTotpConfig({
        userId: req.permission.id
      });
    }
  });

  server.route({
    method: "POST",
    url: "/me/totp/register",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "registerUserTotp",
      response: {
        200: z.object({
          otpUrl: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], {
      requireOrg: false
    }),
    handler: async (req) => {
      return server.services.totp.registerUserTotp({
        userId: req.permission.id
      });
    }
  });

  server.route({
    method: "POST",
    url: "/me/totp/verify",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "verifyUserTotpConfig",
      body: z.object({
        totp: z.string()
      }),
      response: {
        200: z.object({
          success: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], {
      requireOrg: false
    }),
    handler: async (req) => {
      return server.services.totp.verifyUserTotpConfig({
        userId: req.permission.id,
        totp: req.body.totp
      });
    }
  });

  server.route({
    method: "GET",
    url: "/me/mfa/recovery-codes",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getUserMfaRecoveryCodes",
      querystring: z.object({
        mfaSessionId: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          recoveryCodes: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      await ensureRecoveryCodeMfa(server, req.permission.id, req.query.mfaSessionId);
      const recoveryCodes = await server.services.mfaRecoveryCode.getRecoveryCodes({
        userId: req.permission.id
      });
      return { recoveryCodes };
    }
  });

  server.route({
    method: "POST",
    url: "/me/mfa/recovery-codes",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "regenerateUserMfaRecoveryCodes",
      body: z
        .object({
          mfaSessionId: z.string().trim().optional()
        })
        .optional(),
      response: {
        200: z.object({
          recoveryCodes: z.string().array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      await ensureRecoveryCodeMfa(server, req.permission.id, req.body?.mfaSessionId);
      const recoveryCodes = await server.services.mfaRecoveryCode.rotateRecoveryCodes({
        userId: req.permission.id
      });
      return { recoveryCodes };
    }
  });

  // WebAuthn/Passkey Routes
  server.route({
    method: "GET",
    url: "/me/webauthn",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "getUserWebAuthnCredentials",
      response: {
        200: z.object({
          credentials: z.array(
            z.object({
              id: z.string(),
              credentialId: z.string(),
              name: z.string().nullable().optional(),
              transports: z.array(z.string()).nullable().optional(),
              createdAt: z.date(),
              lastUsedAt: z.date().nullable().optional()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const credentials = await server.services.webAuthn.getUserWebAuthnCredentials({
        userId: req.permission.id
      });
      return { credentials };
    }
  });

  server.route({
    method: "POST",
    url: "/me/webauthn/register",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "generateWebAuthnRegistrationOptions",
      response: {
        200: z.any() // Returns PublicKeyCredentialCreationOptionsJSON from @simplewebauthn/server
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], {
      requireOrg: false
    }),
    handler: async (req) => {
      return server.services.webAuthn.generateRegistrationOptions({
        userId: req.permission.id
      });
    }
  });

  server.route({
    method: "POST",
    url: "/me/webauthn/register/verify",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "verifyWebAuthnRegistration",
      body: z.object({
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
      }),
      response: {
        200: z.object({
          credentialId: z.string(),
          name: z.string().nullable().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], {
      requireOrg: false
    }),
    handler: async (req) => {
      return server.services.webAuthn.verifyRegistrationResponse({
        userId: req.permission.id,
        registrationResponse: req.body.registrationResponse as RegistrationResponseJSON,
        name: req.body.name
      });
    }
  });

  server.route({
    method: "POST",
    url: "/me/webauthn/authenticate",
    config: {
      rateLimit: readLimit
    },
    schema: {
      operationId: "generateWebAuthnAuthenticationOptions",
      response: {
        200: z.any() // Returns PublicKeyCredentialRequestOptionsJSON from @simplewebauthn/server
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      return server.services.webAuthn.generateAuthenticationOptions({
        userId: req.permission.id
      });
    }
  });

  server.route({
    method: "POST",
    url: "/me/webauthn/authenticate/verify",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "verifyWebAuthnAuthentication",
      body: z.object({
        authenticationResponse: z
          .object({
            id: z.string(),
            rawId: z.string(),
            response: z
              .object({
                clientDataJSON: z.string(),
                authenticatorData: z.string(),
                signature: z.string()
              })
              .passthrough(),
            clientExtensionResults: z.record(z.unknown()).optional(),
            type: z.literal("public-key")
          })
          .passthrough()
      }),
      response: {
        200: z.object({
          verified: z.boolean(),
          credentialId: z.string(),
          sessionToken: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT], { requireOrg: false }),
    handler: async (req) => {
      return server.services.webAuthn.verifyAuthenticationResponse({
        userId: req.permission.id,
        authenticationResponse: req.body.authenticationResponse as AuthenticationResponseJSON
      });
    }
  });

  server.route({
    method: "PATCH",
    url: "/me/webauthn/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "updateWebAuthnCredential",
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        name: z.string().optional()
      }),
      response: {
        200: z.object({
          id: z.string(),
          credentialId: z.string(),
          name: z.string().nullable().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      return server.services.webAuthn.updateWebAuthnCredential({
        userId: req.permission.id,
        id: req.params.id,
        name: req.body.name
      });
    }
  });

  server.route({
    method: "DELETE",
    url: "/me/webauthn/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      operationId: "deleteWebAuthnCredential",
      params: z.object({
        id: z.string()
      }),
      response: {
        200: z.object({
          success: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.webAuthn.deleteWebAuthnCredential({
        userId: req.permission.id,
        id: req.params.id
      });
      return { success: true };
    }
  });
};
