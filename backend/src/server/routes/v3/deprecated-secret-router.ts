import picomatch from "picomatch";
import { z } from "zod";

import { SecretApprovalRequestsSchema, SecretsSchema, SecretType, ServiceTokenScopes } from "@app/db/schemas";
import { EventType, SecretApprovalEvent, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ApiDocsTags, RAW_SECRETS, SECRETS } from "@app/lib/api-docs";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { secretsLimit, writeLimit } from "@app/server/config/rateLimiter";
import { BaseSecretNameSchema, SecretNameSchema } from "@app/server/lib/schemas";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { getUserAgentType } from "@app/server/plugins/audit-log";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { ActorType, AuthMode } from "@app/services/auth/auth-type";
import { ResourceMetadataWithEncryptionSchema } from "@app/services/resource-metadata/resource-metadata-schema";
import { SecretOperations, SecretProtectionType } from "@app/services/secret/secret-types";
import { SecretUpdateMode } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

import { SanitizedTagSchema, secretRawSchema } from "../sanitizedSchemas";

const SecretReferenceNode = z.object({
  key: z.string(),
  value: z.string().optional(),
  environment: z.string(),
  secretPath: z.string()
});

const convertStringBoolean = (defaultValue: boolean = false) => {
  return z
    .enum(["true", "false"])
    .default(defaultValue ? "true" : "false")
    .transform((value) => value === "true");
};

type TSecretReferenceNode = z.infer<typeof SecretReferenceNode> & { children: TSecretReferenceNode[] };

const SecretReferenceNodeTree: z.ZodType<TSecretReferenceNode> = SecretReferenceNode.extend({
  children: z.lazy(() => SecretReferenceNodeTree.array())
});

