/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
// All the any rules are disabled because passport typesense with fastify is really poor

import { Authenticator } from "@fastify/passport";
import fastifySession from "@fastify/session";
import { FastifyRequest } from "fastify";
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
    const { identityId } = req.body as {
      identityId: string;
    };

    process.nextTick(async () => {
      try {
        const { ldapConfig, opts } = await server.services.identityLdapAuth.getLdapConfig(identityId);
        req.ldapConfig = {
          ...ldapConfig,
          isActive: true,
          groupSearchBase: "",
          uniqueUserAttribute: "",
          groupSearchFilter: ""
        };

        done(null, opts);
      } catch (err) {
        logger.error(err, "Error in LDAP verification callback");
        done(err);
      }
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
      tags: [ApiDocsTags.LdapAuth],
      description: "Login with LDAP Auth",
      body: z.object({
        identityId: z.string().trim().describe(LDAP_AUTH.LOGIN.identityId),
        username: z.string().describe(LDAP_AUTH.LOGIN.username),
        password: z.string().describe(LDAP_AUTH.LOGIN.password)
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
    preValidation: passport.authenticate("ldapauth", {
      failWithError: true,
      session: false
    }) as any,

    errorHandler: (error) => {
      if (error.name === "AuthenticationError") {
        throw new UnauthorizedError({ message: "Invalid credentials" });
      }

      throw error;
    },

    handler: async (req) => {
      if (!req.passportMachineIdentity?.identityId) {
        throw new UnauthorizedError({ message: "Invalid request. Missing identity ID or LDAP entry details." });
      }

      const { identityId, user } = req.passportMachineIdentity;

      const { accessToken, identityLdapAuth, identityMembershipOrg } = await server.services.identityLdapAuth.login({
        identityId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identityMembershipOrg?.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_LDAP_AUTH,
          metadata: {
            identityId,
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
      tags: [ApiDocsTags.LdapAuth],
      description: "Attach LDAP Auth configuration onto identity",
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
              .describe(LDAP_AUTH.ATTACH.accessTokenNumUsesLimit)
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
              .describe(LDAP_AUTH.ATTACH.accessTokenNumUsesLimit)
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
            templateId: identityLdapAuth.templateId
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
      tags: [ApiDocsTags.LdapAuth],
      description: "Update LDAP Auth configuration on identity",
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
            .describe(LDAP_AUTH.UPDATE.accessTokenMaxTTL)
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
            templateId: identityLdapAuth.templateId
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
      tags: [ApiDocsTags.LdapAuth],
      description: "Retrieve LDAP Auth configuration on identity",
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
      tags: [ApiDocsTags.LdapAuth],
      description: "Delete LDAP Auth configuration on identity",
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
};
