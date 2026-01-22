/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { Event, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectPermissionCommitsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import { TFolderCommitDALFactory } from "@app/services/folder-commit/folder-commit-dal";
import {
  ResourceType,
  TCommitResourceChangeDTO,
  TFolderCommitServiceFactory
} from "@app/services/folder-commit/folder-commit-service";
import {
  isFolderCommitChange,
  isSecretCommitChange
} from "@app/services/folder-commit-changes/folder-commit-changes-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TSecretServiceFactory } from "@app/services/secret/secret-service";
import { TProcessNewCommitRawDTO } from "@app/services/secret/secret-types";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretFolderServiceFactory } from "@app/services/secret-folder/secret-folder-service";
import { TSecretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";
import { SecretOperations, SecretUpdateMode } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TSecretApprovalPolicyServiceFactory } from "../secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestServiceFactory } from "../secret-approval-request/secret-approval-request-service";

type TPitServiceFactoryDep = {
  folderCommitService: TFolderCommitServiceFactory;
  secretService: Pick<TSecretServiceFactory, "getSecretVersionsV2ByIds" | "getChangeVersions">;
  folderService: Pick<
    TSecretFolderServiceFactory,
    "getFolderById" | "getFolderVersions" | "createManyFolders" | "updateManyFolders" | "deleteManyFolders"
  >;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  folderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds" | "findBySecretPath">;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findOne">;
  secretApprovalRequestService: Pick<
    TSecretApprovalRequestServiceFactory,
    "generateSecretApprovalRequest" | "generateSecretApprovalRequestV2Bridge"
  >;
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicy">;
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus" | "findProjectBySlug" | "findById">;
  secretV2BridgeService: TSecretV2BridgeServiceFactory;
  folderCommitDAL: Pick<TFolderCommitDALFactory, "transaction">;
};

export type TPitServiceFactory = ReturnType<typeof pitServiceFactory>;

