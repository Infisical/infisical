/* eslint-disable no-await-in-loop */
import { ForbiddenError, subject } from "@casl/ability";

import { ActionProjectType, TSecretFolders } from "@app/db/schemas";
import { Event, EventType } from "@app/ee/services/audit-log/audit-log-types";
import { ProjectPermissionCommitsActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { ProjectEvents } from "@app/ee/services/project-events/project-events-types";
import { AUDIT_LOG_SENSITIVE_VALUE } from "@app/lib/config/const";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";
import {
  isFolderCommitChange,
  isSecretCommitChange
} from "@app/services/folder-commit-changes/folder-commit-changes-dal";
import { TFolderCommitDALFactory } from "@app/services/folder-commit/folder-commit-dal";
import { summarizeCommitChanges } from "@app/services/folder-commit/folder-commit-fns";
import {
  ResourceType,
  TCommitResourceChangeDTO,
  TFolderCommitServiceFactory
} from "@app/services/folder-commit/folder-commit-service";
import { TProjectEnvDALFactory } from "@app/services/project-env/project-env-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TSecretFolderDALFactory } from "@app/services/secret-folder/secret-folder-dal";
import { TSecretFolderServiceFactory } from "@app/services/secret-folder/secret-folder-service";
import { TSecretV2BridgeServiceFactory } from "@app/services/secret-v2-bridge/secret-v2-bridge-service";
import { SecretOperations, SecretUpdateMode } from "@app/services/secret-v2-bridge/secret-v2-bridge-types";
import { TSecretQueueFactory } from "@app/services/secret/secret-queue";
import { TSecretServiceFactory } from "@app/services/secret/secret-service";
import { TProcessNewCommitRawDTO } from "@app/services/secret/secret-types";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { shouldApplyPolicy } from "../secret-approval-policy/secret-approval-policy-fns";
import { TSecretApprovalPolicyServiceFactory } from "../secret-approval-policy/secret-approval-policy-service";
import { TSecretApprovalRequestServiceFactory } from "../secret-approval-request/secret-approval-request-service";
import { TCreateSecretApprovalSideEffectsDTO } from "../secret-approval-request/secret-approval-request-types";
import { scanSecretPolicyViolations } from "../secret-scanning-v2/secret-scanning-v2-fns";

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
    "generateSecretApprovalRequest" | "generateSecretApprovalRequestV2Bridge" | "createSecretApprovalSideEffects"
  >;
  secretApprovalPolicyService: Pick<TSecretApprovalPolicyServiceFactory, "getSecretApprovalPolicy">;
  projectDAL: Pick<TProjectDALFactory, "checkProjectUpgradeStatus" | "findProjectBySlug" | "findById">;
  secretV2BridgeService: TSecretV2BridgeServiceFactory;
  folderCommitDAL: Pick<TFolderCommitDALFactory, "transaction">;
  secretQueueService: Pick<TSecretQueueFactory, "syncSecrets">;
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
  folderCommitDAL,
  secretQueueService
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
    sort,
    authorFilter
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
    authorFilter?: { actorId?: string; actorType?: string };
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
      sort,
      authorFilter
    });

    return {
      commits: result.commits.map(({ changeCounts, ...commit }) => ({
        ...commit,
        commitId: commit.commitId.toString(),
        summary: summarizeCommitChanges(changeCounts)
      })),
      total: result.total,
      hasMore: result.hasMore
    };
  };

  const getCommitAuthorsForFolder = async ({
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
    const authors = await folderCommitService.getCommitAuthorsForFolder({
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      projectId,
      environment,
      path
    });

    return { authors };
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
    deepRollback
  }: {
    actor: ActorType;
    actorId: string;
    actorOrgId: string;
    actorAuthMethod: ActorAuthMethod;
    projectId: string;
    commitId: string;
    folderId: string;
    deepRollback: boolean;
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

    if (targetCommit.folderId !== folderId) {
      throw new BadRequestError({
        message: `Commit with ID '${commitId}' does not belong to folder with ID '${folderId}'`
      });
    }

    const env = await projectEnvDAL.findOne({
      projectId,
      id: targetCommit.envId
    });

    if (!latestCommit) {
      throw new NotFoundError({ message: "Latest commit not found" });
    }

    const folderData = await folderService.getFolderById({
      actor,
      actorId,
      actorOrgId,
      actorAuthMethod,
      id: folderId
    });

    let diffs;
    if (deepRollback) {
      diffs = await folderCommitService.deepCompareFolder({
        targetCommitId: targetCommit.id,
        envId: env.id,
        projectId
      });
    } else {
      diffs = [
        {
          folderId: folderData.id,
          folderName: folderData.name,
          folderPath: folderData.path,
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

    return { diffs, environment: env.slug, folderPath: folderData.path };
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
    message
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
  }) => {
    const [folderWithPath] = await folderDAL.findSecretPathByFolderIds(projectId, [folderId]);
    if (!folderWithPath) {
      throw new NotFoundError({ message: `Folder with ID ${folderId} not found` });
    }

    const { permission: userPermission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    if (deepRollback) {
      ForbiddenError.from(userPermission).throwUnlessCan(
        ProjectPermissionCommitsActions.PerformRollback,
        subject(ProjectPermissionSub.Commits, {
          environment: folderWithPath.environmentSlug,
          secretPath: folderWithPath.path
        })
      );

      const deeperPath = folderWithPath.path === "/" ? "/**" : `${folderWithPath.path.replace(/\/$/, "")}/**`;
      ForbiddenError.from(userPermission).throwUnlessCan(
        ProjectPermissionCommitsActions.PerformRollback,
        subject(ProjectPermissionSub.Commits, {
          environment: folderWithPath.environmentSlug,
          secretPath: deeperPath
        })
      );
    } else {
      ForbiddenError.from(userPermission).throwUnlessCan(
        ProjectPermissionCommitsActions.PerformRollback,
        subject(ProjectPermissionSub.Commits, {
          environment: folderWithPath.environmentSlug,
          secretPath: folderWithPath.path
        })
      );
    }

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
      slug: folderWithPath.environmentSlug
    });

    if (!targetCommit || targetCommit.folderId !== folderId || targetCommit.envId !== env.id) {
      throw new NotFoundError({ message: "Target commit not found" });
    }

    if (!latestCommit || latestCommit.envId !== env.id) {
      throw new NotFoundError({ message: "Latest commit not found" });
    }

    if (deepRollback) {
      const { affectedFolderIds } = await folderCommitService.deepRollbackFolder(
        commitId,
        env.id,
        actorId,
        actor,
        projectId,
        message
      );

      // Trigger secret syncs for all affected folders in the deep rollback
      const folderPaths = await folderDAL.findSecretPathByFolderIds(projectId, affectedFolderIds);
      await Promise.all(
        folderPaths
          .filter((fp): fp is NonNullable<typeof fp> => fp != null && fp.path != null && fp.environmentSlug != null)
          .map((fp) =>
            secretQueueService.syncSecrets({
              secretPath: fp.path,
              projectId,
              orgId: actorOrgId,
              environmentSlug: fp.environmentSlug,
              environmentName: fp.environmentName,
              actorId,
              actor
            })
          )
      );

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

    // Trigger secret sync for the rolled-back folder if changes were made
    if (response.totalChanges > 0) {
      const folderPaths = await folderDAL.findSecretPathByFolderIds(projectId, [folderId]);
      const folderPath = folderPaths?.[0];
      if (folderPath?.path != null && folderPath.environmentSlug != null) {
        await secretQueueService.syncSecrets({
          secretPath: folderPath.path,
          projectId,
          orgId: actorOrgId,
          environmentSlug: folderPath.environmentSlug,
          environmentName: folderPath.environmentName,
          actorId,
          actor
        });
      }
    }

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

    // Trigger secret sync for the reverted folder
    if (response.folderId) {
      const folderPaths = await folderDAL.findSecretPathByFolderIds(projectId, [response.folderId]);
      const folderPath = folderPaths?.[0];
      if (folderPath?.path != null && folderPath.environmentSlug != null) {
        await secretQueueService.syncSecrets({
          secretPath: folderPath.path,
          projectId,
          orgId: actorOrgId,
          environmentSlug: folderPath.environmentSlug,
          environmentName: folderPath.environmentName,
          actorId,
          actor
        });
      }
    }

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
    const policy = await secretApprovalPolicyService.getSecretApprovalPolicy(projectId, environment, secretPath);
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

    // Secret detection is skipped for writes made inside a caller's transaction (the change request and
    // createManySecret below), so it runs here first. updateManySecret scans the direct updates itself.
    const secretsToScan = [
      ...(changes.secrets?.create ?? []),
      ...(shouldApplyPolicy(policy, actor) ? (changes.secrets?.update ?? []).filter((el) => el.secretValue) : [])
    ];
    if (secretsToScan.length) {
      await scanSecretPolicyViolations(
        projectId,
        secretPath,
        secretsToScan.map((el) => ({
          secretKey: "newSecretName" in el && el.newSecretName ? el.newSecretName : el.secretKey,
          secretValue: el.secretValue as string
        })),
        project.secretDetectionIgnoreValues || []
      );
    }

    // Notifying approvers reaches Slack, Teams and SMTP, so it waits until the request has committed
    let approvalSideEffects: TCreateSecretApprovalSideEffectsDTO | undefined;
    let environmentName = environment;
    const deferredReferenceSyncs: Parameters<TSecretQueueFactory["syncSecrets"]>[0][] = [];
    const response = await folderCommitDAL.transaction(async (trx) => {
      const targetFolder = await folderDAL.findBySecretPath(projectId, environment, secretPath, trx);
      if (!targetFolder)
        throw new NotFoundError({
          message: `Folder with path '${secretPath}' in environment with slug '${environment}' not found`,
          name: "CreateManySecret"
        });
      environmentName = targetFolder.environment.name;
      const commitChanges: TCommitResourceChangeDTO[] = [];
      const folders: { created: TSecretFolders[]; updated: TSecretFolders[]; deleted: TSecretFolders[] } = {
        created: [],
        updated: [],
        deleted: []
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
        folders.created = createdFolders.folders;
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
        folders.updated = updatedFolders.newFolders;
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
        folders.deleted = deletedFolders.folders;
      }

      if (shouldApplyPolicy(policy, actor)) {
        // When a policy exists, secret changes go through approval workflow
        // but folder changes should still be committed immediately since they're not affected by approval policies
        let commitId: string | undefined;
        if (commitChanges.length > 0) {
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
          commitId = commit?.id;
        }

        if (
          (changes.secrets?.create?.length ?? 0) > 0 ||
          (changes.secrets?.update?.length ?? 0) > 0 ||
          (changes.secrets?.delete?.length ?? 0) > 0
        ) {
          const approval = await secretApprovalRequestService.generateSecretApprovalRequestV2Bridge({
            policy,
            secretPath,
            environment,
            commitMessage: message,
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
            },
            trx,
            skipPostProcessing: true
          });
          approvalSideEffects = {
            secretApprovalRequest: { id: approval.id, policyId: approval.policyId, commits: approval.commits },
            projectId,
            environment,
            secretPath,
            secretKeys: [
              ...new Set(
                [
                  ...(changes.secrets?.create ?? []),
                  ...(changes.secrets?.update ?? []),
                  ...(changes.secrets?.delete ?? [])
                ].map((el) => el.secretKey)
              )
            ],
            actor,
            actorId,
            actorOrgId
          };
          return {
            approval,
            commitId,
            folders,
            secrets: { created: [], updated: [], deleted: [] },
            secretMutationEvents
          };
        }
        return {
          approval: undefined,
          commitId,
          folders,
          secrets: { created: [], updated: [], deleted: [] },
          secretMutationEvents
        };
      }

      const secrets: {
        created: Awaited<ReturnType<typeof secretV2BridgeService.createManySecret>>;
        updated: Awaited<ReturnType<typeof secretV2BridgeService.updateManySecret>>;
        deleted: Awaited<ReturnType<typeof secretV2BridgeService.deleteManySecret>>;
      } = { created: [], updated: [], deleted: [] };

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
          skipPostProcessing: true,
          commitChanges
        });
        secrets.created = newSecrets;
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
          skipPostProcessing: true,
          deferredReferenceSyncs,
          commitChanges
        });
        secrets.updated = updatedSecrets;
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
          skipPostProcessing: true,
          commitChanges
        });
        secrets.deleted = deletedSecrets;
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
          approval: undefined,
          folders,
          secrets,
          commitId: commit?.id,
          secretMutationEvents
        };
      }
      return {
        approval: undefined,
        folders,
        secrets,
        commitId: undefined,
        secretMutationEvents
      };
    });

    const secretSyncEvents = [
      { type: ProjectEvents.SecretCreate, secrets: response.secrets.created },
      { type: ProjectEvents.SecretUpdate, secrets: response.secrets.updated },
      { type: ProjectEvents.SecretDelete, secrets: response.secrets.deleted }
    ].filter((event) => event.secrets.length > 0);
    if (secretSyncEvents.length > 0) {
      try {
        await secretQueueService.syncSecrets({
          actor,
          actorId,
          secretPath,
          projectId,
          orgId: actorOrgId,
          environmentSlug: environment,
          environmentName,
          events: secretSyncEvents.map((event) => ({
            type: event.type,
            secretKeys: event.secrets.map((secret) => secret.secretKey),
            projectId,
            secretPath,
            environment
          }))
        });
      } catch (error) {
        logger.error(
          error,
          `Failed to queue secret sync for commit [projectId=${projectId}] [secretPath=${secretPath}]`
        );
      }
    }

    await Promise.all(
      deferredReferenceSyncs.map(async (syncPayload) => {
        try {
          await secretQueueService.syncSecrets(syncPayload);
        } catch (error) {
          logger.error(
            error,
            `Failed to queue secret sync for renamed secret references [projectId=${projectId}] [secretPath=${syncPayload.secretPath}]`
          );
        }
      })
    );

    if (approvalSideEffects) {
      try {
        await secretApprovalRequestService.createSecretApprovalSideEffects(approvalSideEffects);
      } catch (error) {
        logger.error(
          error,
          `Failed to notify approvers of secret change request [requestId=${approvalSideEffects.secretApprovalRequest.id}] [projectId=${projectId}]`
        );
      }
    }

    return response;
  };

  return {
    getCommitsCount,
    getCommitsForFolder,
    getCommitAuthorsForFolder,
    getCommitChanges,
    compareCommitChanges,
    rollbackToCommit,
    revertCommit,
    getFolderStateAtCommit,
    processNewCommitRaw
  };
};
