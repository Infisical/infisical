import { z } from "zod";

import { SecretsSchema,SecretType } from "@app/db/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { AuthMode } from "@app/services/auth/auth-type";

export const registerSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/",
    method: "GET",
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/"),
        include_imports: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
      }),
      response: {
        200: z.object({
          secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secrets = await server.services.secret.getSecrets({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment: req.query.environment,
        projectId: req.query.workspaceId,
        path: req.query.secretPath
      });

      return { secrets };
    }
  });

  server.route({
    url: "/:secretName",
    method: "GET",
    schema: {
      params: z.object({
        secretName: z.string().trim()
      }),
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/"),
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        include_imports: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
      }),
      response: {
        200: z.object({
          secret: SecretsSchema.omit({ secretBlindIndex: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secret = await server.services.secret.getASecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment: req.query.environment,
        projectId: req.query.workspaceId,
        path: req.query.secretPath,
        secretName: req.params.secretName,
        type: req.query.type
      });

      return { secret };
    }
  });

  server.route({
    url: "/:secretName",
    method: "POST",
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        secretPath: z.string().trim().default("/"),
        secretKeyCiphertext: z.string().trim(),
        secretKeyIV: z.string().trim(),
        secretKeyTag: z.string().trim(),
        secretValueCiphertext: z.string().trim(),
        secretValueIV: z.string().trim(),
        secretValueTag: z.string().trim(),
        secretCommentCiphertext: z.string().trim().optional(),
        secretCommentIV: z.string().trim().optional(),
        secretCommentTag: z.string().trim().optional(),
        metadata: z.record(z.string()).optional(),
        skipMultilineEncoding: z.boolean().optional()
      }),
      params: z.object({
        secretName: z.string().trim()
      }),
      response: {
        200: z.object({
          secret: SecretsSchema.omit({ secretBlindIndex: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secret = await server.services.secret.createSecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: req.body.secretPath,
        type: req.body.type,
        environment: req.body.environment,
        secretName: req.params.secretName,
        projectId: req.body.workspaceId,
        secretKeyIV: req.body.secretKeyIV,
        secretKeyTag: req.body.secretKeyTag,
        secretKeyCiphertext: req.body.secretKeyCiphertext,
        secretValueIV: req.body.secretValueIV,
        secretValueTag: req.body.secretValueTag,
        secretValueCiphertext: req.body.secretValueCiphertext,
        secretCommentIV: req.body.secretCommentIV,
        secretCommentTag: req.body.secretCommentTag,
        secretCommentCiphertext: req.body.secretCommentCiphertext,
        skipMultilineEncoding: req.body.skipMultilineEncoding,
        metadata: req.body.metadata
      });

      return { secret };
    }
  });

  server.route({
    url: "/:secretName",
    method: "PATCH",
    schema: {
      params: z.object({
        secretName: z.string()
      }),
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretId: z.string().trim().optional(),
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        secretPath: z.string().trim().default("/"),
        secretValueCiphertext: z.string().trim(),
        secretValueIV: z.string().trim(),
        secretValueTag: z.string().trim(),
        secretCommentCiphertext: z.string().trim().optional(),
        secretCommentIV: z.string().trim().optional(),
        secretCommentTag: z.string().trim().optional(),
        secretReminderRepeatDays: z.number().min(1).max(365).optional().nullable(),
        secretReminderNote: z.string().trim().nullable().optional(),
        tags: z.string().array().optional(),
        skipMultilineEncoding: z.boolean().optional(),
        // to update secret name
        secretName: z.string().trim().optional(),
        secretKeyIV: z.string().trim().optional(),
        secretKeyTag: z.string().trim().optional(),
        secretKeyCiphertext: z.string().trim().optional(),
        metadata: z.record(z.string()).optional()
      }),
      response: {
        200: z.object({
          secret: SecretsSchema.omit({ secretBlindIndex: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secret = await server.services.secret.updateSecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: req.body.secretPath,
        type: req.body.type,
        environment: req.body.environment,
        secretName: req.params.secretName,
        projectId: req.body.workspaceId,
        secretKeyIV: req.body.secretKeyIV,
        secretKeyTag: req.body.secretKeyTag,
        secretKeyCiphertext: req.body.secretKeyCiphertext,
        secretValueIV: req.body.secretValueIV,
        secretValueTag: req.body.secretValueTag,
        secretValueCiphertext: req.body.secretValueCiphertext,
        secretCommentIV: req.body.secretCommentIV,
        secretCommentTag: req.body.secretCommentTag,
        secretCommentCiphertext: req.body.secretCommentCiphertext,
        skipMultilineEncoding: req.body.skipMultilineEncoding,
        metadata: req.body.metadata,
        secretReminderRepeatDays: req.body.secretReminderRepeatDays,
        secretReminderNote: req.body.secretReminderNote,
        newSecretName: req.body.secretName
      });

      return { secret };
    }
  });

  server.route({
    url: "/:secretName",
    method: "DELETE",
    schema: {
      params: z.object({
        secretName: z.string()
      }),
      body: z.object({
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        secretPath: z.string().trim().default("/"),
        secretId: z.string().trim().optional(),
        workspaceId: z.string().trim(),
        environment: z.string().trim()
      }),
      response: {
        200: z.object({
          secret: SecretsSchema.omit({ secretBlindIndex: true })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secret = await server.services.secret.deleteSecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: req.body.secretPath,
        type: req.body.type,
        environment: req.body.environment,
        secretName: req.params.secretName,
        projectId: req.body.workspaceId,
        secretId: req.body.secretId
      });

      return { secret };
    }
  });

  server.route({
    url: "/batch",
    method: "POST",
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/"),
        secrets: z
          .object({
            secretName: z.string().trim(),
            type: z.nativeEnum(SecretType).default(SecretType.Shared),
            secretKeyCiphertext: z.string().trim(),
            secretKeyIV: z.string().trim(),
            secretKeyTag: z.string().trim(),
            secretValueCiphertext: z.string().trim(),
            secretValueIV: z.string().trim(),
            secretValueTag: z.string().trim(),
            secretCommentCiphertext: z.string().trim().optional(),
            secretCommentIV: z.string().trim().optional(),
            secretCommentTag: z.string().trim().optional(),
            metadata: z.record(z.string()).optional(),
            skipMultilineEncoding: z.boolean().optional()
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.object({
          secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secrets = await server.services.secret.createManySecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: req.body.secretPath,
        environment: req.body.environment,
        projectId: req.body.workspaceId,
        secrets: req.body.secrets
      });

      return { secrets };
    }
  });

  server.route({
    url: "/batch",
    method: "PATCH",
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/"),
        secrets: z
          .object({
            secretName: z.string().trim(),
            type: z.nativeEnum(SecretType).default(SecretType.Shared),
            secretValueCiphertext: z.string().trim(),
            secretValueIV: z.string().trim(),
            secretValueTag: z.string().trim(),
            secretKeyCiphertext: z.string().trim(),
            secretKeyIV: z.string().trim(),
            secretKeyTag: z.string().trim(),
            secretCommentCiphertext: z.string().trim().optional(),
            secretCommentIV: z.string().trim().optional(),
            secretCommentTag: z.string().trim().optional(),
            skipMultilineEncoding: z.boolean().optional(),
            tags: z.string().array().optional()
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.object({
          secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secrets = await server.services.secret.updateManySecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: req.body.secretPath,
        environment: req.body.environment,
        projectId: req.body.workspaceId,
        secrets: req.body.secrets
      });

      return { secrets };
    }
  });

  server.route({
    url: "/batch",
    method: "DELETE",
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/"),
        secrets: z
          .object({
            secretName: z.string().trim(),
            type: z.nativeEnum(SecretType).default(SecretType.Shared)
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.object({
          secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY]),
    handler: async (req) => {
      const secrets = await server.services.secret.deleteManySecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: req.body.secretPath,
        environment: req.body.environment,
        projectId: req.body.workspaceId,
        secrets: req.body.secrets
      });

      return { secrets };
    }
  });
};