export const pitServiceFactory = ({
  folderCommitService,
  secretService,
  folderService,
  permissionService,
  folderDAL,
  projectEnvDAL,
  secretApprovalRequestService,
  secretApprovalPolicyService,
  projectDAL,
  secretV2BridgeService,
  folderCommitDAL
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

  const processNewCommitRaw = async ({
    actorId,
    projectId,
    environment,
    actor,
    actorOrgId,
    actorAuthMethod,
    secretPath,
    message,
    changes = {
      secrets: {
        create: [],
        update: [],
        delete: []
      },
      folders: {
        create: [],
        update: [],
        delete: []
      }
    }
  }: {
    actorId: string;
    projectId: string;
    environment: string;
    actor: ActorType;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    secretPath: string;
    message: string;
    changes: TProcessNewCommitRawDTO;
  }) => {
    const policy =
      actor === ActorType.USER
        ? await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath)
        : undefined;
    const secretMutationEvents: Event[] = [];

    const project = await projectDAL.findById(projectId);
    if (project.enforceCapitalization) {
      const caseViolatingSecretKeys = [
        // Check create operations
        ...(changes.secrets?.create
          ?.filter((sec) => sec.secretKey !== sec.secretKey.toUpperCase())
          .map((sec) => sec.secretKey) ?? []),

        // Check update operations
        ...(changes.secrets?.update
          ?.filter((sec) => sec.newSecretName && sec.newSecretName !== sec.newSecretName.toUpperCase())
          .map((sec) => sec.secretKey) ?? [])
      ];

      if (caseViolatingSecretKeys.length) {
        throw new BadRequestError({
          message: `Secret names must be in UPPERCASE per project requirements: ${caseViolatingSecretKeys.join(
            ", "
          )}. You can disable this requirement in project settings`
        });
      }
    }

    const response = await folderCommitDAL.transaction(async (trx) => {
      const targetFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath, trx);
      if (!targetFolder)
        throw new NotFoundError({
          message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
          name: "CreateManySecret"
        });
      const commitChanges: TCommitResourceChangeDTO[] = [];
      const folderChanges: { create: string[]; update: string[]; delete: string[] } = {
        create: [],
        update: [],
        delete: []
      };

      if ((changes.folders?.create?.length ?? 0) > 0) {
        const createdFolders = await folderService.createManyFolders({
          projectId,
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          folders:
            changes.folders?.create?.map((folder) => ({
              name: folder.folderName,
              environment,
              path: secretPath,
              description: folder.description
            })) ?? [],
          tx: trx,
          commitChanges
        });
        const newFolderEvents = createdFolders.folders.map(
          (folder) =>
            ({
              type: EventType.CREATE_FOLDER,
              metadata: {
                environment,
                folderId: folder.id,
                folderName: folder.name,
                folderPath: secretPath,
                ...(folder.description ? { description: folder.description } : {})
              }
            }) as Event
        );
        secretMutationEvents.push(...newFolderEvents);
        folderChanges.create.push(...createdFolders.folders.map((folder) => folder.id));
      }

      if ((changes.folders?.update?.length ?? 0) > 0) {
        const updatedFolders = await folderService.updateManyFolders({
          projectId,
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          folders:
            changes.folders?.update?.map((folder) => ({
              environment,
              path: secretPath,
              id: folder.id,
              name: folder.folderName,
              description: folder.description
            })) ?? [],
          tx: trx,
          commitChanges
        });

        const updatedFolderEvents = updatedFolders.newFolders.map(
          (folder) =>
            ({
              type: EventType.UPDATE_FOLDER,
              metadata: {
                environment,
                folderId: folder.id,
                folderPath: secretPath,
                newFolderName: folder.name,
                newFolderDescription: folder.description
              }
            }) as Event
        );
        secretMutationEvents.push(...updatedFolderEvents);
        folderChanges.update.push(...updatedFolders.newFolders.map((folder) => folder.id));
      }

      if ((changes.folders?.delete?.length ?? 0) > 0) {
        const deletedFolders = await folderService.deleteManyFolders({
          projectId,
          actor,
          actorId,
          actorOrgId,
          actorAuthMethod,
          folders:
            changes.folders?.delete?.map((folder) => ({
              environment,
              path: secretPath,
              idOrName: folder.id
            })) ?? [],
          tx: trx,
          commitChanges
        });
        const deletedFolderEvents = deletedFolders.folders.map(
          (folder) =>
            ({
              type: EventType.DELETE_FOLDER,
              metadata: {
                environment,
                folderId: folder.id,
                folderPath: secretPath,
                folderName: folder.name
              }
            }) as Event
        );
        secretMutationEvents.push(...deletedFolderEvents);
        folderChanges.delete.push(...deletedFolders.folders.map((folder) => folder.id));
      }

      if (policy) {
        if (
          (changes.secrets?.create?.length ?? 0) > 0 ||
          (changes.secrets?.update?.length ?? 0) > 0 ||
          (changes.secrets?.delete?.length ?? 0) > 0
        ) {
          const approval = await secretApprovalRequestService.generateSecretApprovalRequestV2Bridge({
            policy,
            secretPath,
            environment,
            projectId,
            actor,
            actorId,
            actorOrgId,
            actorAuthMethod,
            data: {
              [SecretOperations.Create]:
                changes.secrets?.create?.map((el) => ({
                  tagIds: el.tagIds,
                  secretValue: el.secretValue,
                  secretComment: el.secretComment,
                  metadata: el.metadata,
                  skipMultilineEncoding: el.skipMultilineEncoding,
                  secretKey: el.secretKey,
                  secretMetadata: el.secretMetadata
                })) ?? [],
              [SecretOperations.Update]:
                changes.secrets?.update?.map((el) => ({
                  tagIds: el.tagIds,
                  newSecretName: el.newSecretName,
                  secretValue: el.secretValue,
                  secretComment: el.secretComment,
                  metadata: el.metadata,
                  skipMultilineEncoding: el.skipMultilineEncoding,
                  secretKey: el.secretKey,
                  secretMetadata: el.secretMetadata
                })) ?? [],
              [SecretOperations.Delete]:
                changes.secrets?.delete?.map((el) => ({
                  secretKey: el.secretKey
                })) ?? []
            }
          });
          return {
            approvalId: approval.id,
            folderChanges,
            secretMutationEvents
          };
        }
        return {
          folderChanges,
          secretMutationEvents
        };
      }

      if ((changes.secrets?.create?.length ?? 0) > 0) {
        const newSecrets = await secretV2BridgeService.createManySecret({
          secretPath,
          environment,
          projectId,
          actorAuthMethod,
          actorOrgId,
          actor,
          actorId,
          secrets: changes.secrets?.create ?? [],
          tx: trx,
          commitChanges
        });
        secretMutationEvents.push({
          type: EventType.CREATE_SECRETS,
          metadata: {
            environment,
            secretPath,
            secrets: newSecrets.map((secret) => ({
              secretId: secret.id,
              secretKey: secret.secretKey,
              secretVersion: secret.version,
              secretTags: secret.tags?.map((tag) => tag.name),
              secretMetadata: secret.secretMetadata?.map((meta) => ({
                key: meta.key,
                isEncrypted: meta.isEncrypted,
                value: meta.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : meta.value
              }))
            }))
          }
        });
      }
      if ((changes.secrets?.update?.length ?? 0) > 0) {
        const updatedSecrets = await secretV2BridgeService.updateManySecret({
          secretPath,
          environment,
          projectId,
          actorAuthMethod,
          actorOrgId,
          actor,
          actorId,
          secrets: changes.secrets?.update ?? [],
          mode: SecretUpdateMode.FailOnNotFound,
          tx: trx,
          commitChanges
        });
        secretMutationEvents.push({
          type: EventType.UPDATE_SECRETS,
          metadata: {
            environment,
            secretPath,
            secrets: updatedSecrets.map((secret) => ({
              secretId: secret.id,
              secretKey: secret.secretKey,
              secretVersion: secret.version,
              secretTags: secret.tags?.map((tag) => tag.name),
              secretMetadata: secret.secretMetadata?.map((meta) => ({
                key: meta.key,
                isEncrypted: meta.isEncrypted,
                value: meta.isEncrypted ? AUDIT_LOG_SENSITIVE_VALUE : meta.value
              }))
            }))
          }
        });
      }
      if ((changes.secrets?.delete?.length ?? 0) > 0) {
        const deletedSecrets = await secretV2BridgeService.deleteManySecret({
          secretPath,
          environment,
          projectId,
          actorAuthMethod,
          actorOrgId,
          actor,
          actorId,
          secrets: changes.secrets?.delete ?? [],
          tx: trx,
          commitChanges
        });
        secretMutationEvents.push({
          type: EventType.DELETE_SECRETS,
          metadata: {
            environment,
            secretPath,
            secrets: deletedSecrets.map((secret) => ({
              secretId: secret.id,
              secretKey: secret.secretKey,
              secretVersion: secret.version
            }))
          }
        });
      }
      if (commitChanges?.length > 0) {
        const commit = await folderCommitService.createCommit(
          {
            actor: {
              type: actor || ActorType.PLATFORM,
              metadata: {
                id: actorId
              }
            },
            message,
            folderId: targetFolder.id,
            changes: commitChanges
          },
          trx
        );
        return {
          folderChanges,
          commitId: commit?.id,
          secretMutationEvents
        };
      }
      return {
        folderChanges,
        secretMutationEvents
      };
    });

    return response;
  };

  return {
    getCommitsCount,
    getCommitsForFolder,
    getCommitChanges,
    compareCommitChanges,
    rollbackToCommit,
    revertCommit,
    getFolderStateAtCommit,
    processNewCommitRaw
  };
};
