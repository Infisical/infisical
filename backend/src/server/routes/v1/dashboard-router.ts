import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { SecretFoldersSchema, SecretImportsSchema, UsersSchema } from "@app/db/schemas";
import { EventType, UserAgentType } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectPermissionSecretActions } from "@app/ee/services/permission/project-permission";
import { SecretRotationV2Schema } from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-union-schema";
import { DASHBOARD } from "@app/lib/api-docs";
import { BadRequestError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { OrderByDirection } from "@app/lib/types";
import { secretsLimit } from "@app/server/config/rateLimiter";
import { getTelemetryDistinctId } from "@app/server/lib/telemetry";
import { getUserAgentType } from "@app/server/plugins/audit-log";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import {
  booleanSchema,
  SanitizedDynamicSecretSchema,
  SanitizedTagSchema,
  secretRawSchema
} from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { ResourceMetadataSchema } from "@app/services/resource-metadata/resource-metadata-schema";
import { SecretsOrderBy } from "@app/services/secret/secret-types";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";

const MAX_DEEP_SEARCH_LIMIT = 500; // arbitrary limit to prevent excessive results

const parseSecretPathSearch = (search?: string) => {
  if (!search)
    return {
      searchName: "",
      searchPath: ""
    };

  if (!search.includes("/"))
    return {
      searchName: search,
      searchPath: ""
    };

  if (search === "/")
    return {
      searchName: "",
      searchPath: "/"
    };

  const [searchName, ...searchPathSegments] = search.split("/").reverse();
  let searchPath = removeTrailingSlash(searchPathSegments.reverse().join("/").toLowerCase());
  if (!searchPath.startsWith("/")) searchPath = `/${searchPath}`;

  return {
    searchName,
    searchPath
  };
};

export const registerDashboardRouter = async (server: FastifyZodProvider) => {
  server.route({
    method: "GET",
    url: "/secrets-overview",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "List project secrets overview",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        projectId: z.string().trim().describe(DASHBOARD.SECRET_OVERVIEW_LIST.projectId),
        environments: z
          .string()
          .trim()
          .transform(decodeURIComponent)
          .describe(DASHBOARD.SECRET_OVERVIEW_LIST.environments),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DASHBOARD.SECRET_OVERVIEW_LIST.secretPath),
        offset: z.coerce.number().min(0).optional().default(0).describe(DASHBOARD.SECRET_OVERVIEW_LIST.offset),
        limit: z.coerce.number().min(1).max(100).optional().default(100).describe(DASHBOARD.SECRET_OVERVIEW_LIST.limit),
        orderBy: z
          .nativeEnum(SecretsOrderBy)
          .default(SecretsOrderBy.Name)
          .describe(DASHBOARD.SECRET_OVERVIEW_LIST.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(DASHBOARD.SECRET_OVERVIEW_LIST.orderDirection)
          .optional(),
        search: z.string().trim().describe(DASHBOARD.SECRET_OVERVIEW_LIST.search).optional(),
        includeSecrets: booleanSchema.describe(DASHBOARD.SECRET_OVERVIEW_LIST.includeSecrets),
        includeFolders: booleanSchema.describe(DASHBOARD.SECRET_OVERVIEW_LIST.includeFolders),
        includeImports: booleanSchema.describe(DASHBOARD.SECRET_OVERVIEW_LIST.includeImports),
        includeSecretRotations: booleanSchema.describe(DASHBOARD.SECRET_OVERVIEW_LIST.includeSecretRotations),
        includeDynamicSecrets: booleanSchema.describe(DASHBOARD.SECRET_OVERVIEW_LIST.includeDynamicSecrets)
      }),
      response: {
        200: z.object({
          folders: SecretFoldersSchema.extend({ environment: z.string() }).array().optional(),
          dynamicSecrets: SanitizedDynamicSecretSchema.extend({ environment: z.string() }).array().optional(),
          secretRotations: z
            .intersection(
              SecretRotationV2Schema,
              z.object({
                secrets: secretRawSchema
                  .extend({
                    secretValueHidden: z.boolean(),
                    secretPath: z.string().optional(),
                    secretMetadata: ResourceMetadataSchema.optional(),
                    tags: SanitizedTagSchema.array().optional()
                  })
                  .nullable()
                  .array()
              })
            )
            .array()
            .optional(),
          secrets: secretRawSchema
            .extend({
              secretValueHidden: z.boolean(),
              secretPath: z.string().optional(),
              secretMetadata: ResourceMetadataSchema.optional(),
              tags: SanitizedTagSchema.array().optional()
            })
            .array()
            .optional(),
          imports: SecretImportsSchema.omit({ importEnv: true })
            .extend({
              importEnv: z.object({ name: z.string(), slug: z.string(), id: z.string() }),
              environment: z.string()
            })
            .array()
            .optional(),
          importedByEnvs: z
            .object({
              environment: z.string(),
              importedBy: z
                .object({
                  environment: z.object({
                    name: z.string(),
                    slug: z.string()
                  }),
                  folders: z
                    .object({
                      name: z.string(),
                      isImported: z.boolean(),
                      secrets: z
                        .object({
                          secretId: z.string(),
                          referencedSecretKey: z.string(),
                          referencedSecretEnv: z.string()
                        })
                        .array()
                        .optional()
                    })
                    .array()
                })
                .array()
                .optional()
            })
            .array()
            .optional(),
          usedBySecretSyncs: z
            .object({
              name: z.string(),
              destination: z.string(),
              environment: z.string(),
              id: z.string(),
              path: z.string()
            })
            .array()
            .optional(),
          totalFolderCount: z.number().optional(),
          totalDynamicSecretCount: z.number().optional(),
          totalSecretCount: z.number().optional(),
          totalImportCount: z.number().optional(),
          totalSecretRotationCount: z.number().optional(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        secretPath,
        projectId,
        limit,
        offset,
        search,
        orderBy,
        orderDirection,
        includeFolders,
        includeSecrets,
        includeImports,
        includeDynamicSecrets,
        includeSecretRotations
      } = req.query;

      const environments = req.query.environments.split(",");

      if (!projectId || environments.length === 0)
        throw new BadRequestError({ message: "Missing workspace id or environment(s)" });

      const { shouldUseSecretV2Bridge } = await server.services.projectBot.getBotKey(projectId);

      // prevent older projects from accessing endpoint
      if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

      let remainingLimit = limit;
      let adjustedOffset = offset;

      let imports: Awaited<ReturnType<typeof server.services.secretImport.getImportsMultiEnv>> | undefined;
      let folders: Awaited<ReturnType<typeof server.services.folder.getFoldersMultiEnv>> | undefined;
      let secrets: Awaited<ReturnType<typeof server.services.secret.getSecretsRawMultiEnv>> | undefined;
      let dynamicSecrets:
        | Awaited<ReturnType<typeof server.services.dynamicSecret.listDynamicSecretsByEnvs>>
        | undefined;
      let secretRotations:
        | Awaited<ReturnType<typeof server.services.secretRotationV2.getDashboardSecretRotations>>
        | undefined;

      let totalFolderCount: number | undefined;
      let totalDynamicSecretCount: number | undefined;
      let totalSecretCount: number | undefined;
      let totalImportCount: number | undefined;
      let totalSecretRotationCount: number | undefined;

      if (includeImports) {
        totalImportCount = await server.services.secretImport.getProjectImportMultiEnvCount({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          projectId,
          environments,
          path: secretPath,
          search
        });

        if (remainingLimit > 0 && totalImportCount > adjustedOffset) {
          imports = await server.services.secretImport.getImportsMultiEnv({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            projectId,
            environments,
            path: secretPath,
            search,
            limit: remainingLimit,
            offset: adjustedOffset
          });

          await server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            projectId: req.query.projectId,
            event: {
              type: EventType.GET_SECRET_IMPORTS,
              metadata: {
                environment: environments.join(","),
                folderId: imports?.[0]?.folderId,
                numberOfImports: imports.length
              }
            }
          });

          remainingLimit -= imports.length;
          adjustedOffset = 0;
        } else {
          adjustedOffset = Math.max(0, adjustedOffset - totalImportCount);
        }
      }

      if (includeFolders) {
        // this is the unique count, ie duplicate folders across envs only count as 1
        totalFolderCount = await server.services.folder.getProjectFolderCount({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          projectId: req.query.projectId,
          path: secretPath,
          environments,
          search
        });

        if (remainingLimit > 0 && totalFolderCount > adjustedOffset) {
          folders = await server.services.folder.getFoldersMultiEnv({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            projectId,
            environments,
            path: secretPath,
            orderBy,
            orderDirection,
            search,
            limit: remainingLimit,
            offset: adjustedOffset
          });

          // get the count of unique folder names to properly adjust remaining limit
          const uniqueFolderCount = new Set(folders.map((folder) => folder.name)).size;

          remainingLimit -= uniqueFolderCount;
          adjustedOffset = 0;
        } else {
          adjustedOffset = Math.max(0, adjustedOffset - totalFolderCount);
        }
      }

      if (!includeDynamicSecrets && !includeSecrets)
        return {
          folders,
          totalFolderCount,
          totalCount: totalFolderCount ?? 0
        };

      if (includeDynamicSecrets) {
        // this is the unique count, ie duplicate secrets across envs only count as 1
        totalDynamicSecretCount = await server.services.dynamicSecret.getCountMultiEnv({
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          projectId,
          search,
          environmentSlugs: environments,
          path: secretPath,
          isInternal: true
        });

        if (remainingLimit > 0 && totalDynamicSecretCount > adjustedOffset) {
          dynamicSecrets = await server.services.dynamicSecret.listDynamicSecretsByEnvs({
            actor: req.permission.type,
            actorId: req.permission.id,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            projectId,
            search,
            orderBy,
            orderDirection,
            environmentSlugs: environments,
            path: secretPath,
            limit: remainingLimit,
            offset: adjustedOffset,
            isInternal: true
          });

          // get the count of unique dynamic secret names to properly adjust remaining limit
          const uniqueDynamicSecretsCount = new Set(dynamicSecrets.map((dynamicSecret) => dynamicSecret.name)).size;

          remainingLimit -= uniqueDynamicSecretsCount;
          adjustedOffset = 0;
        } else {
          adjustedOffset = Math.max(0, adjustedOffset - totalDynamicSecretCount);
        }
      }

      if (includeSecretRotations) {
        totalSecretRotationCount = await server.services.secretRotationV2.getDashboardSecretRotationCount(
          {
            projectId,
            search,
            environments,
            secretPath
          },
          req.permission
        );

        if (remainingLimit > 0 && totalSecretRotationCount > adjustedOffset) {
          secretRotations = await server.services.secretRotationV2.getDashboardSecretRotations(
            {
              projectId,
              search,
              orderBy,
              orderDirection,
              environments,
              secretPath,
              limit: remainingLimit,
              offset: adjustedOffset
            },
            req.permission
          );

          await server.services.auditLog.createAuditLog({
            projectId,
            ...req.auditLogInfo,
            event: {
              type: EventType.GET_SECRET_ROTATIONS,
              metadata: {
                count: secretRotations.length,
                rotationIds: secretRotations.map((rotation) => rotation.id),
                secretPath,
                environment: environments.join(",")
              }
            }
          });

          // get the count of unique secret rotation names to properly adjust remaining limit
          const uniqueSecretRotationCount = new Set(secretRotations.map((rotation) => rotation.name)).size;

          remainingLimit -= uniqueSecretRotationCount;
          adjustedOffset = 0;
        } else {
          adjustedOffset = Math.max(0, adjustedOffset - totalSecretRotationCount);
        }
      }

      if (includeSecrets) {
        // this is the unique count, ie duplicate secrets across envs only count as 1
        totalSecretCount = await server.services.secret.getSecretsCountMultiEnv({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorOrgId: req.permission.orgId,
          environments,
          actorAuthMethod: req.permission.authMethod,
          projectId,
          path: secretPath,
          search,
          isInternal: true
        });

        if (remainingLimit > 0 && totalSecretCount > adjustedOffset) {
          secrets = await server.services.secret.getSecretsRawMultiEnv({
            viewSecretValue: true,
            actorId: req.permission.id,
            actor: req.permission.type,
            actorOrgId: req.permission.orgId,
            environments,
            actorAuthMethod: req.permission.authMethod,
            projectId,
            path: secretPath,
            orderBy,
            orderDirection,
            search,
            limit: remainingLimit,
            offset: adjustedOffset,
            isInternal: true
          });
        }
      }

      if (secrets?.length || secretRotations?.length) {
        for await (const environment of environments) {
          const secretCountFromEnv =
            (secrets?.filter((secret) => secret.environment === environment).length ?? 0) +
            (secretRotations
              ?.filter((rotation) => rotation.environment.slug === environment)
              .flatMap((rotation) => rotation.secrets.filter((secret) => Boolean(secret))).length ?? 0);

          if (secretCountFromEnv) {
            await server.services.auditLog.createAuditLog({
              projectId,
              ...req.auditLogInfo,
              event: {
                type: EventType.GET_SECRETS,
                metadata: {
                  environment,
                  secretPath,
                  numberOfSecrets: secretCountFromEnv
                }
              }
            });

            if (getUserAgentType(req.headers["user-agent"]) !== UserAgentType.K8_OPERATOR) {
              await server.services.telemetry.sendPostHogEvents({
                event: PostHogEventTypes.SecretPulled,
                distinctId: getTelemetryDistinctId(req),
                organizationId: req.permission.orgId,
                properties: {
                  numberOfSecrets: secretCountFromEnv,
                  workspaceId: projectId,
                  environment,
                  secretPath,
                  channel: getUserAgentType(req.headers["user-agent"]),
                  ...req.auditLogInfo
                }
              });
            }
          }
        }
      }

      const importedByEnvs = [];

      for await (const environment of environments) {
        const importedBy = await server.services.secretImport.getFolderIsImportedBy({
          path: secretPath,
          environment,
          projectId,
          actor: req.permission.type,
          actorId: req.permission.id,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          secrets: secrets?.filter((s) => s.environment === environment)
        });

        if (importedBy) {
          importedByEnvs.push({
            environment,
            importedBy
          });
        }
      }

      const usedBySecretSyncs: { name: string; destination: string; environment: string; id: string; path: string }[] =
        [];
      for await (const environment of environments) {
        const secretSyncs = await server.services.secretSync.listSecretSyncsBySecretPath(
          { projectId, secretPath, environment },
          req.permission
        );
        secretSyncs.forEach((sync) => {
          usedBySecretSyncs.push({
            name: sync.name,
            destination: sync.destination,
            environment,
            id: sync.id,
            path: sync.folder?.path || "/"
          });
        });
      }

      return {
        folders,
        dynamicSecrets,
        secrets,
        imports,
        secretRotations,
        totalFolderCount,
        totalDynamicSecretCount,
        totalImportCount,
        totalSecretCount,
        totalSecretRotationCount,
        importedByEnvs,
        usedBySecretSyncs,
        totalCount:
          (totalFolderCount ?? 0) +
          (totalDynamicSecretCount ?? 0) +
          (totalSecretCount ?? 0) +
          (totalImportCount ?? 0) +
          (totalSecretRotationCount ?? 0)
      };
    }
  });

  server.route({
    method: "GET",
    url: "/secrets-details",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      description: "List project secrets details",
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        projectId: z.string().trim().describe(DASHBOARD.SECRET_DETAILS_LIST.projectId),
        environment: z.string().trim().describe(DASHBOARD.SECRET_DETAILS_LIST.environment),
        secretPath: z
          .string()
          .trim()
          .default("/")
          .transform(removeTrailingSlash)
          .describe(DASHBOARD.SECRET_DETAILS_LIST.secretPath),
        offset: z.coerce.number().min(0).optional().default(0).describe(DASHBOARD.SECRET_DETAILS_LIST.offset),
        limit: z.coerce.number().min(1).max(100).optional().default(100).describe(DASHBOARD.SECRET_DETAILS_LIST.limit),
        orderBy: z
          .nativeEnum(SecretsOrderBy)
          .default(SecretsOrderBy.Name)
          .describe(DASHBOARD.SECRET_DETAILS_LIST.orderBy)
          .optional(),
        orderDirection: z
          .nativeEnum(OrderByDirection)
          .default(OrderByDirection.ASC)
          .describe(DASHBOARD.SECRET_DETAILS_LIST.orderDirection)
          .optional(),
        search: z.string().trim().describe(DASHBOARD.SECRET_DETAILS_LIST.search).optional(),
        tags: z.string().trim().transform(decodeURIComponent).describe(DASHBOARD.SECRET_DETAILS_LIST.tags).optional(),
        viewSecretValue: booleanSchema.default(true),
        includeSecrets: booleanSchema.describe(DASHBOARD.SECRET_DETAILS_LIST.includeSecrets),
        includeFolders: booleanSchema.describe(DASHBOARD.SECRET_DETAILS_LIST.includeFolders),
        includeDynamicSecrets: booleanSchema.describe(DASHBOARD.SECRET_DETAILS_LIST.includeDynamicSecrets),
        includeImports: booleanSchema.describe(DASHBOARD.SECRET_DETAILS_LIST.includeImports),
        includeSecretRotations: booleanSchema.describe(DASHBOARD.SECRET_DETAILS_LIST.includeSecretRotations)
      }),
      response: {
        200: z.object({
          imports: SecretImportsSchema.omit({ importEnv: true })
            .extend({
              importEnv: z.object({ name: z.string(), slug: z.string(), id: z.string() })
            })
            .array()
            .optional(),
          folders: SecretFoldersSchema.array().optional(),
          dynamicSecrets: SanitizedDynamicSecretSchema.array().optional(),
          secretRotations: z
            .intersection(
              SecretRotationV2Schema,
              z.object({
                secrets: secretRawSchema
                  .extend({
                    secretValueHidden: z.boolean(),
                    secretPath: z.string().optional(),
                    secretMetadata: ResourceMetadataSchema.optional(),
                    tags: SanitizedTagSchema.array().optional()
                  })
                  .nullable()
                  .array()
              })
            )
            .array()
            .optional(),
          secrets: secretRawSchema
            .extend({
              secretReminderRecipients: z
                .object({
                  user: UsersSchema.pick({ id: true, email: true, username: true }),
                  id: z.string()
                })
                .array(),
              secretValueHidden: z.boolean(),
              secretPath: z.string().optional(),
              secretMetadata: ResourceMetadataSchema.optional(),
              tags: SanitizedTagSchema.array().optional()
            })
            .array()
            .optional(),
          totalImportCount: z.number().optional(),
          totalFolderCount: z.number().optional(),
          totalDynamicSecretCount: z.number().optional(),
          totalSecretCount: z.number().optional(),
          usedBySecretSyncs: z
            .object({
              name: z.string(),
              destination: z.string(),
              environment: z.string(),
              id: z.string(),
              path: z.string()
            })
            .array()
            .optional(),
          importedBy: z
            .object({
              environment: z.object({
                name: z.string(),
                slug: z.string()
              }),
              folders: z
                .object({
                  name: z.string(),
                  isImported: z.boolean(),
                  secrets: z
                    .object({
                      secretId: z.string(),
                      referencedSecretKey: z.string(),
                      referencedSecretEnv: z.string()
                    })
                    .array()
                    .optional()
                })
                .array()
            })
            .array()
            .optional(),
          totalSecretRotationCount: z.number().optional(),
          totalCount: z.number()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const {
        secretPath,
        environment,
        projectId,
        limit,
        offset,
        search,
        orderBy,
        orderDirection,
        includeFolders,
        includeSecrets,
        includeDynamicSecrets,
        includeImports,
        includeSecretRotations
      } = req.query;

      if (!projectId || !environment) throw new BadRequestError({ message: "Missing workspace id or environment" });

      const { shouldUseSecretV2Bridge } = await server.services.projectBot.getBotKey(projectId);

      // prevent older projects from accessing endpoint
      if (!shouldUseSecretV2Bridge) throw new BadRequestError({ message: "Project version not supported" });

      const tags = req.query.tags?.split(",") ?? [];

      let remainingLimit = limit;
      let adjustedOffset = offset;

      let imports: Awaited<ReturnType<typeof server.services.secretImport.getImports>> | undefined;
      let folders: Awaited<ReturnType<typeof server.services.folder.getFolders>> | undefined;
      let secrets: Awaited<ReturnType<typeof server.services.secret.getSecretsRaw>>["secrets"] | undefined;
      let dynamicSecrets: Awaited<ReturnType<typeof server.services.dynamicSecret.listDynamicSecretsByEnv>> | undefined;
      let secretRotations:
        | Awaited<ReturnType<typeof server.services.secretRotationV2.getDashboardSecretRotations>>
        | undefined;

      let totalImportCount: number | undefined;
      let totalFolderCount: number | undefined;
      let totalDynamicSecretCount: number | undefined;
      let totalSecretCount: number | undefined;
      let totalSecretRotationCount: number | undefined;

      if (includeImports) {
        totalImportCount = await server.services.secretImport.getProjectImportCount({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          projectId,
          environment,
          path: secretPath
          // search scott: removing for now because this prevents searching imported secrets which are fetched separately client side
        });

        if (remainingLimit > 0 && totalImportCount > adjustedOffset) {
          imports = await server.services.secretImport.getImports({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            projectId,
            environment,
            path: secretPath,
            // search scott: removing for now because this prevents searching imported secrets which are fetched separately client side
            limit: remainingLimit,
            offset: adjustedOffset
          });

          await server.services.auditLog.createAuditLog({
            ...req.auditLogInfo,
            projectId: req.query.projectId,
            event: {
              type: EventType.GET_SECRET_IMPORTS,
              metadata: {
                environment,
                folderId: imports?.[0]?.folderId,
                numberOfImports: imports.length
              }
            }
          });

          remainingLimit -= imports.length;
          adjustedOffset = 0;
        } else {
          adjustedOffset = Math.max(0, adjustedOffset - totalImportCount);
        }
      }

      if (includeFolders) {
        totalFolderCount = await server.services.folder.getProjectFolderCount({
          actorId: req.permission.id,
          actor: req.permission.type,
          actorAuthMethod: req.permission.authMethod,
          actorOrgId: req.permission.orgId,
          projectId,
          path: secretPath,
          environments: [environment],
          search
        });

        if (remainingLimit > 0 && totalFolderCount > adjustedOffset) {
          folders = await server.services.folder.getFolders({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            projectId,
            environment,
            path: secretPath,
            orderBy,
            orderDirection,
            search,
            limit: remainingLimit,
            offset: adjustedOffset
          });

          remainingLimit -= folders.length;
          adjustedOffset = 0;
        } else {
          adjustedOffset = Math.max(0, adjustedOffset - totalFolderCount);
        }
      }

      if (includeSecretRotations) {
        totalSecretRotationCount = await server.services.secretRotationV2.getDashboardSecretRotationCount(
          {
            projectId,
            search,
            environments: [environment],
            secretPath
          },
          req.permission
        );

        if (remainingLimit > 0 && totalSecretRotationCount > adjustedOffset) {
          secretRotations = await server.services.secretRotationV2.getDashboardSecretRotations(
            {
              projectId,
              search,
              orderBy,
              orderDirection,
              environments: [environment],
              secretPath,
              limit: remainingLimit,
              offset: adjustedOffset
            },
            req.permission
          );

          await server.services.auditLog.createAuditLog({
            projectId,
            ...req.auditLogInfo,
            event: {
              type: EventType.GET_SECRET_ROTATIONS,
              metadata: {
                count: secretRotations.length,
                rotationIds: secretRotations.map((rotation) => rotation.id),
                secretPath,
                environment
              }
            }
          });

          remainingLimit -= secretRotations.length;
          adjustedOffset = 0;
        } else {
          adjustedOffset = Math.max(0, adjustedOffset - totalSecretRotationCount);
        }
      }

      try {
        if (includeDynamicSecrets) {
          totalDynamicSecretCount = await server.services.dynamicSecret.getDynamicSecretCount({
            actor: req.permission.type,
            actorId: req.permission.id,
            actorAuthMethod: req.permission.authMethod,
            actorOrgId: req.permission.orgId,
            projectId,
            search,
            environmentSlug: environment,
            path: secretPath
          });

          if (remainingLimit > 0 && totalDynamicSecretCount > adjustedOffset) {
            dynamicSecrets = await server.services.dynamicSecret.listDynamicSecretsByEnv({
              actor: req.permission.type,
              actorId: req.permission.id,
              actorAuthMethod: req.permission.authMethod,
              actorOrgId: req.permission.orgId,
              projectId,
              search,
              orderBy,
              orderDirection,
              environmentSlug: environment,
              path: secretPath,
              limit: remainingLimit,
              offset: adjustedOffset
            });

            remainingLimit -= dynamicSecrets.length;
            adjustedOffset = 0;
          } else {
            adjustedOffset = Math.max(0, adjustedOffset - totalDynamicSecretCount);
          }
        }
      } catch (error) {
        if (!(error instanceof ForbiddenError)) {
          throw error;
        }
      }

      try {
        if (includeSecrets) {
          totalSecretCount = await server.services.secret.getSecretsCount({
            actorId: req.permission.id,
            actor: req.permission.type,
            actorOrgId: req.permission.orgId,
            environment,
            actorAuthMethod: req.permission.authMethod,
            projectId,
            path: secretPath,
            search,
            tagSlugs: tags
          });

          if (remainingLimit > 0 && totalSecretCount > adjustedOffset) {
            secrets = (
              await server.services.secret.getSecretsRaw({
                actorId: req.permission.id,
                actor: req.permission.type,
                viewSecretValue: req.query.viewSecretValue,
                throwOnMissingReadValuePermission: false,
                actorOrgId: req.permission.orgId,
                environment,
                actorAuthMethod: req.permission.authMethod,
                projectId,
                path: secretPath,
                orderBy,
                orderDirection,
                search,
                limit: remainingLimit,
                offset: adjustedOffset,
                tagSlugs: tags
              })
            ).secrets;
          }
        }
      } catch (error) {
        if (!(error instanceof ForbiddenError)) {
          throw error;
        }
      }

      const importedBy = await server.services.secretImport.getFolderIsImportedBy({
        path: secretPath,
        environment,
        projectId,
        actor: req.permission.type,
        actorId: req.permission.id,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        secrets
      });

      const secretSyncs = await server.services.secretSync.listSecretSyncsBySecretPath(
        { projectId, secretPath, environment },
        req.permission
      );
      const usedBySecretSyncs = secretSyncs.map((sync) => ({
        name: sync.name,
        destination: sync.destination,
        environment: sync.environment?.name || environment,
        id: sync.id,
        path: sync.folder?.path || "/"
      }));

      if (secrets?.length || secretRotations?.length) {
        const secretCount =
          (secrets?.length ?? 0) +
          (secretRotations?.flatMap((rotation) => rotation.secrets.filter((secret) => Boolean(secret))).length ?? 0);

        await server.services.auditLog.createAuditLog({
          projectId,
          ...req.auditLogInfo,
          event: {
            type: EventType.GET_SECRETS,
            metadata: {
              environment,
              secretPath,
              numberOfSecrets: secretCount
            }
          }
        });

        if (getUserAgentType(req.headers["user-agent"]) !== UserAgentType.K8_OPERATOR) {
          await server.services.telemetry.sendPostHogEvents({
            event: PostHogEventTypes.SecretPulled,
            distinctId: getTelemetryDistinctId(req),
            organizationId: req.permission.orgId,
            properties: {
              numberOfSecrets: secretCount,
              workspaceId: projectId,
              environment,
              secretPath,
              channel: getUserAgentType(req.headers["user-agent"]),
              ...req.auditLogInfo
            }
          });
        }
      }

      return {
        imports,
        folders,
        dynamicSecrets,
        secrets,
        secretRotations,
        totalImportCount,
        totalFolderCount,
        totalDynamicSecretCount,
        totalSecretCount,
        totalSecretRotationCount,
        importedBy,
        usedBySecretSyncs,
        totalCount:
          (totalImportCount ?? 0) +
          (totalFolderCount ?? 0) +
          (totalDynamicSecretCount ?? 0) +
          (totalSecretCount ?? 0) +
          (totalSecretRotationCount ?? 0)
      };
    }
  });

  server.route({
    method: "GET",
    url: "/secrets-deep-search",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        projectId: z.string().trim(),
        environments: z.string().trim().transform(decodeURIComponent),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        search: z.string().trim().optional(),
        tags: z.string().trim().transform(decodeURIComponent).optional()
      }),
      response: {
        200: z.object({
          folders: SecretFoldersSchema.extend({ path: z.string() }).array().optional(),
          dynamicSecrets: SanitizedDynamicSecretSchema.extend({ path: z.string(), environment: z.string() })
            .array()
            .optional(),
          secrets: secretRawSchema
            .extend({
              secretValueHidden: z.boolean(),
              secretPath: z.string().optional(),
              secretMetadata: ResourceMetadataSchema.optional(),
              tags: SanitizedTagSchema.array().optional()
            })
            .array()
            .optional(),
          secretRotations: SecretRotationV2Schema.array().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secretPath, projectId, search } = req.query;

      const environments = req.query.environments.split(",").filter((env) => Boolean(env.trim()));
      if (!environments.length) throw new BadRequestError({ message: "One or more environments required" });

      const tags = req.query.tags?.split(",").filter((tag) => Boolean(tag.trim())) ?? [];
      if (!search && !tags.length) throw new BadRequestError({ message: "Search or tags required" });

      const searchHasTags = Boolean(tags.length);

      const allFolders = await server.services.folder.getFoldersDeepByEnvs(
        {
          projectId,
          environments,
          secretPath
        },
        req.permission
      );

      const { searchName, searchPath } = parseSecretPathSearch(search);

      const folderMappings = allFolders.map((folder) => ({
        folderId: folder.id,
        path: folder.path,
        environment: folder.environment
      }));

      const sharedFilters = {
        search: searchName,
        limit: MAX_DEEP_SEARCH_LIMIT,
        orderBy: SecretsOrderBy.Name
      };

      const secrets = await server.services.secret.getSecretsRawByFolderMappings(
        {
          filterByAction: ProjectPermissionSecretActions.DescribeSecret,
          projectId,
          folderMappings,
          filters: {
            ...sharedFilters,
            tagSlugs: tags,
            includeTagsInSearch: true
          }
        },
        req.permission
      );

      const dynamicSecrets = searchHasTags
        ? []
        : await server.services.dynamicSecret.listDynamicSecretsByFolderIds(
            {
              projectId,
              folderMappings,
              filters: sharedFilters
            },
            req.permission
          );

      const secretRotations = searchHasTags
        ? []
        : await server.services.secretRotationV2.getQuickSearchSecretRotations(
            {
              projectId,
              folderMappings,
              filters: sharedFilters
            },
            req.permission
          );

      for await (const environment of environments) {
        const secretCountForEnv = secrets.filter((secret) => secret.environment === environment).length;

        if (secretCountForEnv) {
          await server.services.auditLog.createAuditLog({
            projectId,
            ...req.auditLogInfo,
            event: {
              type: EventType.GET_SECRETS,
              metadata: {
                environment,
                secretPath,
                numberOfSecrets: secretCountForEnv
              }
            }
          });

          if (getUserAgentType(req.headers["user-agent"]) !== UserAgentType.K8_OPERATOR) {
            await server.services.telemetry.sendPostHogEvents({
              event: PostHogEventTypes.SecretPulled,
              distinctId: getTelemetryDistinctId(req),
              organizationId: req.permission.orgId,
              properties: {
                numberOfSecrets: secretCountForEnv,
                workspaceId: projectId,
                environment,
                secretPath,
                channel: getUserAgentType(req.headers["user-agent"]),
                ...req.auditLogInfo
              }
            });
          }
        }

        const secretRotationsFromEnv = secretRotations.filter((rotation) => rotation.environment.slug === environment);

        if (secretRotationsFromEnv.length) {
          await server.services.auditLog.createAuditLog({
            projectId,
            ...req.auditLogInfo,
            event: {
              type: EventType.GET_SECRET_ROTATIONS,
              metadata: {
                count: secretRotationsFromEnv.length,
                rotationIds: secretRotationsFromEnv.map((rotation) => rotation.id),
                secretPath,
                environment
              }
            }
          });
        }
      }

      const sliceQuickSearch = <T>(array: T[]) => array.slice(0, 25);

      return {
        secrets: sliceQuickSearch(
          searchPath ? secrets.filter((secret) => secret.secretPath.endsWith(searchPath)) : secrets
        ),
        dynamicSecrets: sliceQuickSearch(
          searchPath
            ? dynamicSecrets.filter((dynamicSecret) => dynamicSecret.path.endsWith(searchPath))
            : dynamicSecrets
        ),
        secretRotations: sliceQuickSearch(
          searchPath ? secretRotations.filter((rotation) => rotation.folder.path.endsWith(searchPath)) : secretRotations
        ),
        folders: searchHasTags
          ? []
          : sliceQuickSearch(
              allFolders.filter((folder) => {
                const [folderName, ...folderPathSegments] = folder.path.split("/").reverse();
                const folderPath = folderPathSegments.reverse().join("/").toLowerCase() || "/";

                if (searchPath) {
                  if (searchPath === "/") {
                    // only show root folders if no folder name search
                    if (!searchName) return folderPath === searchPath;

                    // start partial match on root folders
                    return folderName.toLowerCase().startsWith(searchName.toLowerCase());
                  }

                  // support ending partial path match
                  return (
                    folderPath.endsWith(searchPath) && folderName.toLowerCase().startsWith(searchName.toLowerCase())
                  );
                }

                // no search path, "fuzzy" match all folders
                return folderName.toLowerCase().includes(searchName.toLowerCase());
              })
            )
      };
    }
  });

  server.route({
    method: "GET",
    url: "/accessible-secrets",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      querystring: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        recursive: booleanSchema.default(false),
        filterByAction: z
          .enum([ProjectPermissionSecretActions.DescribeSecret, ProjectPermissionSecretActions.ReadValue])
          .default(ProjectPermissionSecretActions.ReadValue)
      }),
      response: {
        200: z.object({
          secrets: secretRawSchema
            .extend({
              secretPath: z.string().optional(),
              secretValueHidden: z.boolean()
            })
            .array()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { projectId, environment, secretPath, filterByAction, recursive } = req.query;

      const { secrets } = await server.services.secret.getAccessibleSecrets({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorAuthMethod: req.permission.authMethod,
        actorOrgId: req.permission.orgId,
        environment,
        secretPath,
        projectId,
        filterByAction,
        recursive
      });

      return { secrets };
    }
  });

  server.route({
    method: "GET",
    url: "/secrets-by-keys",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      security: [
        {
          bearerAuth: []
        }
      ],
      querystring: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        keys: z.string().trim().transform(decodeURIComponent),
        viewSecretValue: booleanSchema.default(false)
      }),
      response: {
        200: z.object({
          secrets: secretRawSchema
            .extend({
              secretValueHidden: z.boolean(),
              secretPath: z.string().optional(),
              secretMetadata: ResourceMetadataSchema.optional(),
              tags: SanitizedTagSchema.array().optional()
            })
            .array()
            .optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { secretPath, projectId, environment, viewSecretValue } = req.query;

      const keys = req.query.keys?.split(",").filter((key) => Boolean(key.trim())) ?? [];
      if (!keys.length) throw new BadRequestError({ message: "One or more keys required" });

      const { secrets } = await server.services.secret.getSecretsRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        viewSecretValue,
        environment,
        actorAuthMethod: req.permission.authMethod,
        projectId,
        path: secretPath,
        keys
      });

      await server.services.auditLog.createAuditLog({
        projectId,
        ...req.auditLogInfo,
        event: {
          type: EventType.GET_SECRETS,
          metadata: {
            environment,
            secretPath,
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
            workspaceId: projectId,
            environment,
            secretPath,
            channel: getUserAgentType(req.headers["user-agent"]),
            ...req.auditLogInfo
          }
        });
      }

      return { secrets };
    }
  });
};
