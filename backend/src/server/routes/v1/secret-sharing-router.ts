import { z } from "zod";

import { SecretSharingSchema } from "@app/db/schemas";
import { publicEndpointLimit, readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretSharingRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/:projectId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().uuid()
      }),
      response: {
        200: z.array(SecretSharingSchema)
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.params;
      const sharedSecrets = await req.server.services.secretSharing.getSharedSecrets({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId,
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
      response: {
        200: SecretSharingSchema.pick({ name: true, signedValue: true, expiresAt: true })
      }
    },
    handler: async (req) => {
      const sharedSecret = await req.server.services.secretSharing.getActiveSharedSecretById(req.params.id);
      if (!sharedSecret) return undefined;
      return {
        name: sharedSecret.name,
        signedValue: sharedSecret.signedValue,
        expiresAt: sharedSecret.expiresAt
      };
    }
  });

  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        name: z.string(),
        signedValue: z.string(),
        expiresAt: z.string().refine((date) => new Date(date) > new Date(), {
          message: "Expires at should be a future date"
        }),
        workspaceId: z.string().uuid()
      }),
      response: {
        200: z.object({
          id: z.string().uuid()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { name, signedValue, expiresAt, workspaceId } = req.body;
      const sharedSecret = await req.server.services.secretSharing.createSharedSecret({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId: workspaceId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name,
        signedValue,
        expiresAt: new Date(expiresAt)
      });
      return { id: sharedSecret.id };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:projectId/:sharedSecretId",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        projectId: z.string().uuid(),
        sharedSecretId: z.string().uuid()
      }),
      response: {
        200: SecretSharingSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, sharedSecretId } = req.params;
      const deletedSharedSecret = await req.server.services.secretSharing.deleteSharedSecretById({
        actor: req.permission.type,
        actorId: req.permission.id,
        projectId,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        sharedSecretId
      });

      return { ...deletedSharedSecret };
    }
  });
};
