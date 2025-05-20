/* eslint-disable @typescript-eslint/no-base-to-string */
import { z } from "zod";

import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { NotFoundError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { booleanSchema } from "@app/server/routes/sanitizedSchemas";
import { AuthMode } from "@app/services/auth/auth-type";
import { ChangeType } from "@app/services/folder-commit/folder-commit-service";

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

const versionSchema = z.object({
  secretKey: z.string().optional(),
  secretComment: z.string().optional().nullable(),
  skipMultilineEncoding: z.boolean().optional().nullable(),
  secretReminderRepeatDays: z.number().optional().nullable(),
  secretReminderNote: z.string().optional().nullable(),
  metadata: z.unknown().optional().nullable(),
  tags: z.array(z.string()).optional().nullable(),
  secretReminderRecipients: z.array(z.any()).optional().nullable(),
  secretValue: z.string().optional().nullable(),
  name: z.string().optional().nullable()
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
    url: "/commits/count/:workspaceId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash)
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
      const res = await server.services.folderCommit.getCommitsCount({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.params.workspaceId,
        environment: req.query.environment,
        path: req.query.path
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.GET_PROJECT_PIT_COMMIT_COUNT,
          metadata: {
            environment: req.query.environment,
            path: req.query.path,
            commitCount: res.count.toString()
          }
        }
      });

      return res;
    }
  });

  // Get all commits for a folder
  server.route({
    method: "GET",
    url: "/commits/:workspaceId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim()
      }),
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash)
      }),
      response: {
        200: commitHistoryItemSchema.array()
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const commits = await server.services.folderCommit.getCommitsForFolder({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.params.workspaceId,
        environment: req.query.environment,
        path: req.query.path
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.GET_PROJECT_PIT_COMMITS,
          metadata: {
            environment: req.query.environment,
            path: req.query.path,
            commitCount: commits.length.toString()
          }
        }
      });

      return commits.map((commit) => ({
        ...commit,
        commitId: commit.commitId.toString()
      }));
    }
  });

  // Get commit changes for a specific commit
  server.route({
    method: "GET",
    url: "/commits/:workspaceId/:commitId/changes",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim(),
        commitId: z.string().trim()
      }),
      response: {
        200: z.object({
          changes: z.object({
            id: z.string(),
            commitId: z.string(),
            actorMetadata: z
              .union([
                z.object({
                  id: z.string().optional(),
                  name: z.string().optional()
                }),
                z.unknown()
              ])
              .optional(),
            actorType: z.string(),
            message: z.string().optional().nullable(),
            folderId: z.string(),
            envId: z.string(),
            createdAt: z.string().or(z.date()),
            updatedAt: z.string().or(z.date()),
            changes: z.array(
              z.object({
                id: z.string(),
                folderCommitId: z.string(),
                changeType: z.string(),
                isUpdate: z.boolean().optional(),
                secretVersionId: z.string().optional().nullable(),
                folderVersionId: z.string().optional().nullable(),
                // Fix these two fields to accept either string or Date objects
                createdAt: z.union([z.string(), z.date()]),
                updatedAt: z.union([z.string(), z.date()]),
                folderName: z.string().optional().nullable(),
                folderChangeId: z.string().optional().nullable(),
                folderVersion: z.union([z.string(), z.number()]).optional().nullable(),
                secretKey: z.string().optional().nullable(),
                secretVersion: z.union([z.string(), z.number()]).optional().nullable(),
                secretId: z.string().optional().nullable(),
                actorMetadata: z
                  .union([
                    z.object({
                      id: z.string().optional(),
                      name: z.string().optional()
                    }),
                    z.unknown()
                  ])
                  .optional(),
                actorType: z.string().optional(),
                message: z.string().optional().nullable(),
                folderId: z.string().optional().nullable(),
                versions: z.array(versionSchema).optional()
              })
            )
          })
        })
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const changes = await server.services.folderCommit.getCommitChanges({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.params.workspaceId,
        commitId: req.params.commitId
      });
      for (const change of changes.changes) {
        if (change.secretVersionId) {
          const currentVersion = change.secretVersion || "1";
          const previousVersion = (Number.parseInt(currentVersion, 10) - 1).toString();
          if (change.secretId) {
            // eslint-disable-next-line no-await-in-loop
            const versions = await server.services.secret.getSecretVersionsV2ByIds({
              actorId: req.permission?.id,
              actor: req.permission?.type,
              actorOrgId: req.permission?.orgId,
              actorAuthMethod: req.permission?.authMethod,
              secretId: change.secretId,
              secretVersions: change.isUpdate ? [currentVersion, previousVersion] : [currentVersion],
              folderId: change.folderId
            });
            change.versions = versions?.map((v) => ({
              secretKey: v.secretKey,
              secretComment: v.secretComment,
              skipMultilineEncoding: v.skipMultilineEncoding,
              secretReminderRepeatDays: v.secretReminderRepeatDays,
              secretReminderNote: v.secretReminderNote,
              metadata: v.secretMetadata,
              tags: v.tags?.map((t) => t.name),
              secretReminderRecipients: v.secretReminderRecipients?.map((r) => r.toString()),
              secretValue: v.secretValue
            }));
          }
        } else if (change.folderVersionId && change.folderChangeId) {
          const currentVersion = change.folderVersion || "1";
          const previousVersion = (Number.parseInt(currentVersion, 10) - 1).toString();
          // eslint-disable-next-line no-await-in-loop
          const versions = await server.services.folder.getFolderVersionsByIds({
            folderId: change.folderChangeId,
            folderVersions: change.isUpdate ? [currentVersion, previousVersion] : [currentVersion]
          });
          change.versions = versions.map((v) => ({
            name: v.name
          }));
        }
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.GET_PROJECT_PIT_COMMIT_CHANGES,
          metadata: {
            commitId: req.params.commitId,
            changesCount: (changes.changes?.length || 0).toString()
          }
        }
      });

      return {
        changes: {
          ...changes,
          commitId: changes.commitId.toString()
        }
      };
    }
  });

  // Retrieve rollback changes for a commit
  server.route({
    method: "GET",
    url: "/commits/:workspaceId/:commitId/compare",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim(),
        commitId: z.string().trim()
      }),
      querystring: z.object({
        folderId: z.string().trim(),
        envId: z.string().trim(),
        deepRollback: booleanSchema.default(false),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash)
      }),
      response: {
        200: z.array(
          z.object({
            folderId: z.string(),
            folderName: z.string(),
            folderPath: z.string().optional(),
            changes: z.any()
          })
        )
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const latestCommit = await server.services.folderCommit.getLatestCommit({
        folderId: req.query.folderId,
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.params.workspaceId
      });
      if (!latestCommit) {
        throw new NotFoundError({ message: "Latest commit not found" });
      }

      let diffs;
      if (req.query.deepRollback) {
        diffs = await server.services.folderCommit.deepCompareFolder({
          targetCommitId: req.params.commitId,
          envId: req.query.envId,
          actorId: req.permission?.id,
          actorType: req.permission?.type,
          projectId: req.params.workspaceId
        });
      } else {
        const folder = await server.services.folder.getFolderById({
          actor: req.permission?.type,
          actorId: req.permission?.id,
          actorOrgId: req.permission?.orgId,
          actorAuthMethod: req.permission?.authMethod,
          id: req.query.folderId
        });
        diffs = [
          {
            folderId: folder.id,
            folderName: folder.name,
            folderPath: req.query.secretPath,
            changes: await server.services.folderCommit.compareFolderStates({
              targetCommitId: req.params.commitId,
              currentCommitId: latestCommit.id
            })
          }
        ];
      }

      for (const diff of diffs) {
        for (const change of diff.changes) {
          if (change.secretKey) {
            const currentVersion = change.secretVersion || "1";
            const previousVersion = change.fromVersion || "1";
            // eslint-disable-next-line no-await-in-loop
            const versions = await server.services.secret.getSecretVersionsV2ByIds({
              actorId: req.permission?.id,
              actor: req.permission?.type,
              actorOrgId: req.permission?.orgId,
              actorAuthMethod: req.permission?.authMethod,
              secretId: change.id,
              // if it's update add also the previous secretversionid
              secretVersions:
                change.changeType === ChangeType.UPDATE ? [currentVersion, previousVersion] : [currentVersion],
              folderId: req.query.folderId
            });
            change.versions = versions?.map((v) => ({
              secretKey: v.secretKey,
              secretComment: v.secretComment,
              skipMultilineEncoding: v.skipMultilineEncoding,
              secretReminderRepeatDays: v.secretReminderRepeatDays,
              secretReminderNote: v.secretReminderNote,
              metadata: v.metadata,
              tags: v.tags?.map((t) => t.name),
              secretReminderRecipients: v.secretReminderRecipients?.map((r) => r.toString()),
              secretValue: v.secretValue
            }));
          }
          if (change.folderVersion) {
            const currentVersion = change.folderVersion || "1";
            const previousVersion = change.fromVersion || "1";
            // eslint-disable-next-line no-await-in-loop
            const versions = await server.services.folder.getFolderVersionsByIds({
              folderId: change.id,
              folderVersions:
                change.changeType === ChangeType.UPDATE ? [currentVersion, previousVersion] : [currentVersion]
            });
            change.versions = versions.map((v) => ({
              name: v.name
            }));
          }
        }
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.PIT_COMPARE_FOLDER_STATES,
          metadata: {
            targetCommitId: req.params.commitId,
            folderId: req.query.folderId,
            deepRollback: req.query.deepRollback,
            diffsCount: diffs.length.toString()
          }
        }
      });

      return diffs;
    }
  });

  // Rollback to a previous commit
  server.route({
    method: "POST",
    url: "/commits/:workspaceId/:commitId/rollback",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim(),
        commitId: z.string().trim()
      }),
      body: z.object({
        folderId: z.string().trim(),
        deepRollback: z.boolean().default(false),
        message: z.string().trim().optional()
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
      const latestCommit = await server.services.folderCommit.getLatestCommit({
        folderId: req.body.folderId,
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.params.workspaceId
      });
      if (!latestCommit) {
        throw new NotFoundError({ message: "Latest commit not found" });
      }

      if (req.body.deepRollback) {
        await server.services.folderCommit.deepRollbackFolder(
          latestCommit.id,
          req.body.folderId,
          req.permission.id,
          req.permission.type,
          req.params.workspaceId
        );
        return { success: true };
      }
      const diff = await server.services.folderCommit.compareFolderStates({
        currentCommitId: latestCommit.id,
        targetCommitId: req.params.commitId
      });

      const response = await server.services.folderCommit.applyFolderStateDifferences({
        differences: diff,
        actorInfo: {
          actorType: req.permission.type,
          actorId: req.permission.id,
          message: req.body.message || "Rollback to previous commit"
        },
        folderId: req.body.folderId,
        projectId: req.params.workspaceId,
        reconstructNewFolders: req.body.deepRollback
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.PIT_ROLLBACK_COMMIT,
          metadata: {
            targetCommitId: req.params.commitId,
            folderId: req.body.folderId,
            deepRollback: req.body.deepRollback,
            message: req.body.message || "Rollback to previous commit",
            totalChanges: response.totalChanges.toString()
          }
        }
      });

      return {
        success: true,
        secretChangesCount: response.secretChangesCount,
        folderChangesCount: response.folderChangesCount,
        totalChanges: response.totalChanges
      };
    }
  });

  // Revert commit
  server.route({
    method: "POST",
    url: "/commits/:workspaceId/:commitId/revert",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim(),
        commitId: z.string().trim()
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
      const response = await server.services.folderCommit.revertCommitChanges({
        commitId: req.params.commitId,
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorAuthMethod: req.permission?.authMethod,
        actorOrgId: req.permission?.orgId,
        projectId: req.params.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.PIT_REVERT_COMMIT,
          metadata: {
            commitId: req.params.commitId,
            revertCommitId: response.revertCommitId,
            changesReverted: response.changesReverted?.toString()
          }
        }
      });

      return response;
    }
  });

  // Folder state at commit
  server.route({
    method: "GET",
    url: "/commits/:workspaceId/:commitId",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        workspaceId: z.string().trim(),
        commitId: z.string().trim()
      }),
      querystring: z.object({
        folderId: z.string().trim()
      }),
      response: {
        200: folderStateSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const response = await server.services.folderCommit.reconstructFolderState(req.params.commitId);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.params.workspaceId,
        event: {
          type: EventType.PIT_GET_FOLDER_STATE,
          metadata: {
            commitId: req.params.commitId,
            folderId: req.query.folderId,
            resourceCount: response.length.toString()
          }
        }
      });

      return response.map((item) => ({
        ...item,
        secretVersion: item.secretVersion ? Number(item.secretVersion) : undefined,
        folderVersion: item.folderVersion ? Number(item.folderVersion) : undefined
      }));
    }
  });
};
