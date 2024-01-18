import picomatch from "picomatch";
import { z } from "zod";

import {
  SecretApprovalRequestsSchema,
  SecretsSchema,
  SecretTagsSchema,
  SecretType,
  ServiceTokenScopes
} from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { CommitType } from "@app/ee/services/secret-approval-request/secret-approval-request-types";
import { BadRequestError } from "@app/lib/errors";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";

import { secretRawSchema } from "../sanitizedSchemas";

export const registerSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    url: "/raw",
    method: "GET",
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim().optional(),
        environment: z.string().trim().optional(),
        secretPath: z.string().trim().default("/"),
        include_imports: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
      }),
      response: {
        200: z.object({
          secrets: secretRawSchema.array(),
          imports: z
            .object({
              secretPath: z.string(),
              environment: z.string(),
              folderId: z.string().optional(),
              secrets: secretRawSchema.array()
            })
            .array()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      // just for delivery hero usecase
      let { secretPath, environment, workspaceId } = req.query;
      if (req.auth.actor === ActorType.SERVICE) {
        const scope = ServiceTokenScopes.parse(req.auth.serviceToken.scopes);
        const isSingleScope = scope.length === 1;
        if (isSingleScope && !picomatch.scan(scope[0].secretPath).isGlob) {
          secretPath = scope[0].secretPath;
          environment = scope[0].environment;
          workspaceId = req.auth.serviceToken.projectId;
        }
      }

      if (!workspaceId || !environment)
        throw new BadRequestError({ message: "Missing workspace id or environment" });

      const { secrets, imports } = await server.services.secret.getSecretsRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment,
        projectId: workspaceId,
        path: secretPath,
        includeImports: req.query.include_imports
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.query.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.GET_SECRETS,
          metadata: {
            environment,
            secretPath: req.query.secretPath,
            numberOfSecrets: secrets.length
          }
        }
      });
      return { secrets, imports };
    }
  });

  server.route({
    url: "/raw/:secretName",
    method: "GET",
    schema: {
      params: z.object({
        secretName: z.string().trim()
      }),
      querystring: z.object({
        workspaceId: z.string().trim().optional(),
        environment: z.string().trim().optional(),
        secretPath: z.string().trim().default("/"),
        version: z.coerce.number().optional(),
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        include_imports: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
      }),
      response: {
        200: z.object({
          secret: secretRawSchema
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      let { secretPath, environment, workspaceId } = req.query;
      if (req.auth.actor === ActorType.SERVICE) {
        const scope = ServiceTokenScopes.parse(req.auth.serviceToken.scopes);
        const isSingleScope = scope.length === 1;
        if (isSingleScope && !picomatch.scan(scope[0].secretPath).isGlob) {
          secretPath = scope[0].secretPath;
          environment = scope[0].environment;
          workspaceId = req.auth.serviceToken.projectId;
        }
      }

      if (!workspaceId || !environment)
        throw new BadRequestError({ message: "Missing workspace id or environment" });

      const secret = await server.services.secret.getSecretByNameRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment,
        projectId: workspaceId,
        path: secretPath,
        secretName: req.params.secretName,
        type: req.query.type,
        includeImports: req.query.include_imports,
        version: req.query.version
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.query.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.GET_SECRET,
          metadata: {
            environment,
            secretPath: req.query.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
      });
      return { secret };
    }
  });

  server.route({
    url: "/raw/:secretName",
    method: "POST",
    schema: {
      params: z.object({
        secretName: z.string().trim()
      }),
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/"),
        secretValue: z
          .string()
          .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim())),
        secretComment: z.string().trim().optional().default(""),
        skipMultilineEncoding: z.boolean().optional(),
        type: z.nativeEnum(SecretType).default(SecretType.Shared)
      }),
      response: {
        200: z.object({
          secret: secretRawSchema
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const secret = await server.services.secret.createSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment: req.body.environment,
        projectId: req.body.workspaceId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type,
        secretValue: req.body.secretValue,
        skipMultilineEncoding: req.body.skipMultilineEncoding,
        secretComment: req.body.secretComment
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
      });
      return { secret };
    }
  });

  server.route({
    url: "/raw/:secretName",
    method: "PATCH",
    schema: {
      params: z.object({
        secretName: z.string().trim()
      }),
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretValue: z
          .string()
          .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim())),
        secretPath: z.string().trim().default("/"),
        skipMultilineEncoding: z.boolean().optional(),
        type: z.nativeEnum(SecretType).default(SecretType.Shared)
      }),
      response: {
        200: z.object({
          secret: secretRawSchema
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const secret = await server.services.secret.updateSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment: req.body.environment,
        projectId: req.body.workspaceId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type,
        secretValue: req.body.secretValue,
        skipMultilineEncoding: req.body.skipMultilineEncoding
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
      });
      return { secret };
    }
  });

  server.route({
    url: "/raw/:secretName",
    method: "DELETE",
    schema: {
      params: z.object({
        secretName: z.string().trim()
      }),
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/"),
        type: z.nativeEnum(SecretType).default(SecretType.Shared)
      }),
      response: {
        200: z.object({
          secret: secretRawSchema
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const secret = await server.services.secret.deleteSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment: req.body.environment,
        projectId: req.body.workspaceId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
      });
      return { secret };
    }
  });

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
          secrets: SecretsSchema.omit({ secretBlindIndex: true })
            .merge(
              z.object({
                tags: SecretTagsSchema.pick({
                  id: true,
                  slug: true,
                  name: true,
                  color: true
                }).array()
              })
            )
            .array(),
          imports: z
            .object({
              secretPath: z.string(),
              environment: z.string(),
              folderId: z.string().optional(),
              secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
            })
            .array()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const { secrets, imports } = await server.services.secret.getSecrets({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment: req.query.environment,
        projectId: req.query.workspaceId,
        path: req.query.secretPath,
        includeImports: req.query.include_imports
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.query.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.GET_SECRETS,
          metadata: {
            environment: req.query.environment,
            secretPath: req.query.secretPath,
            numberOfSecrets: secrets.length
          }
        }
      });

      return { secrets, imports };
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
        version: z.coerce.number().optional(),
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
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const secret = await server.services.secret.getSecretByName({
        actorId: req.permission.id,
        actor: req.permission.type,
        environment: req.query.environment,
        projectId: req.query.workspaceId,
        path: req.query.secretPath,
        secretName: req.params.secretName,
        type: req.query.type,
        includeImports: req.query.include_imports,
        version: req.query.version
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.query.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.GET_SECRET,
          metadata: {
            environment: req.query.environment,
            secretPath: req.query.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
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
        200: z.union([
          z.object({
            secret: SecretsSchema.omit({ secretBlindIndex: true })
          }),
          z
            .object({ approval: SecretApprovalRequestsSchema })
            .describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const {
        workspaceId: projectId,
        secretPath,
        environment,
        metadata,
        type,
        secretKeyIV,
        secretKeyTag,
        secretValueIV,
        secretValueTag,
        secretCommentIV,
        secretCommentTag,
        secretKeyCiphertext,
        secretValueCiphertext,
        secretCommentCiphertext,
        skipMultilineEncoding
      } = req.body;
      if (req.body.type !== SecretType.Personal && req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSapOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval =
            await server.services.secretApprovalRequest.generateSecretApprovalRequest({
              actorId: req.permission.id,
              actor: req.permission.type,
              secretPath,
              environment,
              projectId,
              policy,
              data: {
                [CommitType.Create]: [
                  {
                    secretName: req.params.secretName,
                    secretValueCiphertext,
                    secretValueIV,
                    secretValueTag,
                    secretCommentIV,
                    secretCommentTag,
                    secretCommentCiphertext,
                    skipMultilineEncoding,
                    secretKeyTag,
                    secretKeyCiphertext,
                    secretKeyIV
                  }
                ]
              }
            });

          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerId,
                secretApprovalRequestId: approval.id,
                secretApprovalRequestSlug: approval.slug
              }
            }
          });
          return { approval };
        }
      }
      const secret = await server.services.secret.createSecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: secretPath,
        type,
        environment: req.body.environment,
        secretName: req.params.secretName,
        projectId,
        secretKeyIV,
        secretKeyTag,
        secretKeyCiphertext,
        secretValueIV,
        secretValueTag,
        secretValueCiphertext,
        secretCommentIV,
        secretCommentTag,
        secretCommentCiphertext,
        skipMultilineEncoding,
        metadata
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
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
        200: z.union([
          z.object({
            secret: SecretsSchema.omit({ secretBlindIndex: true })
          }),
          z
            .object({ approval: SecretApprovalRequestsSchema })
            .describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const {
        secretValueCiphertext,
        secretValueTag,
        secretValueIV,
        type,
        environment,
        secretPath,
        workspaceId: projectId,
        tags,
        secretCommentIV,
        secretCommentTag,
        secretCommentCiphertext,
        secretName: newSecretName,
        secretKeyIV,
        secretKeyTag,
        secretKeyCiphertext,
        skipMultilineEncoding,
        secretReminderRepeatDays,
        secretReminderNote,
        metadata
      } = req.body;

      if (req.body.type !== SecretType.Personal && req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSapOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval =
            await server.services.secretApprovalRequest.generateSecretApprovalRequest({
              actorId: req.permission.id,
              actor: req.permission.type,
              secretPath,
              environment,
              projectId,
              policy,
              data: {
                [CommitType.Update]: [
                  {
                    secretName: req.params.secretName,
                    newSecretName,
                    secretValueCiphertext,
                    secretValueIV,
                    secretValueTag,
                    secretCommentIV,
                    secretCommentTag,
                    secretCommentCiphertext,
                    skipMultilineEncoding,
                    secretKeyTag,
                    secretKeyCiphertext,
                    secretKeyIV
                  }
                ]
              }
            });

          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerId,
                secretApprovalRequestId: approval.id,
                secretApprovalRequestSlug: approval.slug
              }
            }
          });
          return { approval };
        }
      }

      const secret = await server.services.secret.updateSecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: secretPath,
        type,
        environment,
        secretName: req.params.secretName,
        projectId,
        secretKeyIV,
        secretKeyTag,
        secretKeyCiphertext,
        secretValueIV,
        tags,
        secretValueTag,
        secretValueCiphertext,
        secretCommentIV,
        secretCommentTag,
        secretCommentCiphertext,
        skipMultilineEncoding,
        metadata,
        secretReminderRepeatDays,
        secretReminderNote,
        newSecretName
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
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
        200: z.union([
          z.object({
            secret: SecretsSchema.omit({ secretBlindIndex: true })
          }),
          z
            .object({ approval: SecretApprovalRequestsSchema })
            .describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const { secretPath, type, workspaceId: projectId, secretId, environment } = req.body;
      if (req.body.type !== SecretType.Personal && req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSapOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval =
            await server.services.secretApprovalRequest.generateSecretApprovalRequest({
              actorId: req.permission.id,
              actor: req.permission.type,
              secretPath,
              environment,
              projectId,
              policy,
              data: {
                [CommitType.Delete]: [
                  {
                    secretName: req.params.secretName
                  }
                ]
              }
            });

          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerId,
                secretApprovalRequestId: approval.id,
                secretApprovalRequestSlug: approval.slug
              }
            }
          });
          return { approval };
        }
      }

      const secret = await server.services.secret.deleteSecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: secretPath,
        type,
        environment,
        secretName: req.params.secretName,
        projectId,
        secretId
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version
          }
        }
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
        200: z.union([
          z.object({
            secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
          }),
          z
            .object({ approval: SecretApprovalRequestsSchema })
            .describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const { environment, workspaceId: projectId, secretPath, secrets: inputSecrets } = req.body;
      if (req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSapOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval =
            await server.services.secretApprovalRequest.generateSecretApprovalRequest({
              actorId: req.permission.id,
              actor: req.permission.type,
              secretPath,
              environment,
              projectId,
              policy,
              data: {
                [CommitType.Create]: inputSecrets.filter(({ type }) => type === "shared")
              }
            });

          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerId,
                secretApprovalRequestId: approval.id,
                secretApprovalRequestSlug: approval.slug
              }
            }
          });
          return { approval };
        }
      }

      const secrets = await server.services.secret.createManySecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: secretPath,
        environment,
        projectId,
        secrets: inputSecrets
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_SECRETS,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secrets: secrets.map((secret, i) => ({
              secretId: secret.id,
              secretKey: inputSecrets[i].secretName,
              secretVersion: secret.version
            }))
          }
        }
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
        200: z.union([
          z.object({
            secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
          }),
          z
            .object({ approval: SecretApprovalRequestsSchema })
            .describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const { environment, workspaceId: projectId, secretPath, secrets: inputSecrets } = req.body;
      if (req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSapOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval =
            await server.services.secretApprovalRequest.generateSecretApprovalRequest({
              actorId: req.permission.id,
              actor: req.permission.type,
              secretPath,
              environment,
              projectId,
              policy,
              data: {
                [CommitType.Update]: inputSecrets.filter(({ type }) => type === "shared")
              }
            });

          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerId,
                secretApprovalRequestId: approval.id,
                secretApprovalRequestSlug: approval.slug
              }
            }
          });
          return { approval };
        }
      }
      const secrets = await server.services.secret.updateManySecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: secretPath,
        environment,
        projectId,
        secrets: inputSecrets
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_SECRETS,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secrets: secrets.map((secret, i) => ({
              secretId: secret.id,
              secretKey: inputSecrets[i].secretName,
              secretVersion: secret.version
            }))
          }
        }
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
        200: z.union([
          z.object({
            secrets: SecretsSchema.omit({ secretBlindIndex: true }).array()
          }),
          z
            .object({ approval: SecretApprovalRequestsSchema })
            .describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([
      AuthMode.JWT,
      AuthMode.API_KEY,
      AuthMode.SERVICE_TOKEN,
      AuthMode.IDENTITY_ACCESS_TOKEN
    ]),
    handler: async (req) => {
      const { environment, workspaceId: projectId, secretPath, secrets: inputSecrets } = req.body;
      if (req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSapOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval =
            await server.services.secretApprovalRequest.generateSecretApprovalRequest({
              actorId: req.permission.id,
              actor: req.permission.type,
              secretPath,
              environment,
              projectId,
              policy,
              data: {
                [CommitType.Delete]: inputSecrets.filter(({ type }) => type === "shared")
              }
            });
          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerId,
                secretApprovalRequestId: approval.id,
                secretApprovalRequestSlug: approval.slug
              }
            }
          });
          return { approval };
        }
      }
      const secrets = await server.services.secret.deleteManySecret({
        actorId: req.permission.id,
        actor: req.permission.type,
        path: req.body.secretPath,
        environment,
        projectId,
        secrets: inputSecrets
      });

      await server.services.auditLog.createAuditLog({
        projectId: req.body.workspaceId,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_SECRETS,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secrets: secrets.map((secret, i) => ({
              secretId: secret.id,
              secretKey: inputSecrets[i].secretName,
              secretVersion: secret.version
            }))
          }
        }
      });
      return { secrets };
    }
  });
};