export const registerDeprecatedSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/tags/:secretName",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "Attach tags to a secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: SecretNameSchema.describe(SECRETS.ATTACH_TAGS.secretName)
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
          secret: SecretsSchema.omit({ secretBlindIndex: true }).extend({
            tags: SanitizedTagSchema.array()
          })
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "Detach tags from a secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().describe(SECRETS.DETACH_TAGS.secretName)
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
          secret: SecretsSchema.omit({ secretBlindIndex: true }).extend({
            tags: SanitizedTagSchema.array()
          })
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "List secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        metadataFilter: z
          .string()
          .optional()
          .transform((val) => {
            if (!val) return undefined;

            const result: { key?: string; value?: string }[] = [];
            const pairs = val.split("|");

            for (const pair of pairs) {
              const keyValuePair: { key?: string; value?: string } = {};
              const parts = pair.split(/[,=]/);

              for (let i = 0; i < parts.length; i += 2) {
                const identifier = parts[i].trim().toLowerCase();
                const value = parts[i + 1]?.trim();

                if (identifier === "key" && value) {
                  keyValuePair.key = value;
                } else if (identifier === "value" && value) {
                  keyValuePair.value = value;
                }
              }

              if (keyValuePair.key && keyValuePair.value) {
                result.push(keyValuePair);
              }
            }

            return result.length ? result : undefined;
          })
          .superRefine((metadata, ctx) => {
            if (metadata && !Array.isArray(metadata)) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                  "Invalid secretMetadata format. Correct format is key=value1,value=value2|key=value3,value=value4."
              });
            }

            if (metadata) {
              if (metadata.length > 10) {
                ctx.addIssue({
                  code: z.ZodIssueCode.custom,
                  message: "You can only filter by up to 10 metadata fields"
                });
              }

              for (const item of metadata) {
                if (!item.key && !item.value) {
                  ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message:
                      "Invalid secretMetadata format, key or value must be provided. Correct format is key=value1,value=value2|key=value3,value=value4."
                  });
                }
              }
            }
          })
          .describe(RAW_SECRETS.LIST.metadataFilter),
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.LIST.projectId),
        workspaceSlug: z.string().trim().optional().describe(RAW_SECRETS.LIST.workspaceSlug),
        environment: z.string().trim().optional().describe(RAW_SECRETS.LIST.environment),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash).describe(RAW_SECRETS.LIST.secretPath),
        viewSecretValue: convertStringBoolean(true).describe(RAW_SECRETS.LIST.viewSecretValue),
        expandSecretReferences: convertStringBoolean().describe(RAW_SECRETS.LIST.expand),
        recursive: convertStringBoolean().describe(RAW_SECRETS.LIST.recursive),
        include_imports: convertStringBoolean().describe(RAW_SECRETS.LIST.includeImports),
        tagSlugs: z
          .string()
          .describe(RAW_SECRETS.LIST.tagSlugs)
          .optional()
          // split by comma and trim the strings
          .transform((el) => (el ? el.split(",").map((i) => i.trim()) : []))
      }),
      response: {
        200: z.object({
          secrets: secretRawSchema
            .extend({
              secretPath: z.string().optional(),
              secretValueHidden: z.boolean(),
              secretMetadata: ResourceMetadataWithEncryptionSchema.optional(),
              tags: SanitizedTagSchema.array().optional()
            })
            .array(),
          imports: z
            .object({
              secretPath: z.string(),
              environment: z.string(),
              folderId: z.string().optional(),
              secrets: secretRawSchema
                .omit({ createdAt: true, updatedAt: true })
                .extend({
                  secretValueHidden: z.boolean(),
                  secretMetadata: ResourceMetadataWithEncryptionSchema.optional()
                })
                .array()
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
      } else {
        const projectId = await server.services.project.extractProjectIdFromSlug({
          projectSlug: req.query.workspaceSlug,
          projectId: workspaceId,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId
        });

        workspaceId = projectId;
      }

      if (!workspaceId || !environment) throw new BadRequestError({ message: "Missing project id or environment" });

      const { secrets, imports } = await server.services.secret.getSecretsRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        environment,
        expandSecretReferences: req.query.expandSecretReferences,
        actorAuthMethod: req.permission.authMethod,
        projectId: workspaceId,
        viewSecretValue: req.query.viewSecretValue,
        path: secretPath,
        metadataFilter: req.query.metadataFilter,
        includeImports: req.query.include_imports,
        recursive: req.query.recursive,
        tagSlugs: req.query.tagSlugs
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
          organizationId: req.permission.orgId,
          properties: {
            numberOfSecrets: secrets.length,
            projectId: workspaceId,
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
    url: "/raw/id/:secretId",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Secrets],
      params: z.object({
        secretId: z.string()
      }),
      response: {
        200: z.object({
          secret: secretRawSchema.extend({
            secretPath: z.string(),
            tags: SanitizedTagSchema.array().optional(),
            secretMetadata: ResourceMetadataWithEncryptionSchema.optional()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { secretId } = req.params;
      const secret = await server.services.secret.getSecretByIdRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secretId
      });

      return { secret };
    }
  });

  server.route({
    method: "GET",
    url: "/raw/:secretName",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.Secrets],
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
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.GET.projectId),
        workspaceSlug: z.string().trim().optional().describe(RAW_SECRETS.GET.workspaceSlug),
        environment: z.string().trim().optional().describe(RAW_SECRETS.GET.environment),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash).describe(RAW_SECRETS.GET.secretPath),
        version: z.coerce.number().optional().describe(RAW_SECRETS.GET.version),
        type: z.nativeEnum(SecretType).default(SecretType.Shared).describe(RAW_SECRETS.GET.type),
        viewSecretValue: convertStringBoolean(true).describe(RAW_SECRETS.GET.viewSecretValue),
        expandSecretReferences: convertStringBoolean().describe(RAW_SECRETS.GET.expand),
        include_imports: convertStringBoolean().describe(RAW_SECRETS.GET.includeImports)
      }),
      response: {
        200: z.object({
          secret: secretRawSchema.extend({
            secretValueHidden: z.boolean(),
            secretPath: z.string(),
            tags: SanitizedTagSchema.array().optional(),
            secretMetadata: ResourceMetadataWithEncryptionSchema.optional()
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
      } else {
        const projectId = await server.services.project.extractProjectIdFromSlug({
          projectSlug: workspaceSlug,
          projectId: workspaceId,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId
        });

        workspaceId = projectId;
      }

      if (!environment) throw new BadRequestError({ message: "Missing environment" });
      if (!workspaceId) {
        throw new BadRequestError({ message: "You must provide workspaceSlug or workspaceId" });
      }

      const secret = await server.services.secret.getSecretByNameRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        expandSecretReferences: req.query.expandSecretReferences,
        environment,
        projectId: workspaceId,
        viewSecretValue: req.query.viewSecretValue,
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
            secretVersion: secret.version,
            secretMetadata:
              secret.secretMetadata?.map((item) => ({
                key: item.key,
                isEncrypted: item.isEncrypted,
                value: item.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : item.value
              })) || []
          }
        }
      });

      if (getUserAgentType(req.headers["user-agent"]) !== UserAgentType.K8_OPERATOR) {
        await server.services.telemetry.sendPostHogEvents({
          event: PostHogEventTypes.SecretPulled,
          organizationId: req.permission.orgId,
          distinctId: getTelemetryDistinctId(req),
          properties: {
            numberOfSecrets: 1,
            projectId: secret.workspace,
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "Create secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: SecretNameSchema.describe(RAW_SECRETS.CREATE.secretName)
      }),
      body: z.object({
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.CREATE.projectId),
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.CREATE.projectSlug),
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
        secretMetadata: ResourceMetadataWithEncryptionSchema.optional(),
        tagIds: z.string().array().optional().describe(RAW_SECRETS.CREATE.tagIds),
        skipMultilineEncoding: z
          .boolean()
          .optional()
          .nullable()
          .transform((v) => v ?? false)
          .describe(RAW_SECRETS.CREATE.skipMultilineEncoding),
        type: z.nativeEnum(SecretType).default(SecretType.Shared).describe(RAW_SECRETS.CREATE.type),
        secretReminderRepeatDays: z
          .number()
          .optional()
          .nullable()
          .describe(RAW_SECRETS.CREATE.secretReminderRepeatDays),
        secretReminderNote: z
          .string()
          .max(1024, "Secret reminder note cannot exceed 1024 characters")
          .optional()
          .nullable()
          .describe(RAW_SECRETS.CREATE.secretReminderNote)
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
      const projectId = await server.services.project.extractProjectIdFromSlug({
        projectSlug: req.body.projectSlug,
        projectId: req.body.workspaceId,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      const secretOperation = await server.services.secret.createSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        environment: req.body.environment,
        actorAuthMethod: req.permission.authMethod,
        projectId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type,
        secretValue: req.body.secretValue,
        skipMultilineEncoding: req.body.skipMultilineEncoding,
        secretComment: req.body.secretComment,
        secretMetadata: req.body.secretMetadata,
        tagIds: req.body.tagIds,
        secretReminderNote: req.body.secretReminderNote,
        secretReminderRepeatDays: req.body.secretReminderRepeatDays
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        await server.services.auditLog.createAuditLog({
          projectId: req.body.workspaceId,
          ...req.auditLogInfo,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: secretOperation.approval.committerUserId,
              secretApprovalRequestId: secretOperation.approval.id,
              secretApprovalRequestSlug: secretOperation.approval.slug,
              secretPath: req.body.secretPath,
              environment: req.body.environment,
              secretKey: req.params.secretName,
              eventType: SecretApprovalEvent.Create
            }
          }
        });

        return { approval: secretOperation.approval };
      }

      const { secret } = secretOperation;
      await server.services.auditLog.createAuditLog({
        projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.CREATE_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version,
            secretMetadata: req.body.secretMetadata?.map((meta) => ({
              key: meta.key,
              isEncrypted: meta.isEncrypted,
              value: meta.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : meta.value
            })),
            secretTags: secret.tags?.map((tag) => tag.name)
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: 1,
          projectId,
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "Update secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: BaseSecretNameSchema.describe(RAW_SECRETS.UPDATE.secretName)
      }),
      body: z.object({
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.projectId),
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.projectSlug),
        environment: z.string().trim().describe(RAW_SECRETS.UPDATE.environment),
        secretValue: z
          .string()
          .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
          .optional()
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
        secretMetadata: ResourceMetadataWithEncryptionSchema.optional(),
        secretReminderNote: z
          .string()
          .max(1024, "Secret reminder note cannot exceed 1024 characters")
          .optional()
          .nullable()
          .describe(RAW_SECRETS.UPDATE.secretReminderNote),
        secretReminderRepeatDays: z
          .number()
          .optional()
          .nullable()
          .describe(RAW_SECRETS.UPDATE.secretReminderRepeatDays),
        secretReminderRecipients: z.string().array().optional().describe(RAW_SECRETS.UPDATE.secretReminderRecipients),
        newSecretName: SecretNameSchema.optional().describe(RAW_SECRETS.UPDATE.newSecretName),
        secretComment: z.string().optional().describe(RAW_SECRETS.UPDATE.secretComment)
      }),
      response: {
        200: z.union([
          z.object({
            secret: secretRawSchema.extend({
              secretValueHidden: z.boolean()
            })
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = await server.services.project.extractProjectIdFromSlug({
        projectSlug: req.body.projectSlug,
        projectId: req.body.workspaceId,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      const secretOperation = await server.services.secret.updateSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        environment: req.body.environment,
        projectId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type,
        secretValue: req.body.secretValue,
        skipMultilineEncoding: req.body.skipMultilineEncoding,
        tagIds: req.body.tagIds,
        secretReminderRepeatDays: req.body.secretReminderRepeatDays,
        secretReminderRecipients: req.body.secretReminderRecipients,
        secretReminderNote: req.body.secretReminderNote,
        metadata: req.body.metadata,
        newSecretName: req.body.newSecretName,
        secretComment: req.body.secretComment,
        secretMetadata: req.body.secretMetadata
      });

      if (secretOperation.type === SecretProtectionType.Approval) {
        await server.services.auditLog.createAuditLog({
          projectId: req.body.workspaceId,
          ...req.auditLogInfo,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: secretOperation.approval.committerUserId,
              secretApprovalRequestId: secretOperation.approval.id,
              secretApprovalRequestSlug: secretOperation.approval.slug,
              secretPath: req.body.secretPath,
              environment: req.body.environment,
              secretKey: req.params.secretName,
              eventType: SecretApprovalEvent.Update
            }
          }
        });

        return { approval: secretOperation.approval };
      }
      const { secret } = secretOperation;

      await server.services.auditLog.createAuditLog({
        projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_SECRET,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secretId: secret.id,
            secretKey: req.params.secretName,
            secretVersion: secret.version,
            secretMetadata: req.body.secretMetadata?.map((meta) => ({
              key: meta.key,
              isEncrypted: meta.isEncrypted,
              value: meta.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : meta.value
            })),
            secretTags: secret.tags?.map((tag) => tag.name)
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretUpdated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: 1,
          projectId,
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "Delete secret",
      security: [
        {
          bearerAuth: []
        }
      ],
      params: z.object({
        secretName: z.string().min(1).describe(RAW_SECRETS.DELETE.secretName)
      }),
      body: z.object({
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.DELETE.projectId),
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.DELETE.projectSlug),
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
            secret: secretRawSchema.extend({
              secretValueHidden: z.boolean()
            })
          }),
          z.object({ approval: SecretApprovalRequestsSchema }).describe("When secret protection policy is enabled")
        ])
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.API_KEY, AuthMode.SERVICE_TOKEN, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const projectId = await server.services.project.extractProjectIdFromSlug({
        projectSlug: req.body.projectSlug,
        projectId: req.body.workspaceId,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId
      });

      const secretOperation = await server.services.secret.deleteSecretRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        environment: req.body.environment,
        projectId,
        secretPath: req.body.secretPath,
        secretName: req.params.secretName,
        type: req.body.type
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        await server.services.auditLog.createAuditLog({
          projectId: req.body.workspaceId,
          ...req.auditLogInfo,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: secretOperation.approval.committerUserId,
              secretApprovalRequestId: secretOperation.approval.id,
              secretApprovalRequestSlug: secretOperation.approval.slug,
              secretPath: req.body.secretPath,
              environment: req.body.environment,
              secretKey: req.params.secretName,
              eventType: SecretApprovalEvent.Delete
            }
          }
        });

        return { approval: secretOperation.approval };
      }

      const { secret } = secretOperation;

      await server.services.auditLog.createAuditLog({
        projectId,
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
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: 1,
          projectId,
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
              tags: SanitizedTagSchema.array()
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
          organizationId: req.permission.orgId,
          properties: {
            numberOfSecrets: secrets.length,
            projectId: req.query.workspaceId,
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
        include_imports: convertStringBoolean()
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
          organizationId: req.permission.orgId,
          properties: {
            numberOfSecrets: 1,
            projectId: req.query.workspaceId,
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
                secretApprovalRequestSlug: approval.slug,
                secretPath,
                environment,
                eventType: SecretApprovalEvent.Create
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
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: 1,
          projectId: req.body.workspaceId,
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
                secretValueHidden: z.boolean(),
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
                secretApprovalRequestSlug: approval.slug,
                secretPath,
                environment,
                secretKey: req.params.secretName,
                eventType: SecretApprovalEvent.Update
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
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: 1,
          projectId: req.body.workspaceId,
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
            secret: SecretsSchema.omit({ secretBlindIndex: true }).extend({
              _id: z.string(),
              secretValueHidden: z.boolean(),
              workspace: z.string(),
              environment: z.string()
            })
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
                secretApprovalRequestSlug: approval.slug,
                secretPath,
                environment,
                secretKey: req.params.secretName,
                eventType: SecretApprovalEvent.Delete
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
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: 1,
          projectId: req.body.workspaceId,
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
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
                secretApprovalRequestSlug: approval.slug,
                secretPath,
                environment,
                eventType: SecretApprovalEvent.CreateMany
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
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: secrets.length,
          projectId: req.body.workspaceId,
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
            secrets: SecretsSchema.omit({ secretBlindIndex: true }).extend({ secretValueHidden: z.boolean() }).array()
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
                secretApprovalRequestSlug: approval.slug,
                secretPath,
                environment,
                eventType: SecretApprovalEvent.UpdateMany,
                secrets: inputSecrets.map((secret) => ({
                  secretKey: secret.secretName
                }))
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
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: secrets.length,
          projectId: req.body.workspaceId,
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
            secrets: SecretsSchema.omit({ secretBlindIndex: true })
              .extend({
                secretValueHidden: z.boolean()
              })
              .array()
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
                secretApprovalRequestSlug: approval.slug,
                secretPath,
                environment,
                secrets: inputSecrets.map((secret) => ({
                  secretKey: secret.secretName
                })),
                eventType: SecretApprovalEvent.DeleteMany
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
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: secrets.length,
          projectId: req.body.workspaceId,
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "Create many secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.projectSlug),
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.projectId),
        environment: z.string().trim().describe(RAW_SECRETS.CREATE.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.CREATE.secretPath),
        secrets: z
          .object({
            secretKey: SecretNameSchema.describe(RAW_SECRETS.CREATE.secretName),
            secretValue: z
              .string()
              .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
              .describe(RAW_SECRETS.CREATE.secretValue),
            secretComment: z.string().trim().optional().default("").describe(RAW_SECRETS.CREATE.secretComment),
            skipMultilineEncoding: z
              .boolean()
              .optional()
              .nullable()
              .transform((v) => v ?? false)
              .describe(RAW_SECRETS.CREATE.skipMultilineEncoding),
            metadata: z.record(z.string()).optional(),
            secretMetadata: ResourceMetadataWithEncryptionSchema.optional(),
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
        await server.services.auditLog.createAuditLog({
          projectId: req.body.workspaceId,
          ...req.auditLogInfo,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: secretOperation.approval.committerUserId,
              secretApprovalRequestId: secretOperation.approval.id,
              secretApprovalRequestSlug: secretOperation.approval.slug,
              secretPath,
              environment,
              secrets: inputSecrets.map((secret) => ({
                secretKey: secret.secretKey
              })),
              eventType: SecretApprovalEvent.CreateMany
            }
          }
        });
        return { approval: secretOperation.approval };
      }
      const { secrets } = secretOperation;

      const secretMetadataMap = new Map(
        inputSecrets.map(({ secretKey, secretMetadata }) => [secretKey, secretMetadata])
      );

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
              secretVersion: secret.version,
              secretMetadata: secretMetadataMap.get(secret.secretKey)?.map((item) => ({
                key: item.key,
                isEncrypted: item.isEncrypted,
                value: item.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : item.value
              })),
              secretTags: secret.tags?.map((tag) => tag.name)
            }))
          }
        }
      });

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretCreated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: secrets.length,
          projectId: secrets[0].workspace,
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "Update many secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.DELETE.projectSlug),
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.DELETE.projectId),
        environment: z.string().trim().describe(RAW_SECRETS.UPDATE.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.UPDATE.secretPath),
        mode: z
          .nativeEnum(SecretUpdateMode)
          .optional()
          .default(SecretUpdateMode.FailOnNotFound)
          .describe(RAW_SECRETS.UPDATE.mode),
        secrets: z
          .object({
            secretKey: SecretNameSchema.describe(RAW_SECRETS.UPDATE.secretName),
            secretValue: z
              .string()
              .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
              .optional()
              .describe(RAW_SECRETS.UPDATE.secretValue),
            secretPath: z
              .string()
              .trim()
              .transform(removeTrailingSlash)
              .optional()
              .describe(RAW_SECRETS.UPDATE.secretPath),
            secretComment: z.string().trim().optional().describe(RAW_SECRETS.UPDATE.secretComment),
            skipMultilineEncoding: z.boolean().optional().describe(RAW_SECRETS.UPDATE.skipMultilineEncoding),
            newSecretName: SecretNameSchema.optional().describe(RAW_SECRETS.UPDATE.newSecretName),
            tagIds: z.string().array().optional().describe(RAW_SECRETS.UPDATE.tagIds),
            secretReminderNote: z
              .string()
              .max(1024, "Secret reminder note cannot exceed 1024 characters")
              .optional()
              .nullable()
              .describe(RAW_SECRETS.UPDATE.secretReminderNote),
            secretMetadata: ResourceMetadataWithEncryptionSchema.optional(),
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
            secrets: secretRawSchema.extend({ secretValueHidden: z.boolean() }).array()
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
        secrets: inputSecrets,
        mode: req.body.mode
      });
      if (secretOperation.type === SecretProtectionType.Approval) {
        await server.services.auditLog.createAuditLog({
          projectId: req.body.workspaceId,
          ...req.auditLogInfo,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: secretOperation.approval.committerUserId,
              secretApprovalRequestId: secretOperation.approval.id,
              secretApprovalRequestSlug: secretOperation.approval.slug,
              secretPath,
              environment,
              secrets: inputSecrets.map((secret) => ({
                secretKey: secret.secretKey,
                secretPath: secret.secretPath
              })),
              eventType: SecretApprovalEvent.UpdateMany
            }
          }
        });
        return { approval: secretOperation.approval };
      }
      const { secrets } = secretOperation;
      const secretMetadataMap = new Map(
        inputSecrets.map(({ secretKey, secretMetadata }) => [secretKey, secretMetadata])
      );

      await server.services.auditLog.createAuditLog({
        projectId: secrets[0].workspace,
        ...req.auditLogInfo,
        event: {
          type: EventType.UPDATE_SECRETS,
          metadata: {
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            secrets: secrets
              .filter((el) => el.version > 1)
              .map((secret) => ({
                secretId: secret.id,
                secretPath: secret.secretPath,
                secretKey: secret.secretKey,
                secretVersion: secret.version,
                secretMetadata: secretMetadataMap.get(secret.secretKey)?.map((item) => ({
                  key: item.key,
                  isEncrypted: item.isEncrypted,
                  value: item.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : item.value
                })),
                secretTags: secret.tags?.map((tag) => tag.name)
              }))
          }
        }
      });
      const createdSecrets = secrets.filter((el) => el.version === 1);
      if (createdSecrets.length) {
        await server.services.auditLog.createAuditLog({
          projectId: secrets[0].workspace,
          ...req.auditLogInfo,
          event: {
            type: EventType.CREATE_SECRETS,
            metadata: {
              environment: req.body.environment,
              secretPath: req.body.secretPath,
              secrets: createdSecrets.map((secret) => ({
                secretId: secret.id,
                secretPath: secret.secretPath,
                secretKey: secret.secretKey,
                secretVersion: secret.version,
                secretMetadata: secretMetadataMap.get(secret.secretKey)?.map((item) => ({
                  key: item.key,
                  isEncrypted: item.isEncrypted,
                  value: item.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : item.value
                })),
                secretTags: secret.tags?.map((tag) => tag.name)
              }))
            }
          }
        });
      }

      await server.services.telemetry.sendPostHogEvents({
        event: PostHogEventTypes.SecretUpdated,
        distinctId: getTelemetryDistinctId(req),
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: secrets.length,
          projectId: secrets[0].workspace,
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
      hide: false,
      tags: [ApiDocsTags.Secrets],
      description: "Delete many secrets",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectSlug: z.string().trim().optional().describe(RAW_SECRETS.DELETE.projectSlug),
        workspaceId: z.string().trim().optional().describe(RAW_SECRETS.DELETE.projectId),
        environment: z.string().trim().describe(RAW_SECRETS.DELETE.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(RAW_SECRETS.DELETE.secretPath),
        secrets: z
          .object({
            secretKey: z.string().describe(RAW_SECRETS.DELETE.secretName),
            type: z.nativeEnum(SecretType).default(SecretType.Shared)
          })
          .array()
          .min(1)
      }),
      response: {
        200: z.union([
          z.object({
            secrets: secretRawSchema
              .extend({
                secretValueHidden: z.boolean()
              })
              .array()
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
        await server.services.auditLog.createAuditLog({
          projectId: req.body.workspaceId,
          ...req.auditLogInfo,
          event: {
            type: EventType.SECRET_APPROVAL_REQUEST,
            metadata: {
              committedBy: secretOperation.approval.committerUserId,
              secretApprovalRequestId: secretOperation.approval.id,
              secretApprovalRequestSlug: secretOperation.approval.slug,
              secretPath,
              environment,
              secrets: inputSecrets.map((secret) => ({
                secretKey: secret.secretKey
              })),
              eventType: SecretApprovalEvent.DeleteMany
            }
          }
        });

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
        organizationId: req.permission.orgId,
        properties: {
          numberOfSecrets: secrets.length,
          projectId: secrets[0].workspace,
          environment: req.body.environment,
          secretPath: req.body.secretPath,
          channel: getUserAgentType(req.headers["user-agent"]),
          ...req.auditLogInfo
        }
      });
      return { secrets };
    }
  });
};
