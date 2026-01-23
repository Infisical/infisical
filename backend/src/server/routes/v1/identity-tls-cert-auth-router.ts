import { z } from "zod";

import { IdentityTlsCertAuthsSchema } from "@app/db/schemas/identity-tls-cert-auths";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, TLS_CERT_AUTH } from "@app/lib/api-docs";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";

const validateCommonNames = z
  .string()
  .min(1)
  .trim()
  .transform((el) =>
    el
      .split(",")
      .map((i) => i.trim())
      .join(",")
  );

const validateCaCertificate = (caCert: string) => {
  if (!caCert) return true;
  try {
    // eslint-disable-next-line no-new
    new crypto.nativeCrypto.X509Certificate(caCert);
    return true;
  } catch {
    return false;
  }
};

export const registerIdentityTlsCertAuthRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/login",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      operationId: "loginWithTlsCertAuth",
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Login with TLS Certificate Auth for machine identity",
      body: z.object({
        identityId: z.string().trim().describe(TLS_CERT_AUTH.LOGIN.identityId),
        subOrganizationName: slugSchema().optional().describe(TLS_CERT_AUTH.LOGIN.subOrganizationName)
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
    handler: async (req) => {
      const appCfg = getConfig();
      const clientCertificate = req.headers[appCfg.IDENTITY_TLS_CERT_AUTH_CLIENT_CERTIFICATE_HEADER_KEY];
      if (!clientCertificate) {
        throw new BadRequestError({ message: "Missing TLS certificate in header" });
      }

      const { identityTlsCertAuth, accessToken, identityAccessToken, identity } =
        await server.services.identityTlsCertAuth.login({
          ...req.body,
          clientCertificate: clientCertificate as string
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        orgId: identity.orgId,
        event: {
          type: EventType.LOGIN_IDENTITY_TLS_CERT_AUTH,
          metadata: {
            identityId: identityTlsCertAuth.identityId,
            identityAccessTokenId: identityAccessToken.id,
            identityTlsCertAuthId: identityTlsCertAuth.id
          }
        }
      });

      return {
        accessToken,
        tokenType: "Bearer" as const,
        expiresIn: identityTlsCertAuth.accessTokenTTL,
        accessTokenMaxTTL: identityTlsCertAuth.accessTokenMaxTTL
      };
    }
  });

  server.route({
    method: "POST",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "attachTlsCertAuth",
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Attach TLS Certificate Auth configuration onto machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().trim().describe(TLS_CERT_AUTH.ATTACH.identityId)
      }),
      body: z
        .object({
          allowedCommonNames: validateCommonNames
            .optional()
            .nullable()
            .describe(TLS_CERT_AUTH.ATTACH.allowedCommonNames),
          caCertificate: z
            .string()
            .min(1)
            .max(10240)
            .refine(validateCaCertificate, "Invalid CA Certificate.")
            .describe(TLS_CERT_AUTH.ATTACH.caCertificate),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .default([{ ipAddress: "0.0.0.0/0" }, { ipAddress: "::/0" }])
            .describe(TLS_CERT_AUTH.ATTACH.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .default(2592000)
            .describe(TLS_CERT_AUTH.ATTACH.accessTokenTTL),
          accessTokenMaxTTL: z
            .number()
            .int()
            .min(1)
            .max(315360000)
            .default(2592000)
            .describe(TLS_CERT_AUTH.ATTACH.accessTokenMaxTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .default(0)
            .describe(TLS_CERT_AUTH.ATTACH.accessTokenNumUsesLimit)
        })
        .refine(
          (val) => val.accessTokenTTL <= val.accessTokenMaxTTL,
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityTlsCertAuth: IdentityTlsCertAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityTlsCertAuth = await server.services.identityTlsCertAuth.attachTlsCertAuth({
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
          type: EventType.ADD_IDENTITY_TLS_CERT_AUTH,
          metadata: {
            identityId: identityTlsCertAuth.identityId,
            allowedCommonNames: identityTlsCertAuth.allowedCommonNames,
            accessTokenTTL: identityTlsCertAuth.accessTokenTTL,
            accessTokenMaxTTL: identityTlsCertAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityTlsCertAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityTlsCertAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityTlsCertAuth };
    }
  });

  server.route({
    method: "PATCH",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "updateTlsCertAuth",
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Update TLS Certificate Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(TLS_CERT_AUTH.UPDATE.identityId)
      }),
      body: z
        .object({
          caCertificate: z
            .string()
            .min(1)
            .max(10240)
            .refine(validateCaCertificate, "Invalid CA Certificate.")
            .optional()
            .describe(TLS_CERT_AUTH.UPDATE.caCertificate),
          allowedCommonNames: validateCommonNames
            .optional()
            .nullable()
            .describe(TLS_CERT_AUTH.UPDATE.allowedCommonNames),
          accessTokenTrustedIps: z
            .object({
              ipAddress: z.string().trim()
            })
            .array()
            .min(1)
            .optional()
            .describe(TLS_CERT_AUTH.UPDATE.accessTokenTrustedIps),
          accessTokenTTL: z
            .number()
            .int()
            .min(0)
            .max(315360000)
            .optional()
            .describe(TLS_CERT_AUTH.UPDATE.accessTokenTTL),
          accessTokenNumUsesLimit: z
            .number()
            .int()
            .min(0)
            .optional()
            .describe(TLS_CERT_AUTH.UPDATE.accessTokenNumUsesLimit),
          accessTokenMaxTTL: z
            .number()
            .int()
            .max(315360000)
            .min(0)
            .optional()
            .describe(TLS_CERT_AUTH.UPDATE.accessTokenMaxTTL)
        })
        .refine(
          (val) => (val.accessTokenMaxTTL && val.accessTokenTTL ? val.accessTokenTTL <= val.accessTokenMaxTTL : true),
          "Access Token TTL cannot be greater than Access Token Max TTL."
        ),
      response: {
        200: z.object({
          identityTlsCertAuth: IdentityTlsCertAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityTlsCertAuth = await server.services.identityTlsCertAuth.updateTlsCertAuth({
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
          type: EventType.UPDATE_IDENTITY_TLS_CERT_AUTH,
          metadata: {
            identityId: identityTlsCertAuth.identityId,
            allowedCommonNames: identityTlsCertAuth.allowedCommonNames,
            accessTokenTTL: identityTlsCertAuth.accessTokenTTL,
            accessTokenMaxTTL: identityTlsCertAuth.accessTokenMaxTTL,
            accessTokenTrustedIps: identityTlsCertAuth.accessTokenTrustedIps as TIdentityTrustedIp[],
            accessTokenNumUsesLimit: identityTlsCertAuth.accessTokenNumUsesLimit
          }
        }
      });

      return { identityTlsCertAuth };
    }
  });

  server.route({
    method: "GET",
    url: "/identities/:identityId",
    config: {
      rateLimit: readLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "getTlsCertAuth",
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Retrieve TLS Certificate Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(TLS_CERT_AUTH.RETRIEVE.identityId)
      }),
      response: {
        200: z.object({
          identityTlsCertAuth: IdentityTlsCertAuthsSchema.extend({
            caCertificate: z.string()
          })
        })
      }
    },
    handler: async (req) => {
      const identityTlsCertAuth = await server.services.identityTlsCertAuth.getTlsCertAuth({
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
          type: EventType.GET_IDENTITY_TLS_CERT_AUTH,
          metadata: {
            identityId: identityTlsCertAuth.identityId
          }
        }
      });
      return { identityTlsCertAuth };
    }
  });

  server.route({
    method: "DELETE",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      operationId: "deleteTlsCertAuth",
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Delete TLS Certificate Auth configuration on machine identity",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        identityId: z.string().describe(TLS_CERT_AUTH.REVOKE.identityId)
      }),
      response: {
        200: z.object({
          identityTlsCertAuth: IdentityTlsCertAuthsSchema
        })
      }
    },
    handler: async (req) => {
      const identityTlsCertAuth = await server.services.identityTlsCertAuth.revokeTlsCertAuth({
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
          type: EventType.REVOKE_IDENTITY_TLS_CERT_AUTH,
          metadata: {
            identityId: identityTlsCertAuth.identityId
          }
        }
      });

      return { identityTlsCertAuth };
    }
  });
};
