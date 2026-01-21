/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
import { FastifyReply, FastifyRequest } from "fastify";
import { IncomingMessage } from "http";
import LdapStrategy from "passport-ldapauth";
import { z } from "zod";

import { IdentityLdapAuthsSchema } from "@app/db/schemas/identity-ldap-auths";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { isValidLdapFilter } from "@app/ee/services/ldap-config/ldap-fns";
import { ApiDocsTags, LDAP_AUTH } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { AllowedFieldsSchema } from "@app/services/identity-ldap-auth/identity-ldap-auth-types";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

export const registerIdentityLdapAuthRouter = async (server: FastifyZodProvider) => {
  const appCfg = getConfig();
  const passport = new Authenticator({ key: "ldap-identity-auth", userProperty: "passportMachineIdentity" });
  await server.register(fastifySession, { secret: appCfg.COOKIE_SECRET_SIGN_KEY });
  await server.register(passport.initialize());
  await server.register(passport.secureSession());

  const getLdapPassportOpts = (req: FastifyRequest, done: any) => {
    const { ldapConfig } = req;

    if (!ldapConfig) {
      return done(new UnauthorizedError({ message: "LDAP configuration not found" }));
    }

    const opts = {
      server: {
        url: ldapConfig.url,
        bindDN: ldapConfig.bindDN,
        bindCredentials: ldapConfig.bindPass,
        searchBase: ldapConfig.searchBase,
        searchFilter: ldapConfig.searchFilter,
        ...(ldapConfig.caCert
          ? {
              tlsOptions: {
                ca: [ldapConfig.caCert]
              }
            }
          : {})
      },
      passReqToCallback: true
    };

    return done(null, opts);
  };

  // Promise-based wrapper for passport authentication
  type TPassportUser = { identityId: string; user: { uid: string; mail?: string } };
  const authenticateWithPassport = (req: FastifyRequest, res: FastifyReply): Promise<TPassportUser> => {
    return new Promise((resolve, reject) => {
      const authMiddleware = passport.authenticate(
        "ldapauth",
        { session: false },
        // @fastify/passport callback signature: (req, res, err, user)
        ((_req: FastifyRequest, _res: FastifyReply, err: Error | null, user: TPassportUser | false) => {
          if (err) {
            return reject(err);
          }
          if (!user) {
            return reject(new UnauthorizedError({ message: "LDAP authentication failed" }));
          }
          return resolve(user);
        }) as any
      );

      (authMiddleware as any)(req, res);
    });
  };

  passport.use(
    new LdapStrategy(
      getLdapPassportOpts as any,
      // eslint-disable-next-line
      async (req: IncomingMessage, user, cb) => {
        try {
          const requestBody = (req as unknown as FastifyRequest).body as {
            username: string;
            password: string;
            identityId: string;
          };

          if (!requestBody.username || !requestBody.password) {
            return cb(new UnauthorizedError({ message: "Invalid request. Missing username or password." }), false);
          }

          if (!requestBody.identityId) {
            return cb(new UnauthorizedError({ message: "Invalid request. Missing identity ID." }), false);
          }

          const { ldapConfig } = req as unknown as FastifyRequest;

          if (ldapConfig.allowedFields) {
            for (const field of ldapConfig.allowedFields) {
              if (!user[field.key]) {
                return cb(
                  new UnauthorizedError({ message: `Invalid request. Missing field ${field.key} on user.` }),
                  false
                );
              }

              const value = field.value.split(",");

              if (!value.includes(user[field.key])) {
                return cb(
                  new UnauthorizedError({
                    message: `Invalid request. User field '${field.key}' does not match required fields.`
                  }),
                  false
                );
              }
            }
          }

          return cb(null, { identityId: requestBody.identityId, user });
        } catch (error) {
          logger.error(error, "Error in LDAP verification callback");
          return cb(error, false);
        }
      }
    )
  );

  server.route({
    method: "POST",
    url: "/ldap-auth/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "loginWithLdapAuth",
      tags: [ApiDocsTags.LdapAuth],
      description: "Login with LDAP Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().uuid("Identity ID must be a valid UUID").describe(LDAP_AUTH.LOGIN.identityId),
        username: z.string().trim().nonempty("Username is required").describe(LDAP_AUTH.LOGIN.username),
        password: z.string().trim().nonempty("Password is required").describe(LDAP_AUTH.LOGIN.password),
        subOrganizationName: slugSchema().optional().describe(LDAP_AUTH.LOGIN.subOrganizationName)
      }),
      response: {
        200: z.object({
          accessToken: z.string(),
          expiresIn: z.coerce.number(),
          accessTokenMaxTTL: z.coerce.number(),
          tokenType: z.literal("Bearer")
        })
      }
    },
    handler: async (req, res) => {
      const { identityId, username } = req.body;

      // Load LDAP config and attach to request for passport strategy
      const { ldapConfig } = await server.services.identityLdapAuth.getLdapConfig(identityId);
      req.ldapConfig = {
        ...ldapConfig,
        isActive: true,
        groupSearchBase: "",
        uniqueUserAttribute: "",
        groupSearchFilter: ""
      };

      // Authenticate with passport, wrapped in lockout protection
      const { identityId: authIdentityId, user } = await server.services.identityLdapAuth.withLdapLockout(
        { identityId, username },
        () => authenticateWithPassport(req, res)
      );

      const { accessToken, identityLdapAuth, identity } = await server.services.identityLdapAuth.login({
        identityId: authIdentityId,
        subOrganizationName: req.body.subOrganizationName
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_LDAP_AUTH,
          metadata: {
            identityId: authIdentityId,
            ldapEmail: user.mail,
            ldapUsername: user.uid
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityLdapAuth.accessTokenTTL,
        accessTokenMaxTTL: identityLdapAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/ldap-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "attachLdapAuth",
      tags: [ApiDocsTags.LdapAuth],
      description: "Attach LDAP Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(LDAP_AUTH.ATTACH.identityId)
      }),
      body: z.union([
        // Template-based configuration
        z
          .object({
            templateId: z.string().trim().describe(LDAP_AUTH.ATTACH.templateId),
            searchFilter: z
              .string()
              .trim()
              .min(1)
              .default("(uid={{username}})")
              .refine(isValidLdapFilter, "Invalid LDAP search filter")
              .describe(LDAP_AUTH.ATTACH.searchFilter),
            allowedFields: AllowedFieldsSchema.array().optional().describe(LDAP_AUTH.ATTACH.allowedFields),
            ldapCaCertificate: z.string().trim().optional().describe(LDAP_AUTH.ATTACH.ldapCaCertificate),
            accessTokenTrustedIps: z
              .object({
                ipAddress: z.string().trim()
              })
              .array()
              .min(1)
              .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
              .describe(LDAP_AUTH.ATTACH.accessTokenTrustedIps),
            accessTokenTTL: z
              .number()
              .int()
              .min(0)
              .max(315360000)
              .default(2592000)
              .describe(LDAP_AUTH.ATTACH.accessTokenTTL),
            accessTokenMaxTTL: z
              .number()
              .int()
              .min(1)
              .max(315360000)
              .default(2592000)
              .describe(LDAP_AUTH.ATTACH.accessTokenMaxTTL),
            accessTokenNumUsesLimit: z
              .number()
              .int()
              .min(0)
              .default(0)
              .describe(LDAP_AUTH.ATTACH.accessTokenNumUsesLimit),
            lockoutEnabled: z.boolean().default(true).describe(LDAP_AUTH.ATTACH.lockoutEnabled),
            lockoutThreshold: z.number().min(1).max(30).default(3).describe(LDAP_AUTH.ATTACH.lockoutThreshold),
            lockoutDurationSeconds: z
              .number()
              .min(30)
              .max(86400)
              .default(300)
              .describe(LDAP_AUTH.ATTACH.lockoutDurationSeconds),
            lockoutCounterResetSeconds: z
              .number()
              .min(5)
              .max(3600)
              .default(30)
              .describe(LDAP_AUTH.ATTACH.lockoutCounterResetSeconds)
          })
          .refine(
            (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
            "Access Token TTL cannot be greater than Access Token Max TTL."
          ),

        // Manual configuration
        z
          .object({
            url: z.string().trim().describe(LDAP_AUTH.ATTACH.url),
            bindDN: z.string().trim().describe(LDAP_AUTH.ATTACH.bindDN),
            bindPass: z.string().trim().describe(LDAP_AUTH.ATTACH.bindPass),
            searchBase: z.string().trim().describe(LDAP_AUTH.ATTACH.searchBase),
            searchFilter: z
              .string()
              .trim()
              .min(1)
              .default("(uid={{username}})")
              .refine(isValidLdapFilter, "Invalid LDAP search filter")
              .describe(LDAP_AUTH.ATTACH.searchFilter),
            allowedFields: AllowedFieldsSchema.array().optional().describe(LDAP_AUTH.ATTACH.allowedFields),
            ldapCaCertificate: z.string().trim().optional().describe(LDAP_AUTH.ATTACH.ldapCaCertificate),
            accessTokenTrustedIps: z
              .object({
                ipAddress: z.string().trim()
              })
              .array()
              .min(1)
              .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
              .describe(LDAP_AUTH.ATTACH.accessTokenTrustedIps),
            accessTokenTTL: z
              .number()
              .int()
              .min(0)
              .max(315360000)
              .default(2592000)
              .describe(LDAP_AUTH.ATTACH.accessTokenTTL),
            accessTokenMaxTTL: z
              .number()
              .int()
              .min(1)
              .max(315360000)
              .default(2592000)
              .describe(LDAP_AUTH.ATTACH.accessTokenMaxTTL),
            accessTokenNumUsesLimit: z
              .number()
              .int()
              .min(0)
              .default(0)
              .describe(LDAP_AUTH.ATTACH.accessTokenNumUsesLimit),
            lockoutEnabled: z.boolean().default(true).describe(LDAP_AUTH.ATTACH.lockoutEnabled),
            lockoutThreshold: z.number().min(1).max(30).default(3).describe(LDAP_AUTH.ATTACH.lockoutThreshold),
            lockoutDurationSeconds: z
              .number()
              .min(30)
              .max(86400)
              .default(300)
              .describe(LDAP_AUTH.ATTACH.lockoutDurationSeconds),
            lockoutCounterResetSeconds: z
              .number()
              .min(5)
              .max(3600)
              .default(30)
              .describe(LDAP_AUTH.ATTACH.lockoutCounterResetSeconds)
          })
          .refine(
            (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
            "Access Token TTL cannot be greater than Access Token Max TTL."
          )
      ]),
      response: {
        200: z.object({
          identityLdapAuth: IdentityLdapAuthsSchema.omit({
            encryptedBindDN: true,
            encryptedBindPass: true,
            encryptedLdapCaCertificate: true
          })
        })
      }
    },
    handler: async (req) => {
      const identityLdapAuth = await server.services.identityLdapAuth.attachLdapAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId,
        isActorSuperAdmin: isSuperAdmin(req.auth)
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.ADD_IDENTITY_LDAP_AUTH,
          metadata: {
            identityId: req.params.identityId,
            url: identityLdapAuth.url,
            accessTokenMaxTTL: identityLdapAuth.accessTokenMaxTTL,
            accessTokenTTL: identityLdapAuth.accessTokenTTL,
            accessTokenNumUsesLimit: identityLdapAuth.accessTokenNumUsesLimit,
            allowedFields: req.body.allowedFields,
            templateId: identityLdapAuth.templateId,
            lockoutEnabled: identityLdapAuth.lockoutEnabled,
            lockoutThreshold: identityLdapAuth.lockoutThreshold,
            lockoutDurationSeconds: identityLdapAuth.lockoutDurationSeconds,
            lockoutCounterResetSeconds: identityLdapAuth.lockoutCounterResetSeconds
          }
        }
      });

      return { identityLdapAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/ldap-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateLdapAuth",
      tags: [ApiDocsTags.LdapAuth],
      description: "Update LDAP Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(LDAP_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          url: z.string().trim().min(1).optional().describe(LDAP_AUTH.UPDATE.url),
          bindDN: z.string().trim().min(1).optional().describe(LDAP_AUTH.UPDATE.bindDN),
          bindPass: z.string().trim().min(1).optional().describe(LDAP_AUTH.UPDATE.bindPass),
          searchBase: z.string().trim().min(1).optional().describe(LDAP_AUTH.UPDATE.searchBase),
          templateId: z.string().trim().optional().describe(LDAP_AUTH.UPDATE.templateId),
          searchFilter: z
            .string()
            .trim()
            .min(1)
            .optional()
            .refine((v) => v === undefined || isValidLdapFilter(v), "Invalid LDAP search filter")
            .describe(LDAP_AUTH.UPDATE.searchFilter),
          allowedFields: AllowedFieldsSchema.array().optional().describe(LDAP_AUTH.UPDATE.allowedFields),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(LDAP_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z.number().int().min(0).max(315360000).optional().describe(LDAP_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(LDAP_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .max(315360000)
            .min(0)
            .optional()
            .describe(LDAP_AUTH.UPDATE.accessTokenMaxTTL),
          lockoutEnabled: z.boolean().optional().describe(LDAP_AUTH.UPDATE.lockoutEnabled),
          lockoutThreshold: z.number().min(1).max(30).optional().describe(LDAP_AUTH.UPDATE.lockoutThreshold),
          lockoutDurationSeconds: z
            .number()
            .min(30)
            .max(86400)
            .optional()
            .describe(LDAP_AUTH.UPDATE.lockoutDurationSeconds),
          lockoutCounterResetSeconds: z
            .number()
            .min(5)
            .max(3600)
            .optional()
            .describe(LDAP_AUTH.UPDATE.lockoutCounterResetSeconds)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityLdapAuth: IdentityLdapAuthsSchema.omit({
            encryptedBindDN: true,
            encryptedBindPass: true,
            encryptedLdapCaCertificate: true
          })
        })
      }
    },
    handler: async (req) => {
      const identityLdapAuth = await server.services.identityLdapAuth.updateLdapAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.UPDATE_IDENTITY_LDAP_AUTH,
          metadata: {
            identityId: req.params.identityId,
            url: identityLdapAuth.url,
            accessTokenMaxTTL: identityLdapAuth.accessTokenMaxTTL,
            accessTokenTTL: identityLdapAuth.accessTokenTTL,
            accessTokenNumUsesLimit: identityLdapAuth.accessTokenNumUsesLimit,
            accessTokenTrustedIps: identityLdapAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            allowedFields: req.body.allowedFields,
            templateId: identityLdapAuth.templateId,
            lockoutEnabled: identityLdapAuth.lockoutEnabled,
            lockoutThreshold: identityLdapAuth.lockoutThreshold,
            lockoutDurationSeconds: identityLdapAuth.lockoutDurationSeconds,
            lockoutCounterResetSeconds: identityLdapAuth.lockoutCounterResetSeconds
          }
        }
      });

      return { identityLdapAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/ldap-auth/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getLdapAuth",
      tags: [ApiDocsTags.LdapAuth],
      description: "Retrieve LDAP Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(LDAP_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityLdapAuth: IdentityLdapAuthsSchema.omit({
            encryptedBindDN: true,
            encryptedBindPass: true,
            encryptedLdapCaCertificate: true
          }).extend({
            bindDN: z.string(),
            bindPass: z.string(),
            ldapCaCertificate: z.string().optional(),
            templateId: z.string().optional().nullable()
          })
        })
      }
    },
    handler: async (req) => {
      const identityLdapAuth = await server.services.identityLdapAuth.getLdapAuth({
        identityId: req.params.identityId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.GET_IDENTITY_LDAP_AUTH,
          metadata: {
            identityId: identityLdapAuth.identityId
          }
        }
      });

      return { identityLdapAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/ldap-auth/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteLdapAuth",
      tags: [ApiDocsTags.LdapAuth],
      description: "Delete LDAP Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(LDAP_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityLdapAuth: IdentityLdapAuthsSchema.omit({
            encryptedBindDN: true,
            encryptedBindPass: true,
            encryptedLdapCaCertificate: true
          })
        })
      }
    },
    handler: async (req) => {
      const identityLdapAuth = await server.services.identityLdapAuth.revokeIdentityLdapAuth({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: req.permission.orgId,
        event: {
          type: EventType.REVOKE_IDENTITY_LDAP_AUTH,
          metadata: {
            identityId: identityLdapAuth.identityId
          }
        }
      });

      return { identityLdapAuth };
    }
  });

  server.route({
    method: "POST",
    url: "/ldap-auth/identities/:identityId/clear-lockouts",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "clearLdapAuthLockouts",
      tags: [ApiDocsTags.LdapAuth],
      description: "Clear LDAP Auth Lockouts for machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(LDAP_AUTH.CLEAR_CLIENT_LOCKOUTS.identityId)
      }),
      response: {
        200: z.object({
          deleted: z.number()
        })
      }
    },
    handler: async (req) => {
      const clearLockoutsData = await server.services.identityLdapAuth.clearLdapAuthLockouts({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        identityId: req.params.identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: clearLockoutsData.orgId,
        event: {
          type: EventType.CLEAR_IDENTITY_LDAP_AUTH_LOCKOUTS,
          metadata: {
            identityId: clearLockoutsData.identityId
          }
        }
      });

      return clearLockoutsData;
    }
  });
};
