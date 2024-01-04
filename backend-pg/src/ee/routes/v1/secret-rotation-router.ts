import { z } from "zod";

import { SecretRotationOutputsSchema, SecretRotationsSchema, SecretsSchema } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretRotationRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "POST",
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        secretPath: z.string().trim(),
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
        actorId: req.permission.id,
        ...req.body,
        projectId: req.body.workspaceId
      });
      return { secretRotation };
    }
  });

  server.route({
    url: "/restart",
    method: "POST",
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
        rotationId: req.body.id
      });
      return { secretRotation };
    }
  });

  server.route({
    url: "/",
    method: "GET",
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
                  secret: SecretsSchema.pick({
                    id: true,
                    version: true,
                    secretKeyIV: true,
                    secretKeyTag: true,
                    secretKeyCiphertext: true,
                    secretValueIV: true,
                    secretValueTag: true,
                    secretValueCiphertext: true,
                    secretCommentIV: true,
                    secretCommentTag: true,
                    secretCommentCiphertext: true
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
        projectId: req.query.workspaceId
      });
      return { secretRotations };
    }
  });

  server.route({
    url: "/:id",
    method: "DELETE",
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
        rotationId: req.params.id
      });
      return { secretRotation };
    }
  });
};
