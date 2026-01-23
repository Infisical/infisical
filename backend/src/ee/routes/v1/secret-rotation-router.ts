import { z } from "zod";

import { SecretRotationOutputsSchema } from "@app/db/schemas/secret-rotation-outputs";
import { SecretRotationsSchema } from "@app/db/schemas/secret-rotations";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretRotationRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        secretPath: z.string().trim().transform(removeTrailingSlash),
        environment: z.string().trim(),
        interval: z.number().min(1),
        provider: z.string().trim(),
        customProvider: z.string().trim().optional(),
        inputs: z.record(z.unknown()),
        outputs: z.record(z.string())
      }),
      response: {
        200: z.object({
          secretRotation: SecretRotationsSchema.merge(
            z.object({
              environment: z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string()
              }),
              outputs: SecretRotationOutputsSchema.array()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretRotation = await server.services.secretRotation.createRotation({
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorId: req.permission.id,
        actorOrgId: req.permission.orgId,
        ...req.body,
        projectId: req.body.workspaceId
      });
      return { secretRotation };
    }
  });

  server.route({
    url: "/restart",
    method: "POST",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      body: z.object({
        id: z.string().trim()
      }),
      response: {
        200: z.object({
          secretRotation: SecretRotationsSchema.merge(
            z.object({
              environment: z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string()
              })
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretRotation = await server.services.secretRotation.restartById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        rotationId: req.body.id
      });
      return { secretRotation };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim()
      }),
      response: {
        200: z.object({
          secretRotations: SecretRotationsSchema.merge(
            z.object({
              environment: z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string()
              }),
              outputs: z
                .object({
                  key: z.string(),
                  secret: z.object({
                    secretKey: z.string(),
                    id: z.string(),
                    version: z.number()
                  })
                })
                .array()
            })
          ).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretRotations = await server.services.secretRotation.getByProjectId({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId: req.query.workspaceId
      });
      return { secretRotations };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:id",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      params: z.object({
        id: z.string().trim()
      }),
      response: {
        200: z.object({
          secretRotation: SecretRotationsSchema.merge(
            z.object({
              environment: z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string()
              })
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const secretRotation = await server.services.secretRotation.deleteById({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        rotationId: req.params.id
      });
      return { secretRotation };
    }
  });
};
