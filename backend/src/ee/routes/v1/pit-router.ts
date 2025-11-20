/* eslint-disable @typescript-eslint/no-base-to-string */
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { removeTrailingSlash } from "@app/lib/fn";
import { isValidFolderName } from "@app/lib/validator";
import { readLimit, secretsLimit } from "@app/server/config/rateLimiter";
import { SecretNameSchema } from "@app/server/lib/schemas";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { booleanSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { commitChangesResponseSchema, resourceChangeSchema } from "@app/services/folder-commit/folder-commit-schemas";
import { ResourceMetadataSchema } from "@app/services/resource-metadata/resource-metadata-schema";

const commitHistoryItemSchema = z.object({
  id: z.string(),
  folderId: z.string(),
  actorType: z.string(),
  actorMetadata: z.unknown().optional(),
  message: z.string().optional().nullable(),
  commitId: z.string(),
  createdAt: z.string().or(z.date()),
  envId: z.string()
});

const folderStateSchema = z.array(
  z.object({
    type: z.string(),
    id: z.string(),
    versionId: z.string(),
    secretKey: z.string().optional(),
    secretVersion: z.number().optional(),
    folderName: z.string().optional(),
    folderVersion: z.number().optional()
  })
);

export const registerPITRouter = async (server: FastifyZodProvider) => {
  // Get commits count for a folder
  server.route({
    method: "GET",
    url: "/commits/count",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          count: z.number(),
          folderId: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pit.getCommitsCount({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.query.projectId,
        environment: req.query.environment,
        path: req.query.path
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_PROJECT_PIT_COMMIT_COUNT,
          metadata: {
            environment: req.query.environment,
            path: req.query.path,
            commitCount: result.count.toString()
          }
        }
      });

      return result;
    }
  });

  // Get all commits for a folder
  server.route({
    method: "GET",
    url: "/commits",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        projectId: z.string().trim(),
        offset: z.coerce.number().min(0).default(0),
        limit: z.coerce.number().min(1).max(100).default(20),
        search: z.string().trim().optional(),
        sort: z.enum(["asc", "desc"]).default("desc")
      }),
      response: {
        200: z.object({
          commits: commitHistoryItemSchema.array(),
          total: z.number(),
          hasMore: z.boolean()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pit.getCommitsForFolder({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.query.projectId,
        environment: req.query.environment,
        path: req.query.path,
        offset: req.query.offset,
        limit: req.query.limit,
        search: req.query.search,
        sort: req.query.sort
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_PROJECT_PIT_COMMITS,
          metadata: {
            environment: req.query.environment,
            path: req.query.path,
            commitCount: result.commits.length.toString(),
            offset: req.query.offset.toString(),
            limit: req.query.limit.toString(),
            search: req.query.search,
            sort: req.query.sort
          }
        }
      });

      return result;
    }
  });

  // Get commit changes for a specific commit
  server.route({
    method: "GET",
    url: "/commits/:commitId/changes",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        commitId: z.string().trim()
      }),
      querystring: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: commitChangesResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pit.getCommitChanges({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.query.projectId,
        commitId: req.params.commitId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.GET_PROJECT_PIT_COMMIT_CHANGES,
          metadata: {
            commitId: req.params.commitId,
            changesCount: (result.changes.changes?.length || 0).toString()
          }
        }
      });

      return result;
    }
  });

  // Retrieve rollback changes for a commit
  server.route({
    method: "GET",
    url: "/commits/:commitId/compare",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        commitId: z.string().trim()
      }),
      querystring: z.object({
        folderId: z.string().trim(),
        environment: z.string().trim(),
        deepRollback: booleanSchema.default(false),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        projectId: z.string().trim()
      }),
      response: {
        200: z.array(
          z.object({
            folderId: z.string(),
            folderName: z.string(),
            folderPath: z.string().optional(),
            changes: z.array(resourceChangeSchema)
          })
        )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pit.compareCommitChanges({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.query.projectId,
        commitId: req.params.commitId,
        folderId: req.query.folderId,
        environment: req.query.environment,
        deepRollback: req.query.deepRollback,
        secretPath: req.query.secretPath
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.PIT_COMPARE_FOLDER_STATES,
          metadata: {
            targetCommitId: req.params.commitId,
            folderId: req.query.folderId,
            deepRollback: req.query.deepRollback,
            diffsCount: result.length.toString(),
            environment: req.query.environment,
            folderPath: req.query.secretPath
          }
        }
      });

      return result;
    }
  });

  // Rollback to a previous commit
  server.route({
    method: "POST",
    url: "/commits/:commitId/rollback",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        commitId: z.string().trim()
      }),
      body: z.object({
        folderId: z.string().trim(),
        deepRollback: z.boolean().default(false),
        message: z.string().max(256).trim().optional(),
        environment: z.string().trim(),
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          secretChangesCount: z.number().optional(),
          folderChangesCount: z.number().optional(),
          totalChanges: z.number().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pit.rollbackToCommit({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.body.projectId,
        commitId: req.params.commitId,
        folderId: req.body.folderId,
        deepRollback: req.body.deepRollback,
        message: req.body.message,
        environment: req.body.environment
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.PIT_ROLLBACK_COMMIT,
          metadata: {
            targetCommitId: req.params.commitId,
            environment: req.body.environment,
            folderId: req.body.folderId,
            deepRollback: req.body.deepRollback,
            message: req.body.message || "Rollback to previous commit",
            totalChanges: result.totalChanges?.toString() || "0"
          }
        }
      });

      return result;
    }
  });

  // Revert commit
  server.route({
    method: "POST",
    url: "/commits/:commitId/revert",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        commitId: z.string().trim()
      }),
      body: z.object({
        projectId: z.string().trim()
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          message: z.string(),
          originalCommitId: z.string(),
          revertCommitId: z.string().optional(),
          changesReverted: z.number().optional()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pit.revertCommit({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.body.projectId,
        commitId: req.params.commitId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.PIT_REVERT_COMMIT,
          metadata: {
            commitId: req.params.commitId,
            revertCommitId: result.revertCommitId,
            changesReverted: result.changesReverted?.toString()
          }
        }
      });

      return result;
    }
  });

  // Folder state at commit
  server.route({
    method: "GET",
    url: "/commits/:commitId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        commitId: z.string().trim()
      }),
      querystring: z.object({
        folderId: z.string().trim(),
        projectId: z.string().trim()
      }),
      response: {
        200: folderStateSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pit.getFolderStateAtCommit({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.query.projectId,
        commitId: req.params.commitId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.projectId,
        event: {
          type: EventType.PIT_GET_FOLDER_STATE,
          metadata: {
            commitId: req.params.commitId,
            folderId: req.query.folderId,
            resourceCount: result.length.toString()
          }
        }
      });

      return result;
    }
  });

  server.route({
    method: "POST",
    url: "/batch/commit",
    config: {
      rateLimit: secretsLimit
    },
    schema: {
      hide: true,
      description: "Commit changes",
      security: [
        {
          bearerAuth: []
        }
      ],
      body: z.object({
        projectId: z.string().trim(),
        environment: z.string().trim(),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        message: z.string().trim().max(255).optional(),
        changes: z.object({
          secrets: z.object({
            create: z
              .array(
                z.object({
                  secretKey: SecretNameSchema,
                  secretValue: z.string().transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim())),
                  secretComment: z.string().trim().optional().default(""),
                  skipMultilineEncoding: z.boolean().optional(),
                  metadata: z.record(z.string()).optional(),
                  secretMetadata: ResourceMetadataSchema.optional(),
                  tagIds: z.string().array().optional()
                })
              )
              .optional(),
            update: z
              .array(
                z.object({
                  secretKey: SecretNameSchema,
                  newSecretName: SecretNameSchema.optional(),
                  secretValue: z
                    .string()
                    .transform((val) => (val.at(-1) === "\n" ? `${val.trim()}\n` : val.trim()))
                    .optional(),
                  secretComment: z.string().trim().optional().default(""),
                  skipMultilineEncoding: z
                    .boolean()
                    .nullish()
                    .transform((val) => (val === null ? false : val)),
                  metadata: z.record(z.string()).optional(),
                  secretMetadata: ResourceMetadataSchema.optional(),
                  tagIds: z.string().array().optional()
                })
              )
              .optional(),
            delete: z
              .array(
                z.object({
                  secretKey: SecretNameSchema
                })
              )
              .optional()
          }),
          folders: z.object({
            create: z
              .array(
                z.object({
                  folderName: z
                    .string()
                    .trim()
                    .refine((name) => isValidFolderName(name), {
                      message: "Invalid folder name. Only alphanumeric characters, dashes, and underscores are allowed."
                    }),
                  description: z.string().optional()
                })
              )
              .optional(),
            update: z
              .array(
                z.object({
                  folderName: z
                    .string()
                    .trim()
                    .refine((name) => isValidFolderName(name), {
                      message: "Invalid folder name. Only alphanumeric characters, dashes, and underscores are allowed."
                    }),
                  description: z.string().nullable().optional(),
                  id: z.string()
                })
              )
              .optional(),
            delete: z
              .array(
                z.object({
                  folderName: z
                    .string()
                    .trim()
                    .refine((name) => isValidFolderName(name), {
                      message: "Invalid folder name. Only alphanumeric characters, dashes, and underscores are allowed."
                    }),
                  id: z.string()
                })
              )
              .optional()
          })
        })
      }),
      response: {
        200: z.object({
          message: z.string()
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const result = await server.services.pit.processNewCommitRaw({
        actorId: req.permission.id,
        actor: req.permission.type,
        actorOrgId: req.permission.orgId,
        actorAuthMethod: req.permission.authMethod,
        projectId: req.body.projectId,
        environment: req.body.environment,
        secretPath: req.body.secretPath,
        message: req.body.message || "",
        changes: {
          secrets: req.body.changes.secrets,
          folders: req.body.changes.folders
        }
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.projectId,
        event: {
          type: EventType.PIT_PROCESS_NEW_COMMIT_RAW,
          metadata: {
            commitId: result.commitId,
            approvalId: result.approvalId,
            projectId: req.body.projectId,
            environment: req.body.environment,
            secretPath: req.body.secretPath,
            message: req.body.message || ""
          }
        }
      });

      for await (const event of result.secretMutationEvents) {
        await server.services.auditLog.createAuditLog({
          ...req.auditLogInfo,
          orgId: req.permission.orgId,
          projectId: req.body.projectId,
          event
        });
      }

      return { message: "success" };
    }
  });
};
