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
      response: {
        200: z.array(SecretSharingSchema)
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const sharedSecrets = await req.server.services.secretSharing.getSharedSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return sharedSecrets;
    }
  });

  server.route({
    method: "GET",
    url: "/public/:id",
    config: {
      rateLimit: publicEndpointLimit
    },
    schema: {
      params: z.object({
        id: z.string().uuid()
      }),
      querystring: z.object({
        hashedHex: z.string()
      }),
      response: {
        200: SecretSharingSchema.pick({
          encryptedValue: true,
          iv: true,
          tag: true,
          expiresAt: true,
          expiresAfterViews: true,
          accessType: true
        }).extend({
          orgName: z.string().optional()
        })
      }
    },
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.getActiveSharedSecretByIdAndHashedHex(
        req.params.id,
        req.query.hashedHex,
        req.permission?.orgId
      );
      if (!sharedSecret) return undefined;
      return {
        encryptedValue: sharedSecret.encryptedValue,
        iv: sharedSecret.iv,
        tag: sharedSecret.tag,
        expiresAt: sharedSecret.expiresAt,
        expiresAfterViews: sharedSecret.expiresAfterViews,
        accessType: sharedSecret.accessType,
        orgName: sharedSecret.orgName
      };
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
        iv: z.string(),
        tag: z.string(),
        hashedHex: z.string(),
        expiresAt: z.string(),
        expiresAfterViews: z.number()
      }),
      response: {
        200: z.object({
          id: z.string().uuid()
        })
      }
    },
    handler: async (req) => {
      const { encryptedValue, iv, tag, hashedHex, expiresAt, expiresAfterViews } = req.body;
      const sharedSecret = await req.server.services.secretSharing.createPublicSharedSecret({
        encryptedValue,
        iv,
        tag,
        hashedHex,
        expiresAt: new Date(expiresAt),
        expiresAfterViews,
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
        encryptedValue: z.string(),
        iv: z.string(),
        tag: z.string(),
        hashedHex: z.string(),
        expiresAt: z.string(),
        expiresAfterViews: z.number(),
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
      const { encryptedValue, iv, tag, hashedHex, expiresAt, expiresAfterViews } = req.body;
      const sharedSecret = await req.server.services.secretSharing.createSharedSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        orgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        encryptedValue,
        iv,
        tag,
        hashedHex,
        expiresAt: new Date(expiresAt),
        expiresAfterViews,
        accessType: req.body.accessType
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
