/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { ProjectPermissionCommitsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { ResourceType, TFolderCommitServiceFactory } from "@app/services/folder-commit/folder-commit-service";
import {
  isFolderCommitChange,
  isSecretCommitChange
} from "@app/services/folder-commit-changes/folder-commit-changes-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretServiceFactory } from "@app/services/secret/secret-service";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretFolderServiceFactory } from "@app/services/secret-folder/secret-folder-service";

import { TPermissionServiceFactory } from "../permission/permission-service-types";

type TPitServiceFactoryDep = {
  folderCommitService: TFolderCommitServiceFactory;
  secretService: Pick<TSecretServiceFactory, "getSecretVersionsV2ByIds" | "getChangeVersions">;
  folderService: Pick<TSecretFolderServiceFactory, "getFolderById" | "getFolderVersions">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
};

export type TPitServiceFactory = ReturnType<typeof pitServiceFactory>;

export const pitServiceFactory = ({
  folderCommitService,
  secretService,
  folderService,
  permissionService,
  folderDAL,
  projectEnvDAL
}: TPitServiceFactoryDep) => {
  const getCommitsCount = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    environment,
    path
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    environment: string;
    path: string;
  }) => {
    const result = await folderCommitService.getCommitsCount({
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      projectId,
      environment,
      path
    });

    return result;
  };

  const getCommitsForFolder = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    environment,
    path,
    offset,
    limit,
    search,
    sort
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    environment: string;
    path: string;
    offset: number;
    limit: number;
    search?: string;
    sort: "asc" | "desc";
  }) => {
    const result = await folderCommitService.getCommitsForFolder({
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      projectId,
      environment,
      path,
      offset,
      limit,
      search,
      sort
    });

    return {
      commits: result.commits.map((commit) => ({
        ...commit,
        commitId: commit.commitId.toString()
      })),
      total: result.total,
      hasMore: result.hasMore
    };
  };

  const getCommitChanges = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    commitId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    commitId: string;
  }) => {
    const changes = await folderCommitService.getCommitChanges({
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      projectId,
      commitId
    });

    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(projectId, [changes.folderId]);

    for (const change of changes.changes) {
      if (isSecretCommitChange(change)) {
        change.versions = await secretService.getChangeVersions(
          {
            secretVersion: change.secretVersion,
            secretId: change.secretId,
            id: change.id,
            isUpdate: change.isUpdate,
            changeType: change.changeType
          },
          (Number.parseInt(change.secretVersion, 10) - 1).toString(),
          actorId,
          actor,
          actorOrgId,
          actorAuthMethod,
          changes.envId,
          projectId,
          folderWithPath?.path || ""
        );
      } else if (isFolderCommitChange(change)) {
        change.versions = await folderService.getFolderVersions(
          change,
          (Number.parseInt(change.folderVersion, 10) - 1).toString(),
          change.folderChangeId
        );
      }
    }

    return {
      changes: {
        ...changes,
        commitId: changes.commitId.toString()
      }
    };
  };

  const compareCommitChanges = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    commitId,
    folderId,
    environment,
    deepRollback,
    secretPath
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    commitId: string;
    folderId: string;
    environment: string;
    deepRollback: boolean;
    secretPath: string;
  }) => {
    const latestCommit = await folderCommitService.getLatestCommit({
      folderId,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      projectId
    });

    const targetCommit = await folderCommitService.getCommitById({
      commitId,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      projectId
    });

    const env = await projectEnvDAL.findOne({
      projectId,
      slug: environment
    });

    if (!latestCommit) {
      throw new NotFoundError({ message: "Latest commit not found" });
    }

    let diffs;
    if (deepRollback) {
      diffs = await folderCommitService.deepCompareFolder({
        targetCommitId: targetCommit.id,
        envId: env.id,
        projectId
      });
    } else {
      const folderData = await folderService.getFolderById({
        actor,
        actorId,
        actorOrgId,
        actorAuthMethod,
        id: folderId
      });

      diffs = [
        {
          folderId: folderData.id,
          folderName: folderData.name,
          folderPath: secretPath,
          changes: await folderCommitService.compareFolderStates({
            targetCommitId: commitId,
            currentCommitId: latestCommit.id
          })
        }
      ];
    }

    for (const diff of diffs) {
      for (const change of diff.changes) {
        // Use discriminated union type checking
        if (change.type === ResourceType.SECRET) {
          // TypeScript now knows this is a SecretChange
          if (change.secretKey && change.secretVersion && change.secretId) {
            change.versions = await secretService.getChangeVersions(
              {
                secretVersion: change.secretVersion,
                secretId: change.secretId,
                id: change.id,
                isUpdate: change.isUpdate,
                changeType: change.changeType
              },
              change.fromVersion || "1",
              actorId,
              actor,
              actorOrgId,
              actorAuthMethod,
              env.id,
              projectId,
              diff.folderPath || ""
            );
          }
        } else if (change.type === ResourceType.FOLDER) {
          // TypeScript now knows this is a FolderChange
          if (change.folderVersion) {
            change.versions = await folderService.getFolderVersions(change, change.fromVersion || "1", change.id);
          }
        }
      }
    }

    return diffs;
  };

  const rollbackToCommit = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    commitId,
    folderId,
    deepRollback,
    message,
    environment
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    commitId: string;
    folderId: string;
    deepRollback: boolean;
    message?: string;
    environment: string;
  }) => {
    const { permission: userPermission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(userPermission).throwUnlessCan(
      ProjectPermissionCommitsActions.PerformRollback,
      ProjectPermissionSub.Commits
    );

    const latestCommit = await folderCommitService.getLatestCommit({
      folderId,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      projectId
    });

    if (!latestCommit) {
      throw new NotFoundError({ message: "Latest commit not found" });
    }

    logger.info(`PIT - Attempting to rollback folder ${folderId} from commit ${latestCommit.id} to commit ${commitId}`);

    const targetCommit = await folderCommitService.getCommitById({
      commitId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId
    });

    const env = await projectEnvDAL.findOne({
      projectId,
      slug: environment
    });

    if (!targetCommit || targetCommit.folderId !== folderId || targetCommit.envId !== env.id) {
      throw new NotFoundError({ message: "Target commit not found" });
    }

    if (!latestCommit || latestCommit.envId !== env.id) {
      throw new NotFoundError({ message: "Latest commit not found" });
    }

    if (deepRollback) {
      await folderCommitService.deepRollbackFolder(commitId, env.id, actorId, actor, projectId, message);
      return { success: true };
    }

    const diff = await folderCommitService.compareFolderStates({
      currentCommitId: latestCommit.id,
      targetCommitId: commitId
    });

    const response = await folderCommitService.applyFolderStateDifferences({
      differences: diff,
      actorInfo: {
        actorType: actor,
        actorId,
        message: message || "Rollback to previous commit"
      },
      folderId,
      projectId,
      reconstructNewFolders: deepRollback
    });

    return {
      success: true,
      secretChangesCount: response.secretChangesCount,
      folderChangesCount: response.folderChangesCount,
      totalChanges: response.totalChanges
    };
  };

  const revertCommit = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    commitId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    commitId: string;
  }) => {
    const response = await folderCommitService.revertCommitChanges({
      commitId,
      actor,
      actorId,
      actorAuthMethod,
      actorOrgId,
      projectId
    });

    return response;
  };

  const getFolderStateAtCommit = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    commitId
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    commitId: string;
  }) => {
    const commit = await folderCommitService.getCommitById({
      commitId,
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      projectId
    });

    if (!commit) {
      throw new NotFoundError({ message: `Commit with ID ${commitId} not found` });
    }

    const response = await folderCommitService.reconstructFolderState(commitId);

    return response.map((item) => {
      if (item.type === ResourceType.SECRET) {
        return {
          ...item,
          secretVersion: Number(item.secretVersion)
        };
      }

      if (item.type === ResourceType.FOLDER) {
        return {
          ...item,
          folderVersion: Number(item.folderVersion)
        };
      }

      return item;
    });
  };

  return {
    getCommitsCount,
    getCommitsForFolder,
    getCommitChanges,
    compareCommitChanges,
    rollbackToCommit,
    revertCommit,
    getFolderStateAtCommit
  };
};
