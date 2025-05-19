import { z } from "zod";

import { SecretSharingSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { SecretSharingAccessType } from "@app/lib/types";
import {
  publicEndpointLimit,
  publicSecretShareCreationLimit,
  readLimit,
  writeLimit
} from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";
import { SecretSharingType } from "@app/services/secret-sharing/secret-sharing-types";

export const registerSecretSharingRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        offset: z.coerce.number().min(0).max(100).default(0),
        limit: z.coerce.number().min(1).max(100).default(25)
      }),
      response: {
        200: z.object({
          secrets: z.array(SecretSharingSchema),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secrets, totalCount } = await req.server.services.secretSharing.getSharedSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        type: SecretSharingType.Share,
        ...req.query
      });

      return {
        secrets,
        totalCount
      };
    }
  });

  server.route({
    method: "POST",
    url: "/public/:id",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      params: z.object({
        id: z.string()
      }),
      body: z.object({
        hashedHex: z.string().min(1).optional(),
        password: z.string().optional(),
        email: z.string().optional(),
        hash: z.string().optional()
      }),
      response: {
        200: z.object({
          isPasswordProtected: z.boolean(),
          secret: SecretSharingSchema.pick({
            encryptedValue: true,
            iv: true,
            tag: true,
            expiresAt: true,
            expiresAfterViews: true,
            accessType: true
          })
            .extend({
              orgName: z.string().optional(),
              secretValue: z.string().optional()
            })
            .optional()
        })
      }
    },
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.getSharedSecretById({
        sharedSecretId: req.params.id,
        hashedHex: req.body.hashedHex,
        password: req.body.password,
        orgId: req.permission?.orgId,
        email: req.body.email,
        hash: req.body.hash
      });

      if (sharedSecret.secret?.orgId) {
        await server.services.auditLog.createAuditLog({
          orgId: sharedSecret.secret.orgId,
          ...req.auditLogInfo,
          event: {
            type: EventType.READ_SHARED_SECRET,
            metadata: {
              id: req.params.id,
              name: sharedSecret.secret.name || undefined,
              accessType: sharedSecret.secret.accessType
            }
          }
        });
      }

      return sharedSecret;
    }
  });

  server.route({
    method: "POST",
    url: "/public",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        secretValue: z.string().max(10_000),
        password: z.string().optional(),
        expiresAt: z.string(),
        expiresAfterViews: z.number().min(1).optional()
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.createPublicSharedSecret({
        ...req.body,
        accessType: SecretSharingAccessType.Anyone
      });
      return { id: sharedSecret.id };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: publicSecretShareCreationLimit
    },
    schema: {
      body: z.object({
        name: z.string().max(50).optional(),
        password: z.string().optional(),
        secretValue: z.string(),
        expiresAt: z.string(),
        expiresAfterViews: z.number().min(1).optional(),
        accessType: z.nativeEnum(SecretSharingAccessType).default(SecretSharingAccessType.Organization),
        emails: z.string().email().array().max(100).optional()
      }),
      response: {
        200: z.object({
          id: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.createSharedSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_SHARED_SECRET,
          metadata: {
            accessType: req.body.accessType,
            expiresAt: req.body.expiresAt,
            expiresAfterViews: req.body.expiresAfterViews,
            name: req.body.name,
            id: sharedSecret.id,
            usingPassword: !!req.body.password
          }
        }
      });

      return { id: sharedSecret.id };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:sharedSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        sharedSecretId: z.string()
      }),
      response: {
        200: SecretSharingSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { sharedSecretId } = req.params;
      const deletedSharedSecret = await req.server.services.secretSharing.deleteSharedSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        sharedSecretId,
        type: SecretSharingType.Share
      });

      await server.services.auditLog.createAuditLog({
        orgId: req.permission.orgId,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_SHARED_SECRET,
          metadata: {
            id: sharedSecretId,
            name: deletedSharedSecret.name || undefined
          }
        }
      });

      return { ...deletedSharedSecret };
    }
  });
};
