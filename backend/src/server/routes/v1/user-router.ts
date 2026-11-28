import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { z } from "zod";

import { UsersSchema } from "@app/db/schemas";
import { AuthMode, MfaMethod } from "@app/lib/auth/actor-types";
import { getConfig } from "@app/lib/config/env";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { authRateLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";

import {
  ensureFactorEnrollmentStepUpMfa,
  ensureStepUpMfa,
  getStepUpSessionId,
  MfaStepUpResource
} from "../mfa-step-up-fns";

const SantizedUserSchema = UsersSchema.omit({
  hashedPassword: true
});

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
      const user = await server.services.user.getMe(req.actor.id);
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
        const users = await server.services.user.getAllMyAccounts(req.auth.user.email, req.actor.id);
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
        await server.services.user.removeMyDuplicateAccounts(req.auth.user.email, req.actor.id);
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
      return server.services.user.getUserProjectFavorites(req.actor.id, req.query.orgId);
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
      return server.services.user.updateUserProjectFavorites(req.actor.id, req.body.orgId, req.body.projectFavorites);
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
        actor: req.actor
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
        userId: req.actor.id
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
      operationId: "deleteUserTotpConfig",
      querystring: z.object({
        mfaSessionId: z.string().trim().optional()
      })
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await server.services.user.assertMfaFactorRemovable(req.actor.id, MfaMethod.TOTP);
      await ensureStepUpMfa(server, {
        userId: req.actor.id,
        orgId: req.actor.orgId,
        tokenVersionId: getStepUpSessionId(req),
        resourceId: MfaStepUpResource.MfaManagement,
        mfaSessionId: req.query.mfaSessionId,
        message: "MFA verification is required to remove your authenticator app",
        excludeMfaMethod: MfaMethod.TOTP
      });
      return server.services.totp.deleteUserTotpConfig({
        userId: req.actor.id
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
      await ensureFactorEnrollmentStepUpMfa(server, {
        userId: req.actor.id,
        tokenVersionId: getStepUpSessionId(req)
      });
      return server.services.totp.registerUserTotp({
        userId: req.actor.id
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
      await ensureFactorEnrollmentStepUpMfa(server, {
        userId: req.actor.id,
        tokenVersionId: getStepUpSessionId(req)
      });
      return server.services.totp.verifyUserTotpConfig({
        userId: req.actor.id,
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await ensureStepUpMfa(server, {
        userId: req.actor.id,
        orgId: req.actor.orgId,
        tokenVersionId: getStepUpSessionId(req),
        resourceId: MfaStepUpResource.MfaManagement,
        mfaSessionId: req.query.mfaSessionId,
        message: "MFA verification is required to access recovery codes"
      });
      const recoveryCodes = await server.services.mfaRecoveryCode.getRecoveryCodes({
        userId: req.actor.id
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
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      await ensureStepUpMfa(server, {
        userId: req.actor.id,
        orgId: req.actor.orgId,
        tokenVersionId: getStepUpSessionId(req),
        resourceId: MfaStepUpResource.MfaManagement,
        mfaSessionId: req.body?.mfaSessionId,
        message: "MFA verification is required to access recovery codes"
      });
      const recoveryCodes = await server.services.mfaRecoveryCode.rotateRecoveryCodes({
        userId: req.actor.id
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
          fipsEnabled: z.boolean(),
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
      return server.services.webAuthn.getUserWebAuthnCredentials({
        userId: req.actor.id
      });
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
      await ensureFactorEnrollmentStepUpMfa(server, {
        userId: req.actor.id,
        tokenVersionId: getStepUpSessionId(req)
      });
      return server.services.webAuthn.generateRegistrationOptions({
        userId: req.actor.id
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
      await ensureFactorEnrollmentStepUpMfa(server, {
        userId: req.actor.id,
        tokenVersionId: getStepUpSessionId(req)
      });
      return server.services.webAuthn.verifyRegistrationResponse({
        userId: req.actor.id,
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
        userId: req.actor.id
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
        userId: req.actor.id,
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
        userId: req.actor.id,
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
        id: z.string().uuid()
      }),
      querystring: z.object({
        mfaSessionId: z.string().trim().optional()
      }),
      response: {
        200: z.object({
          success: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { credentials } = await server.services.webAuthn.getUserWebAuthnCredentials({
        userId: req.actor.id
      });
      const credential = credentials.find((cred) => cred.id.toLowerCase() === req.params.id.toLowerCase());
      if (!credential) {
        throw new NotFoundError({ message: "Credential not found" });
      }
      const isRemovingLastPasskey = credentials.length === 1;
      if (isRemovingLastPasskey) {
        await server.services.user.assertMfaFactorRemovable(req.actor.id, MfaMethod.WEBAUTHN);
      }

      await ensureStepUpMfa(server, {
        userId: req.actor.id,
        orgId: req.actor.orgId,
        tokenVersionId: getStepUpSessionId(req),
        resourceId: MfaStepUpResource.MfaManagement,
        mfaSessionId: req.query.mfaSessionId,
        message: "MFA verification is required to remove a passkey",
        excludeMfaMethod: isRemovingLastPasskey ? MfaMethod.WEBAUTHN : undefined
      });
      await server.services.webAuthn.deleteWebAuthnCredential({
        userId: req.actor.id,
        id: credential.id
      });
      return { success: true };
    }
  });
};
