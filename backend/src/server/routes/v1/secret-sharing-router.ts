import { z } from "zod";

import { SecretSharingSchema } from "@app/db/schemas";
import { SecretSharingAccessType } from "@app/lib/types";
import {
  publicEndpointLimit,
  publicSecretShareCreationLimit,
  readLimit,
  writeLimit
} from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

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
        id: z.string().uuid()
      }),
      body: z.object({
        hashedHex: z.string().min(1),
        password: z.string().optional()
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
              orgName: z.string().optional()
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
        orgId: req.permission?.orgId
      });

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
        encryptedValue: z.string(),
        password: z.string().optional(),
        hashedHex: z.string(),
        iv: z.string(),
        tag: z.string(),
        expiresAt: z.string(),
        expiresAfterViews: z.number().min(1).optional()
      }),
      response: {
        200: z.object({
          id: z.string().uuid()
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
        encryptedValue: z.string(),
        hashedHex: z.string(),
        iv: z.string(),
        tag: z.string(),
        expiresAt: z.string(),
        expiresAfterViews: z.number().min(1).optional(),
        accessType: z.nativeEnum(SecretSharingAccessType).default(SecretSharingAccessType.Organization)
      }),
      response: {
        200: z.object({
          id: z.string().uuid()
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
        sharedSecretId: z.string().uuid()
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
        sharedSecretId
      });

      return { ...deletedSharedSecret };
    }
  });
};
