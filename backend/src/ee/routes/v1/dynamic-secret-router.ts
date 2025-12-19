import { z } from "zod";

import { DynamicSecretLeasesSchema } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { DynamicSecretProviderSchema } from "@app/ee/services/dynamic-secret/providers/models";
import { ApiDocsTags, DYNAMIC_SECRETS } from "@app/lib/api-docs";
import { removeTrailingSlash } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { isValidHandleBarTemplate } from "@app/lib/template/validate-handlebars";
import { CharacterType, characterValidator } from "@app/lib/validator/validate-string";
import { readLimit, writeLimit } from "@app/server/config/rateLimiter";
import { slugSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { SanitizedDynamicSecretSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { ResourceMetadataSchema } from "@app/services/resource-metadata/resource-metadata-schema";

const validateUsernameTemplateCharacters = characterValidator([
  CharacterType.AlphaNumeric,
  CharacterType.Underscore,
  CharacterType.Hyphen,
  CharacterType.OpenBrace,
  CharacterType.CloseBrace,
  CharacterType.CloseBracket,
  CharacterType.OpenBracket,
  CharacterType.Fullstop,
  CharacterType.SingleQuote,
  CharacterType.Spaces,
  CharacterType.Pipe
]);

const userTemplateSchema = z
  .string()
  .trim()
  .max(255)
  .refine((el) => validateUsernameTemplateCharacters(el))
  .refine((el) =>
    isValidHandleBarTemplate(el, {
      allowedExpressions: (val) => ["randomUsername", "unixTimestamp", "identity.name"].includes(val)
    })
  );

export const registerDynamicSecretRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "POST",
    url: "/",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.CREATE.projectSlug),
        provider: DynamicSecretProviderSchema.describe(DYNAMIC_SECRETS.CREATE.provider),
        defaultTTL: z
          .string()
          .describe(DYNAMIC_SECRETS.CREATE.defaultTTL)
          .superRefine((val, ctx) => {
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > ms("10y"))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
          }),
        maxTTL: z
          .string()
          .describe(DYNAMIC_SECRETS.CREATE.maxTTL)
          .optional()
          .superRefine((val, ctx) => {
            if (!val) return;
            const valMs = ms(val);
            if (valMs < 60 * 1000)
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
            if (valMs > ms("10y"))
              ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
          })
          .nullable(),
        path: z.string().describe(DYNAMIC_SECRETS.CREATE.path).trim().default("/").transform(removeTrailingSlash),
        environmentSlug: z.string().describe(DYNAMIC_SECRETS.CREATE.environmentSlug).min(1),
        name: slugSchema({ min: 1, max: 64, field: "Name" }).describe(DYNAMIC_SECRETS.CREATE.name),
        metadata: ResourceMetadataSchema.optional(),
        usernameTemplate: userTemplateSchema.optional()
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema.extend({
            inputs: z.unknown()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.create({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dynamicSecretCfg.projectId,
        event: {
          type: EventType.CREATE_DYNAMIC_SECRET,
          metadata: {
            dynamicSecretName: dynamicSecretCfg.name,
            dynamicSecretType: dynamicSecretCfg.type,
            dynamicSecretId: dynamicSecretCfg.id,
            defaultTTL: dynamicSecretCfg.defaultTTL,
            maxTTL: dynamicSecretCfg.maxTTL,
            gatewayV2Id: dynamicSecretCfg.gatewayV2Id,
            usernameTemplate: dynamicSecretCfg.usernameTemplate,
            environment: dynamicSecretCfg.environment,
            secretPath: dynamicSecretCfg.secretPath,
            projectId: dynamicSecretCfg.projectId
          }
        }
      });

      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    method: "PATCH",
    url: "/:name",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        name: z.string().toLowerCase().describe(DYNAMIC_SECRETS.UPDATE.name)
      }),
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.UPDATE.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.UPDATE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.UPDATE.environmentSlug),
        data: z.object({
          inputs: z.any().optional().describe(DYNAMIC_SECRETS.UPDATE.inputs),
          defaultTTL: z
            .string()
            .describe(DYNAMIC_SECRETS.UPDATE.defaultTTL)
            .optional()
            .superRefine((val, ctx) => {
              if (!val) return;
              const valMs = ms(val);
              if (valMs < 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
              if (valMs > ms("10y"))
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
            }),
          maxTTL: z
            .string()
            .describe(DYNAMIC_SECRETS.UPDATE.maxTTL)
            .optional()
            .superRefine((val, ctx) => {
              if (!val) return;
              const valMs = ms(val);
              if (valMs < 60 * 1000)
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be a greater than 1min" });
              if (valMs > ms("10y"))
                ctx.addIssue({ code: z.ZodIssueCode.custom, message: "TTL must be less than 10 years" });
            })
            .nullable(),
          newName: z.string().describe(DYNAMIC_SECRETS.UPDATE.newName).optional(),
          metadata: ResourceMetadataSchema.optional(),
          usernameTemplate: userTemplateSchema.nullable().optional()
        })
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema.extend({
            inputs: z.unknown()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dynamicSecret, updatedFields, projectId, environment, secretPath } =
        await server.services.dynamicSecret.updateByName({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.params.name,
          path: req.body.path,
          projectSlug: req.body.projectSlug,
          environmentSlug: req.body.environmentSlug,
          ...req.body.data
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.UPDATE_DYNAMIC_SECRET,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretType: dynamicSecret.type,
            dynamicSecretId: dynamicSecret.id,
            environment,
            secretPath,
            projectId,
            updatedFields
          }
        }
      });
      return { dynamicSecret };
    }
  });

  server.route({
    method: "DELETE",
    url: "/:name",
    config: {
      rateLimit: writeLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        name: z.string().toLowerCase().describe(DYNAMIC_SECRETS.DELETE.name)
      }),
      body: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.DELETE.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.DELETE.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.DELETE.environmentSlug),
        isForced: z.boolean().default(false).describe(DYNAMIC_SECRETS.DELETE.isForced)
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.deleteByName({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name,
        ...req.body
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dynamicSecretCfg.projectId,
        event: {
          type: EventType.DELETE_DYNAMIC_SECRET,
          metadata: {
            dynamicSecretName: dynamicSecretCfg.name,
            dynamicSecretType: dynamicSecretCfg.type,
            dynamicSecretId: dynamicSecretCfg.id,
            environment: dynamicSecretCfg.environment,
            secretPath: dynamicSecretCfg.secretPath,
            projectId: dynamicSecretCfg.projectId
          }
        }
      });

      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/:name",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        name: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.name)
      }),
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.GET_BY_NAME.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.GET_BY_NAME.environmentSlug)
      }),
      response: {
        200: z.object({
          dynamicSecret: SanitizedDynamicSecretSchema.extend({
            inputs: z.unknown()
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const dynamicSecretCfg = await server.services.dynamicSecret.getDetails({
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        name: req.params.name,
        ...req.query
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: dynamicSecretCfg.projectId,
        event: {
          type: EventType.GET_DYNAMIC_SECRET,
          metadata: {
            dynamicSecretName: dynamicSecretCfg.name,
            dynamicSecretType: dynamicSecretCfg.type,
            dynamicSecretId: dynamicSecretCfg.id,
            environment: dynamicSecretCfg.environment,
            secretPath: dynamicSecretCfg.secretPath,
            projectId: dynamicSecretCfg.projectId
          }
        }
      });

      return { dynamicSecret: dynamicSecretCfg };
    }
  });

  server.route({
    url: "/",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST.projectSlug),
        path: z.string().trim().default("/").transform(removeTrailingSlash).describe(DYNAMIC_SECRETS.LIST.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST.environmentSlug)
      }),
      response: {
        200: z.object({
          dynamicSecrets: SanitizedDynamicSecretSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { dynamicSecrets, environment, secretPath, projectId } =
        await server.services.dynamicSecret.listDynamicSecretsByEnv({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.LIST_DYNAMIC_SECRETS,
          metadata: {
            environment,
            secretPath,
            projectId
          }
        }
      });

      return { dynamicSecrets };
    }
  });

  server.route({
    url: "/:name/leases",
    method: "GET",
    config: {
      rateLimit: readLimit
    },
    schema: {
      hide: false,
      tags: [ApiDocsTags.DynamicSecrets],
      params: z.object({
        name: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEASES_BY_NAME.name)
      }),
      querystring: z.object({
        projectSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEASES_BY_NAME.projectSlug),
        path: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DYNAMIC_SECRETS.LIST_LEASES_BY_NAME.path),
        environmentSlug: z.string().min(1).describe(DYNAMIC_SECRETS.LIST_LEASES_BY_NAME.environmentSlug)
      }),
      response: {
        200: z.object({
          leases: DynamicSecretLeasesSchema.array()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const { leases, dynamicSecret, projectId, environment, secretPath } =
        await server.services.dynamicSecretLease.listLeases({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          name: req.params.name,
          ...req.query
        });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId,
        event: {
          type: EventType.LIST_DYNAMIC_SECRET_LEASES,
          metadata: {
            dynamicSecretName: dynamicSecret.name,
            dynamicSecretType: dynamicSecret.type,
            dynamicSecretId: dynamicSecret.id,
            environment,
            secretPath,
            projectId,
            leaseCount: leases.length
          }
        }
      });

      return { leases };
    }
  });

  server.route({
    method: "POST",
    url: "/entra-id/users",
    config: {
      rateLimit: readLimit
    },
    schema: {
      body: z.object({
        tenantId: z.string().min(1).describe("The tenant ID of the Azure Entra ID"),
        applicationId: z.string().min(1).describe("The application ID of the Azure Entra ID App Registration"),
        clientSecret: z.string().min(1).describe("The client secret of the Azure Entra ID App Registration")
      }),
      response: {
        200: z
          .object({
            name: z.string().min(1).describe("The name of the user"),
            id: z.string().min(1).describe("The ID of the user"),
            email: z.string().min(1).describe("The email of the user")
          })
          .array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT, AuthMode.IDENTITY_ACCESS_TOKEN]),
    handler: async (req) => {
      const data = await server.services.dynamicSecret.fetchAzureEntraIdUsers({
        tenantId: req.body.tenantId,
        applicationId: req.body.applicationId,
        clientSecret: req.body.clientSecret
      });
      return data;
    }
  });
};
