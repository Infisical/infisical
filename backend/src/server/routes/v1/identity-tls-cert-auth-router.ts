import { z } from "zod";

// import { TLSSocket } from "tls";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { ApiDocsTags, TLS_CERT_AUTH } from "@app/lib/api-docs";
import { IdentityTlsCertAuthsSchema } from "@app/db/schemas";
import { isSuperAdmin } from "@app/services/super-admin/super-admin-fns";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { TIdentityTrustedIp } from "@app/services/identity/identity-types";

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

export const registerIdentityTlsCertAuthRouter = async (server: FastifyZodProvider) => {
  // server.route({
  //   method: "GET",
  //   url: "/",
  //   config: {
  //     rateLimit: readLimit
  //   },
  //   schema: {
  //     params: z.object({}),
  //     response: {
  //       200: z.object({})
  //     }
  //   },
  //   onRequest: verifyAuth([AuthMode.JWT]),
  //   handler: async (req) => {
  //     const { socket } = req;
  //     if (socket instanceof TLSSocket && socket.encrypted) {
  //       // Inside this block, TypeScript now knows `socket` is a TlsSocket
  //       const certificate = socket.getPeerCertificate();
  //
  //       if (Object.keys(certificate).length === 0) {
  //         return reply.send({ message: "Client did not provide a certificate." });
  //       }
  //
  //       return reply.send({
  //         message: "Certificate received!",
  //         subject: certificate.subject,
  //         issuer: certificate.issuer,
  //         fingerprint: certificate.fingerprint
  //       });
  //     } else {
  //       // This will handle plain HTTP requests gracefully
  //       return reply
  //         .status(400)
  //         .send({ error: "This endpoint requires an HTTPS connection with a client certificate." });
  //     }
  //   }
  // });

  server.route({
    method: "POST",
    url: "/identities/:identityId",
    config: {
      rateLimit: writeLimit
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    schema: {
      hide: false,
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Attach TLS Certificate Auth configuration onto identity",
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
          allowedCommonNames: validateCommonNames.describe(TLS_CERT_AUTH.ATTACH.allowedCommonNames),
          caCertificate: z.string().min(1).describe(TLS_CERT_AUTH.ATTACH.caCertificate),
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
          identityTlsCloudAuth: IdentityTlsCertAuthsSchema
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
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Update Tls Certificate Auth configuration on identity",
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
          allowedCommonNames: validateCommonNames.describe(TLS_CERT_AUTH.UPDATE.allowedCommonNames),
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
          identityTlsCloudAuth: IdentityTlsCertAuthsSchema
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
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Retrieve Tls Certificate Auth configuration on identity",
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
          identityTlsCloudAuth: IdentityTlsCertAuthsSchema.extend({
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
      tags: [ApiDocsTags.TlsCertAuth],
      description: "Delete Tls Certificate Auth configuration on identity",
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
          identityTlsCloudAuth: IdentityTlsCertAuthsSchema
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
