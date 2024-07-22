import picomatch from "picomatch";
import { z } from "zod";

import {
  SecretApprovalRequestsSchema,
  SecretsSchema,
  SecretTagsSchema,
  SecretType,
  ServiceTokenScopes
} from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { RAW_SECRETS, SECRETS } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { secretsLimit, writeLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { getUserAgentType } from "@app/server/plugins/audit-log";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { ProjectFilterType } from "@app/services/project/project-types";
import { SecretOperations, SecretProtectionType } from "@app/services/secret/secret-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { secretRawSchema } from "../sanitizedSchemas";

export const registerSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/tags/:secretName",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Attach tags to a secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(SECRETS.ATTACH_TAGS.secretName)
      }),
      body: z.object({
        projectSlug: z.string().trim().describe(SECRETS.ATTACH_TAGS.projectSlug),
        environment: z.string().trim().describe(SECRETS.ATTACH_TAGS.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(SECRETS.ATTACH_TAGS.secretPath),
        type: z.nativeEnum(SecretType).default(SecretType.Shared).describe(SECRETS.ATTACH_TAGS.type),
        tagSlugs: z.string().array().min(1).describe(SECRETS.ATTACH_TAGS.tagSlugs)
      }),
      response: {
        200: z.object({
          secret: SecretsSchema.omit({ secretBlindIndex: true }).merge(
            z.object({
              tags: SecretTagsSchema.pick({
                id: true,
                slug: true,
                name: true,
                color: true
              }).array()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secret = await server.services.secret.attachTags({
        secretName: req.params.secretName,
        tagSlugs: req.body.tagSlugs,
        path: req.body.secretPath,
        environment: req.body.environment,
        type: req.body.type,
        projectSlug: req.body.projectSlug,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { secret };
    }
  });

  server.route({
    method: "DELETE",
    url: "/tags/:secretName",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      description: "Detach tags from a secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(SECRETS.DETACH_TAGS.secretName)
      }),
      body: z.object({
        projectSlug: z.string().trim().describe(SECRETS.DETACH_TAGS.projectSlug),
        environment: z.string().trim().describe(SECRETS.DETACH_TAGS.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(SECRETS.DETACH_TAGS.secretPath),
        type: z.nativeEnum(SecretType).default(SecretType.Shared).describe(SECRETS.DETACH_TAGS.type),
        tagSlugs: z.string().array().min(1).describe(SECRETS.DETACH_TAGS.tagSlugs)
      }),
      response: {
        200: z.object({
          secret: SecretsSchema.omit({ secretBlindIndex: true }).merge(
            z.object({
              tags: SecretTagsSchema.pick({
                id: true,
                slug: true,
                name: true,
                color: true
              }).array()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secret = await server.services.secret.detachTags({
        secretName: req.params.secretName,
        tagSlugs: req.body.tagSlugs,
        path: req.body.secretPath,
        environment: req.body.environment,
        type: req.body.type,
        projectSlug: req.body.projectSlug,
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId
      });

      return { secret };
    }
  });

  server.route({
    method: "GET",
    url: "/raw",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "List secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.LIST.workspaceId),
        workspaceSlug: z.string().trim().optional().describe(RAW_SECRETS.LIST.workspaceSlug),
        environment: z.string().trim().optional().describe(RAW_SECRETS.LIST.environment),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash).describe(RAW_SECRETS.LIST.secretPath),
        expandSecretReferences: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
          .describe(RAW_SECRETS.LIST.expand),
        recursive: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
          .describe(RAW_SECRETS.LIST.recursive),
        include_imports: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
          .describe(RAW_SECRETS.LIST.includeImports)
      }),
      response: {
        200: z.object({
          secrets: secretRawSchema
            .extend({
              secretPath: z.string().optional(),
              tags: SecretTagsSchema.pick({
                id: true,
                slug: true,
                name: true,
                color: true
              })
                .array()
                .optional()
            })
            .array(),
          imports: z
            .object({
              secretPath: z.string(),
              environment: z.string(),
              folderId: z.string().optional(),
              secrets: secretRawSchema.omit({ createdAt: true, updatedAt: true }).array()
            })
            .array()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
      } else if (req.permission.type === ActorType.IDENTITY && req.query.workspaceSlug && !workspaceId) {
        const workspace = await server.services.project.getAProject({
          filter: {
            type: ProjectFilterType.SLUG,
            orgId: req.permission.orgId,
            slug: req.query.workspaceSlug
          },
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId
        });

        if (!workspace) throw new BadRequestError({ message: `No project found with slug ${req.query.workspaceSlug}` });

        workspaceId = workspace.id;
      }

      if (!workspaceId || !environment) throw new BadRequestError({ message: "Missing workspace id or environment" });

      const { secrets, imports } = await server.services.secret.getSecretsRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        environment,
        expandSecretReferences: req.query.expandSecretReferences,
        actorAuthMethod: req.permission.authMethod,
        projectId: workspaceId,
        path: secretPath,
        includeImports: req.query.include_imports,
        recursive: req.query.recursive
      });

      await server.services.auditLog.createAuditLog({
        projectId: workspaceId,
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

      if (getUserAgentType(req.headers["user-agent"]) !== UserAgentType.K8_OPERATOR) {
        await server.services.telemetry.sendPostHogEvents({
          event: PostHogEventTypes.SecretPulled,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            numberOfSecrets: secrets.length,
            workspaceId,
            environment,
            secretPath: req.query.secretPath,
            channel: getUserAgentType(req.headers["user-agent"]),
            ...req.auditLogInfo
          }
        });
      }
      return { secrets, imports };
    }
  });

  server.route({
    method: "GET",
    url: "/raw/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Get a secret by name",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(RAW_SECRETS.GET.secretName)
      }),
      querystring: z.object({
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.GET.workspaceId),
        workspaceSlug: z.string().trim().optional().describe(RAW_SECRETS.GET.workspaceSlug),
        environment: z.string().trim().optional().describe(RAW_SECRETS.GET.environment),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash).describe(RAW_SECRETS.GET.secretPath),
        version: z.coerce.number().optional().describe(RAW_SECRETS.GET.version),
        type: z.nativeEnum(SecretType).default(SecretType.Shared).describe(RAW_SECRETS.GET.type),
        expandSecretReferences: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
          .describe(RAW_SECRETS.GET.expand),
        include_imports: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
          .describe(RAW_SECRETS.GET.includeImports)
      }),
      response: {
        200: z.object({
          secret: secretRawSchema.extend({
            tags: SecretTagsSchema.pick({
              id: true,
              slug: true,
              name: true,
              color: true
            })
              .array()
              .optional()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { workspaceSlug } = req.query;
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

      if (!environment) throw new BadRequestError({ message: "Missing environment" });
      if (!workspaceId && !workspaceSlug)
        throw new BadRequestError({ message: "You must provide workspaceSlug or workspaceId" });

      const secret = await server.services.secret.getSecretByNameRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        expandSecretReferences: req.query.expandSecretReferences,
        environment,
        projectId: workspaceId,
        projectSlug: workspaceSlug,
        path: secretPath,
        secretName: req.params.secretName,
        type: req.query.type,
        includeImports: req.query.include_imports,
        version: req.query.version
      });

      await server.services.auditLog.createAuditLog({
        projectId: secret.workspace,
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

      if (getUserAgentType(req.headers["user-agent"]) !== UserAgentType.K8_OPERATOR) {
        await server.services.telemetry.sendPostHogEvents({
          event: PostHogEventTypes.SecretPulled,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            numberOfSecrets: 1,
            workspaceId: secret.workspace,
            environment,
            secretPath: req.query.secretPath,
            channel: getUserAgentType(req.headers["user-agent"]),
            ...req.auditLogInfo
          }
        });
      }
      return { secret };
    }
  });

  server.route({
    method: "POST",
    url: "/raw/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Create secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(RAW_SECRETS.CREATE.secretName)
      }),
      body: z.object({
        workspaceId: z.string().trim().describe(RAW_SECRETS.CREATE.workspaceId),
        environment: z.string().trim().describe(RAW_SECRETS.CREATE.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.CREATE.secretPath),
        secretValue: z
          .string()
          .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
          .describe(RAW_SECRETS.CREATE.secretValue),
        secretComment: z.string().trim().optional().default("").describe(RAW_SECRETS.CREATE.secretComment),
        tagIds: z.string().array().optional().describe(RAW_SECRETS.CREATE.tagIds),
        skipMultilineEncoding: z.boolean().optional().describe(RAW_SECRETS.CREATE.skipMultilineEncoding),
        type: z.nativeEnum(SecretType).default(SecretType.Shared).describe(RAW_SECRETS.CREATE.type),
        secretReminderRepeatDays: z
          .number()
          .optional()
          .nullable()
          .describe(RAW_SECRETS.CREATE.secretReminderRepeatDays),
        secretReminderNote: z.string().optional().nullable().describe(RAW_SECRETS.CREATE.secretReminderNote)
      }),
      response: {
        200: z.union([
          z.object({
            secret: secretRawSchema
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretOperation = await server.services.secret.createSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        environment: req.body.environment,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.body.workspaceId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type,
        secretValue: req.body.secretValue,
        skipMultilineEncoding: req.body.skipMultilineEncoding,
        secretComment: req.body.secretComment,
        tagIds: req.body.tagIds,
        secretReminderNote: req.body.secretReminderNote,
        secretReminderRepeatDays: req.body.secretReminderRepeatDays
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        return { approval: secretOperation.approval };
      }

      const { secret } = secretOperation;
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: 1,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });

      return { secret };
    }
  });

  server.route({
    method: "PATCH",
    url: "/raw/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Update secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(RAW_SECRETS.UPDATE.secretName)
      }),
      body: z.object({
        workspaceId: z.string().trim().describe(RAW_SECRETS.UPDATE.workspaceId),
        environment: z.string().trim().describe(RAW_SECRETS.UPDATE.environment),
        secretValue: z
          .string()
          .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
          .describe(RAW_SECRETS.UPDATE.secretValue),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.UPDATE.secretPath),
        skipMultilineEncoding: z.boolean().optional().describe(RAW_SECRETS.UPDATE.skipMultilineEncoding),
        type: z.nativeEnum(SecretType).default(SecretType.Shared).describe(RAW_SECRETS.UPDATE.type),
        tagIds: z.string().array().optional().describe(RAW_SECRETS.UPDATE.tagIds),
        metadata: z.record(z.string()).optional(),
        secretReminderNote: z.string().optional().nullable().describe(RAW_SECRETS.UPDATE.secretReminderNote),
        secretReminderRepeatDays: z
          .number()
          .optional()
          .nullable()
          .describe(RAW_SECRETS.UPDATE.secretReminderRepeatDays),
        newSecretName: z.string().min(1).optional().describe(RAW_SECRETS.UPDATE.newSecretName),
        secretComment: z.string().optional().describe(RAW_SECRETS.UPDATE.secretComment)
      }),
      response: {
        200: z.union([
          z.object({
            secret: secretRawSchema
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretOperation = await server.services.secret.updateSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        environment: req.body.environment,
        projectId: req.body.workspaceId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type,
        secretValue: req.body.secretValue,
        skipMultilineEncoding: req.body.skipMultilineEncoding,
        tagIds: req.body.tagIds,
        secretReminderRepeatDays: req.body.secretReminderRepeatDays,
        secretReminderNote: req.body.secretReminderNote,
        metadata: req.body.metadata,
        newSecretName: req.body.newSecretName,
        secretComment: req.body.secretComment
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        return { approval: secretOperation.approval };
      }
      const { secret } = secretOperation;

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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretUpdated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: 1,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secret };
    }
  });

  server.route({
    method: "DELETE",
    url: "/raw/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Delete secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().trim().describe(RAW_SECRETS.DELETE.secretName)
      }),
      body: z.object({
        workspaceId: z.string().trim().describe(RAW_SECRETS.DELETE.workspaceId),
        environment: z.string().trim().describe(RAW_SECRETS.DELETE.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.DELETE.secretPath),
        type: z.nativeEnum(SecretType).default(SecretType.Shared).describe(RAW_SECRETS.DELETE.type)
      }),
      response: {
        200: z.union([
          z.object({
            secret: secretRawSchema
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secretOperation = await server.services.secret.deleteSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        environment: req.body.environment,
        projectId: req.body.workspaceId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        return { approval: secretOperation.approval };
      }
      const { secret } = secretOperation;

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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretDeleted,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: 1,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });

      return { secret };
    }
  });

  server.route({
    method: "GET",
    url: "/",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        recursive: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true"),
        include_imports: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
      }),
      response: {
        200: z.object({
          secrets: SecretsSchema.omit({ secretBlindIndex: true })
            .extend({
              _id: z.string(),
              workspace: z.string(),
              environment: z.string(),
              secretPath: z.string().optional(),
              tags: SecretTagsSchema.pick({
                id: true,
                slug: true,
                name: true,
                color: true
              }).array()
            })
            .array(),
          imports: z
            .object({
              secretPath: z.string(),
              environment: z.string(),
              folderId: z.string().optional(),
              secrets: SecretsSchema.omit({ secretBlindIndex: true })
                .merge(
                  z.object({
                    _id: z.string(),
                    workspace: z.string(),
                    environment: z.string()
                  })
                )
                .array()
            })
            .array()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { secrets, imports } = await server.services.secret.getSecrets({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        environment: req.query.environment,
        projectId: req.query.workspaceId,
        path: req.query.secretPath,
        includeImports: req.query.include_imports,
        recursive: req.query.recursive
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

      // TODO: Move to telemetry plugin
      // let shouldRecordK8Event = false;
      // if (req.headers["user-agent"] === "k8-operatoer") {
      //   const randomNumber = Math.random();
      //   if (randomNumber > 0.95) {
      //     shouldRecordK8Event = true;
      //   }
      // }

      const shouldCapture =
        req.query.workspaceId !== "650e71fbae3e6c8572f436d4" && req.headers["user-agent"] !== "k8-operator";
      if (shouldCapture) {
        await server.services.telemetry.sendPostHogEvents({
          event: PostHogEventTypes.SecretPulled,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            numberOfSecrets: secrets.length,
            workspaceId: req.query.workspaceId,
            environment: req.query.environment,
            secretPath: req.query.secretPath,
            channel: getUserAgentType(req.headers["user-agent"]),
            ...req.auditLogInfo
          }
        });
      }

      return { secrets, imports };
    }
  });

  server.route({
    method: "GET",
    url: "/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      params: z.object({
        secretName: z.string().trim()
      }),
      querystring: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        version: z.coerce.number().optional(),
        include_imports: z
          .enum(["true", "false"])
          .default("false")
          .transform((value) => value === "true")
      }),
      response: {
        200: z.object({
          secret: SecretsSchema.omit({ secretBlindIndex: true }).merge(
            z.object({
              workspace: z.string(),
              environment: z.string()
            })
          )
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const secret = await server.services.secret.getSecretByName({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      if (getUserAgentType(req.headers["user-agent"]) !== UserAgentType.K8_OPERATOR) {
        await server.services.telemetry.sendPostHogEvents({
          event: PostHogEventTypes.SecretPulled,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            numberOfSecrets: 1,
            workspaceId: req.query.workspaceId,
            environment: req.query.environment,
            secretPath: req.query.secretPath,
            channel: getUserAgentType(req.headers["user-agent"]),
            ...req.auditLogInfo
          }
        });
      }
      return { secret };
    }
  });

  server.route({
    url: "/:secretName",
    method: "POST",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
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
            secret: SecretsSchema.omit({ secretBlindIndex: true }).merge(
              z.object({
                _id: z.string(),
                workspace: z.string(),
                environment: z.string()
              })
            )
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
        const policy = await server.services.secretApprovalPolicy.getSecretApprovalPolicyOfFolder({
          actorId: req.permission.id,
          actorOrgId: req.permission.orgId,
          actorAuthMethod: req.permission.authMethod,
          actor: req.permission.type,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval = await server.services.secretApprovalRequest.generateSecretApprovalRequest({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            secretPath,
            environment,
            projectId,
            policy,
            data: {
              [SecretOperations.Create]: [
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
                committedBy: approval.committerUserId,
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: 1,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });

      return { secret };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      params: z.object({
        secretName: z.string()
      }),
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretId: z.string().trim().optional(),
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
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
            secret: SecretsSchema.omit({ secretBlindIndex: true }).merge(
              z.object({
                _id: z.string(),
                workspace: z.string(),
                environment: z.string()
              })
            )
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
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
        const policy = await server.services.secretApprovalPolicy.getSecretApprovalPolicyOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval = await server.services.secretApprovalRequest.generateSecretApprovalRequest({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            secretPath,
            environment,
            projectId,
            policy,
            data: {
              [SecretOperations.Update]: [
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
                  secretKeyIV,
                  tagIds: tags
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
                committedBy: approval.committerUserId,
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretUpdated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: 1,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secret };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      params: z.object({
        secretName: z.string()
      }),
      body: z.object({
        type: z.nativeEnum(SecretType).default(SecretType.Shared),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        secretId: z.string().trim().optional(),
        workspaceId: z.string().trim(),
        environment: z.string().trim()
      }),
      response: {
        200: z.union([
          z.object({
            secret: SecretsSchema.omit({ secretBlindIndex: true }).merge(
              z.object({
                _id: z.string(),
                workspace: z.string(),
                environment: z.string()
              })
            )
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { secretPath, type, workspaceId: projectId, secretId, environment } = req.body;
      if (req.body.type !== SecretType.Personal && req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSecretApprovalPolicyOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval = await server.services.secretApprovalRequest.generateSecretApprovalRequest({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            secretPath,
            environment,
            projectId,
            policy,
            data: {
              [SecretOperations.Delete]: [
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
                committedBy: approval.committerUserId,
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretDeleted,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: 1,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secret };
    }
  });

  server.route({
    method: "POST",
    url: "/move",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      body: z.object({
        projectSlug: z.string().trim(),
        sourceEnvironment: z.string().trim(),
        sourceSecretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        destinationEnvironment: z.string().trim(),
        destinationSecretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        secretIds: z.string().array(),
        shouldOverwrite: z.boolean().default(false)
      }),
      response: {
        200: z.object({
          isSourceUpdated: z.boolean(),
          isDestinationUpdated: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { projectId, isSourceUpdated, isDestinationUpdated } = await server.services.secret.moveSecrets({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.MOVE_SECRETS,
          metadata: {
            sourceEnvironment: req.body.sourceEnvironment,
            sourceSecretPath: req.body.sourceSecretPath,
            destinationEnvironment: req.body.destinationEnvironment,
            destinationSecretPath: req.body.destinationSecretPath,
            secretIds: req.body.secretIds
          }
        }
      });

      return {
        isSourceUpdated,
        isDestinationUpdated
      };
    }
  });

  server.route({
    method: "POST",
    url: "/batch",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        secrets: z
          .object({
            secretName: z.string().trim(),
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
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { environment, workspaceId: projectId, secretPath, secrets: inputSecrets } = req.body;
      if (req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSecretApprovalPolicyOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval = await server.services.secretApprovalRequest.generateSecretApprovalRequest({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            secretPath,
            environment,
            projectId,
            policy,
            data: {
              [SecretOperations.Create]: inputSecrets
            }
          });

          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerUserId,
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: secrets.length,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secrets };
    }
  });

  server.route({
    method: "PATCH",
    url: "/batch",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
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
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { environment, workspaceId: projectId, secretPath, secrets: inputSecrets } = req.body;
      if (req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSecretApprovalPolicyOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval = await server.services.secretApprovalRequest.generateSecretApprovalRequest({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            secretPath,
            environment,
            projectId,
            policy,
            data: {
              [SecretOperations.Update]: inputSecrets.filter(({ type }) => type === "shared")
            }
          });

          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerUserId,
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretUpdated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: secrets.length,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secrets };
    }
  });

  server.route({
    method: "DELETE",
    url: "/batch",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      body: z.object({
        workspaceId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
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
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { environment, workspaceId: projectId, secretPath, secrets: inputSecrets } = req.body;
      if (req.permission.type === ActorType.USER) {
        const policy = await server.services.secretApprovalPolicy.getSecretApprovalPolicyOfFolder({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          secretPath,
          environment,
          projectId
        });
        if (policy) {
          const approval = await server.services.secretApprovalRequest.generateSecretApprovalRequest({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            secretPath,
            environment,
            projectId,
            policy,
            data: {
              [SecretOperations.Delete]: inputSecrets.filter(({ type }) => type === "shared")
            }
          });
          await server.services.auditLog.createAuditLog({
            projectId: req.body.workspaceId,
            ...req.auditLogInfo,
            event: {
              type: EventType.SECRET_APPROVAL_REQUEST,
              metadata: {
                committedBy: approval.committerUserId,
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
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
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

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretDeleted,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: secrets.length,
          workspaceId: req.body.workspaceId,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secrets };
    }
  });

  server.route({
    method: "POST",
    url: "/batch/raw",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Create many secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.projectSlug),
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.workspaceId),
        environment: z.string().trim().describe(RAW_SECRETS.CREATE.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.CREATE.secretPath),
        secrets: z
          .object({
            secretKey: z.string().trim().describe(RAW_SECRETS.CREATE.secretName),
            secretValue: z
              .string()
              .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
              .describe(RAW_SECRETS.CREATE.secretValue),
            secretComment: z.string().trim().optional().default("").describe(RAW_SECRETS.CREATE.secretComment),
            skipMultilineEncoding: z.boolean().optional().describe(RAW_SECRETS.CREATE.skipMultilineEncoding),
            metadata: z.record(z.string()).optional(),
            tagIds: z.string().array().optional().describe(RAW_SECRETS.CREATE.tagIds)
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.union([
          z.object({
            secrets: secretRawSchema.array()
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { environment, projectSlug, secretPath, secrets: inputSecrets } = req.body;

      const secretOperation = await server.services.secret.createManySecretsRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretPath,
        environment,
        projectSlug,
        projectId: req.body.workspaceId,
        secrets: inputSecrets
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        return { approval: secretOperation.approval };
      }
      const { secrets } = secretOperation;

      await server.services.auditLog.createAuditLog({
        projectId: secrets[0].workspace,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_SECRETS,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secrets: secrets.map((secret) => ({
              secretId: secret.id,
              secretKey: secret.secretKey,
              secretVersion: secret.version
            }))
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretCreated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: secrets.length,
          workspaceId: secrets[0].workspace,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secrets };
    }
  });

  server.route({
    method: "PATCH",
    url: "/batch/raw",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Update many secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.DELETE.projectSlug),
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.DELETE.workspaceId),
        environment: z.string().trim().describe(RAW_SECRETS.UPDATE.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.UPDATE.secretPath),
        secrets: z
          .object({
            secretKey: z.string().trim().describe(RAW_SECRETS.UPDATE.secretName),
            secretValue: z
              .string()
              .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
              .describe(RAW_SECRETS.UPDATE.secretValue),
            secretComment: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.secretComment),
            skipMultilineEncoding: z.boolean().optional().describe(RAW_SECRETS.UPDATE.skipMultilineEncoding),
            newSecretName: z.string().min(1).optional().describe(RAW_SECRETS.UPDATE.newSecretName),
            tagIds: z.string().array().optional().describe(RAW_SECRETS.UPDATE.tagIds),
            secretReminderNote: z.string().optional().nullable().describe(RAW_SECRETS.UPDATE.secretReminderNote),
            secretReminderRepeatDays: z
              .number()
              .optional()
              .nullable()
              .describe(RAW_SECRETS.UPDATE.secretReminderRepeatDays)
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.union([
          z.object({
            secrets: secretRawSchema.array()
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { environment, projectSlug, secretPath, secrets: inputSecrets } = req.body;
      const secretOperation = await server.services.secret.updateManySecretsRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretPath,
        environment,
        projectSlug,
        projectId: req.body.workspaceId,
        secrets: inputSecrets
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        return { approval: secretOperation.approval };
      }
      const { secrets } = secretOperation;

      await server.services.auditLog.createAuditLog({
        projectId: secrets[0].workspace,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_SECRETS,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secrets: secrets.map((secret) => ({
              secretId: secret.id,
              secretKey: secret.secretKey,
              secretVersion: secret.version
            }))
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretUpdated,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: secrets.length,
          workspaceId: secrets[0].workspace,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secrets };
    }
  });

  server.route({
    method: "DELETE",
    url: "/batch/raw",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Delete many secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.DELETE.projectSlug),
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.DELETE.workspaceId),
        environment: z.string().trim().describe(RAW_SECRETS.DELETE.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.DELETE.secretPath),
        secrets: z
          .object({
            secretKey: z.string().trim().describe(RAW_SECRETS.DELETE.secretName),
            type: z.nativeEnum(SecretType).default(SecretType.Shared)
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.union([
          z.object({
            secrets: secretRawSchema.array()
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { environment, projectSlug, secretPath, secrets: inputSecrets } = req.body;
      const secretOperation = await server.services.secret.deleteManySecretsRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        environment,
        projectSlug,
        secretPath,
        projectId: req.body.workspaceId,
        secrets: inputSecrets
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        return { approval: secretOperation.approval };
      }
      const { secrets } = secretOperation;

      await server.services.auditLog.createAuditLog({
        projectId: secrets[0].workspace,
        ...req.auditLogInfo,
        event: {
          type: EventType.DELETE_SECRETS,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secrets: secrets.map((secret) => ({
              secretId: secret.id,
              secretKey: secret.secretKey,
              secretVersion: secret.version
            }))
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretDeleted,
        distinctId: getTelemetryDistinctId(req),
        properties: {
          numberOfSecrets: secrets.length,
          workspaceId: secrets[0].workspace,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secrets };
    }
  });

  server.route({
    method: "POST",
    url: "/backfill-secret-references",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "Backfill secret references",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectId: z.string().trim().min(1)
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId } = req.body;
      const message = await server.services.secret.backfillSecretReferences({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        projectId
      });

      return message;
    }
  });
};
