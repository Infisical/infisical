/* eslint-disable @typescript-eslint/no-base-to-string */
import { ForbiddenError } from "@casl/ability";
import { z } from "zod";

import { ActionProjectType } from "@app/db/schemas";
import { EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectPermissionCommitsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { removeTrailingSlash } from "@app/lib/fn";
import { readLimit } from "@app/server/config/rateLimiter";
import { verifyAuth } from "@app/server/plugins/auth/verify-auth";
import { booleanSchema } from "@app/server/routes/sanitizedSchemas";
import { ActorAuthMethod, ActorType, AuthMode } from "@app/services/auth/auth-type";
import { ChangeType } from "@app/services/folder-commit/folder-commit-service";
import { commitChangesResponseSchema } from "@app/services/folder-commit/folder-commit-types";

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
        workspaceId: z.string().trim()
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
        projectId: req.query.workspaceId,
        environment: req.query.environment,
        path: req.query.path
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.workspaceId,
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
    url: "/commits",
    config: {
      rateLimit: readLimit
    },
    schema: {
      querystring: z.object({
        environment: z.string().trim(),
        path: z.string().trim().default("/").transform(removeTrailingSlash),
        workspaceId: z.string().trim(),
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
      const result = await server.services.folderCommit.getCommitsForFolder({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.query.workspaceId,
        environment: req.query.environment,
        path: req.query.path,
        offset: req.query.offset,
        limit: req.query.limit,
        search: req.query.search,
        sort: req.query.sort
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.workspaceId,
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

      return {
        commits: result.commits.map((commit) => ({
          ...commit,
          commitId: commit.commitId.toString()
        })),
        total: result.total,
        hasMore: result.hasMore
      };
    }
  });

  const getChangeVersions = async (
    change: {
      secretVersion?: string;
      secretId?: string;
      id?: string;
      isUpdate?: boolean;
      changeType?: string;
    },
    previousVersion: string,
    actorId: string,
    actor: ActorType,
    actorOrgId: string,
    actorAuthMethod: ActorAuthMethod,
    folderId: string
  ) => {
    if (change.secretVersion) {
      const currentVersion = change.secretVersion || "1";
      const secretId = change.secretId ? change.secretId : change.id;
      if (!secretId) {
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      const versions = await server.services.secret.getSecretVersionsV2ByIds({
        actorId,
        actor,
        actorOrgId,
        actorAuthMethod,
        secretId,
        // if it's update add also the previous secretversionid
        secretVersions:
          change.isUpdate || change.changeType === ChangeType.UPDATE
            ? [currentVersion, previousVersion]
            : [currentVersion],
        folderId
      });
      return versions?.map((v) => ({
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
  };

  const getFolderVersions = async (
    change: {
      folderVersion?: string;
      isUpdate?: boolean;
      changeType?: string;
    },
    fromVersion: string,
    folderId: string
  ) => {
    const currentVersion = change.folderVersion || "1";
    // eslint-disable-next-line no-await-in-loop
    const versions = await server.services.folder.getFolderVersionsByIds({
      folderId,
      folderVersions:
        change.isUpdate || change.changeType === ChangeType.UPDATE ? [currentVersion, fromVersion] : [currentVersion]
    });
    return versions.map((v) => ({
      name: v.name
    }));
  };

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
        workspaceId: z.string().trim()
      }),
      response: {
        200: commitChangesResponseSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const changes = await server.services.folderCommit.getCommitChanges({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.query.workspaceId,
        commitId: req.params.commitId
      });
      for (const change of changes.changes) {
        if (change.secretVersionId && change.secretVersion) {
          // eslint-disable-next-line no-await-in-loop
          change.versions = await getChangeVersions(
            change,
            (Number.parseInt(change.secretVersion, 10) - 1).toString(),
            req.permission.id,
            req.permission.type,
            req.permission.orgId,
            req.permission.authMethod,
            change.folderId
          );
        } else if (change.folderVersionId && change.folderChangeId && change.folderVersion) {
          // eslint-disable-next-line no-await-in-loop
          change.versions = await getFolderVersions(
            change,
            (Number.parseInt(change.folderVersion, 10) - 1).toString(),
            change.folderChangeId
          );
        }
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.workspaceId,
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
        envId: z.string().trim(),
        deepRollback: booleanSchema.default(false),
        secretPath: z.string().trim().default("/").transform(removeTrailingSlash),
        workspaceId: z.string().trim()
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
        projectId: req.query.workspaceId
      });
      if (!latestCommit) {
        throw new NotFoundError({ message: "Latest commit not found" });
      }

      let diffs;
      if (req.query.deepRollback) {
        diffs = await server.services.folderCommit.deepCompareFolder({
          targetCommitId: req.params.commitId,
          envId: req.query.envId,
          projectId: req.query.workspaceId
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
            // eslint-disable-next-line no-await-in-loop
            change.versions = await getChangeVersions(
              change,
              change.fromVersion || "1",
              req.permission.id,
              req.permission.type,
              req.permission.orgId,
              req.permission.authMethod,
              diff.folderId
            );
          }
          if (change.folderVersion) {
            // eslint-disable-next-line no-await-in-loop
            change.versions = await getFolderVersions(change, change.fromVersion || "1", change.id);
          }
        }
      }

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.workspaceId,
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
        message: z.string().trim().optional(),
        envId: z.string().trim(),
        workspaceId: z.string().trim()
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
      const { permission } = await server.services.permission.getProjectPermission({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        projectId: req.body.workspaceId,
        actorAuthMethod: req.permission?.authMethod,
        actorOrgId: req.permission?.orgId,
        actionProjectType: ActionProjectType.SecretManager
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCommitsActions.PerformRollback,
        ProjectPermissionSub.Commits
      );
      const latestCommit = await server.services.folderCommit.getLatestCommit({
        folderId: req.body.folderId,
        actor: req.permission?.type,
        actorId: req.permission?.id,
        actorOrgId: req.permission?.orgId,
        actorAuthMethod: req.permission?.authMethod,
        projectId: req.body.workspaceId
      });
      if (!latestCommit) {
        throw new NotFoundError({ message: "Latest commit not found" });
      }

      if (req.body.deepRollback) {
        await server.services.folderCommit.deepRollbackFolder(
          req.params.commitId,
          req.body.envId,
          req.permission.id,
          req.permission.type,
          req.body.workspaceId
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
        projectId: req.body.workspaceId,
        reconstructNewFolders: req.body.deepRollback
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.body.workspaceId,
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
    url: "/commits/:commitId/revert",
    config: {
      rateLimit: readLimit
    },
    schema: {
      params: z.object({
        commitId: z.string().trim()
      }),
      querystring: z.object({
        workspaceId: z.string().trim()
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
        projectId: req.query.workspaceId
      });

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.workspaceId,
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
        workspaceId: z.string().trim()
      }),
      response: {
        200: folderStateSchema
      }
    },
    onRequest: verifyAuth([AuthMode.JWT]),
    handler: async (req) => {
      const { permission } = await server.services.permission.getProjectPermission({
        actor: req.permission?.type,
        actorId: req.permission?.id,
        projectId: req.query.workspaceId,
        actorAuthMethod: req.permission?.authMethod,
        actorOrgId: req.permission?.orgId,
        actionProjectType: ActionProjectType.SecretManager
      });

      ForbiddenError.from(permission).throwUnlessCan(
        ProjectPermissionCommitsActions.Read,
        ProjectPermissionSub.Commits
      );
      const response = await server.services.folderCommit.reconstructFolderState(req.params.commitId);

      await server.services.auditLog.createAuditLog({
        ...req.auditLogInfo,
        projectId: req.query.workspaceId,
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
