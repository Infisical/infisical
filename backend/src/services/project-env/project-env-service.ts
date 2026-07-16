import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas";
import { TAccessApprovalPolicyEnvironmentDALFactory } from "@app/ee/services/access-approval-policy/access-approval-policy-environment-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { TSecretApprovalPolicyEnvironmentDALFactory } from "@app/ee/services/secret-approval-policy/secret-approval-policy-environment-dal";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ActorType } from "../auth/auth-type";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TProjectEnvDALFactory } from "./project-env-dal";
import { SOFT_DELETE_GRACE_MS } from "./project-env-queue";
import {
  TCreateEnvDTO,
  TDeleteEnvDTO,
  TGetEnvBySlugDTO,
  TGetEnvDTO,
  TRestoreEnvDTO,
  TUpdateEnvDTO
} from "./project-env-types";

type TProjectEnvServiceFactoryDep = {
  projectEnvDAL: TProjectEnvDALFactory;
  folderDAL: Pick<TSecretFolderDALFactory, "create">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "setItemWithExpiry" | "getItem" | "waitTillReady" | "deleteItem">;
  accessApprovalPolicyEnvironmentDAL: Pick<TAccessApprovalPolicyEnvironmentDALFactory, "findAvailablePoliciesByEnvId">;
  secretApprovalPolicyEnvironmentDAL: Pick<TSecretApprovalPolicyEnvironmentDALFactory, "findAvailablePoliciesByEnvId">;
};

export type TProjectEnvServiceFactory = ReturnType<typeof projectEnvServiceFactory>;

export const projectEnvServiceFactory = ({
  projectEnvDAL,
  permissionService,
  licenseService,
  keyStore,
  folderDAL,
  accessApprovalPolicyEnvironmentDAL,
  secretApprovalPolicyEnvironmentDAL
}: TProjectEnvServiceFactoryDep) => {
  const createEnvironment = async ({
    projectId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    position,
    name,
    slug
  }: TCreateEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Create, ProjectPermissionSub.Environments);

    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectEnvironmentLock(projectId)], 5000)
      .catch(() => null);

    try {
      if (!lock) {
        await keyStore.waitTillReady({
          key: KeyStorePrefixes.WaitUntilReadyProjectEnvironmentOperation(projectId),
          keyCheckCb: (val) => val === "true",
          waitingCb: () => logger.debug("Create project environment. Waiting for "),
          delay: 500
        });
      }

      const envs = await projectEnvDAL.find({ projectId });

      const slugHolder = await projectEnvDAL.findBySlugIncludingExpired(projectId, slug);
      if (slugHolder) {
        if (slugHolder.deleteAfter) {
          throw new BadRequestError({
            message: `Environment slug '${slug}' is held by a pending-deletion environment. Permanently delete that environment first, then retry.`,
            name: "CreateEnvironment"
          });
        }
        throw new BadRequestError({
          message: "Environment with slug already exists",
          name: "CreateEnvironment"
        });
      }

      // getProjectPermission above guarantees project existence and org membership,
      // so actorOrgId === project.orgId — no separate project lookup needed.
      const plan = await licenseService.getPlan(actorOrgId);
      if (plan.environmentLimit !== null && envs.length >= plan.environmentLimit) {
        // case: limit imposed on number of environments allowed
        // case: number of environments used exceeds the number of environments allowed
        throw new BadRequestError({
          message:
            "Failed to create environment due to environment limit reached. Upgrade plan to create more environments."
        });
      }

      const env = await projectEnvDAL.transaction(async (tx) => {
        if (position !== undefined) {
          // Check if there's an environment at the specified position
          const existingEnvWithPosition = await projectEnvDAL.findOne({ projectId, position }, tx);

          // If there is, then shift positions
          if (existingEnvWithPosition) {
            await projectEnvDAL.shiftPositions(projectId, position, tx);
          }

          const doc = await projectEnvDAL.create({ slug, name, projectId, position }, tx);
          await folderDAL.create({ name: "root", parentId: null, envId: doc.id, version: 1 }, tx);

          return doc;
        }
        // If no position is specified, add to the end
        const lastPos = await projectEnvDAL.findLastEnvPosition(projectId, tx);
        const doc = await projectEnvDAL.create({ slug, name, projectId, position: lastPos + 1 }, tx);
        await folderDAL.create({ name: "root", parentId: null, envId: doc.id, version: 1 }, tx);

        return doc;
      });

      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.WaitUntilReadyProjectEnvironmentOperation(projectId),
        KeyStoreTtls.ProjectEnvironmentOperationMarkerInSeconds,
        "true"
      );

      return env;
    } finally {
      await lock?.release();
    }
  };

  const updateEnvironment = async ({
    projectId,
    slug,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    name,
    id,
    position
  }: TUpdateEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.Environments);

    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectEnvironmentLock(projectId)], 5000)
      .catch(() => null);

    try {
      if (!lock) {
        await keyStore.waitTillReady({
          key: KeyStorePrefixes.WaitUntilReadyProjectEnvironmentOperation(projectId),
          keyCheckCb: (val) => val === "true",
          waitingCb: () => logger.debug("Update project environment. Waiting for project environment update"),
          delay: 500
        });
      }

      const oldEnv = await projectEnvDAL.findOne({ id, projectId });
      if (!oldEnv) {
        throw new NotFoundError({
          message: `Environment with id '${id}' in project with ID '${projectId}' not found`
        });
      }
      if (slug) {
        const slugHolder = await projectEnvDAL.findBySlugIncludingExpired(projectId, slug);
        if (slugHolder && slugHolder.id !== id) {
          if (slugHolder.deleteAfter) {
            throw new BadRequestError({
              message: `Environment slug '${slug}' is held by a pending-deletion environment. Permanently delete that environment first, then retry.`,
              name: "UpdateEnvironment"
            });
          }
          throw new BadRequestError({
            message: "Environment with slug already exists",
            name: "UpdateEnvironment"
          });
        }
      }

      const envs = await projectEnvDAL.find({ projectId });
      // getProjectPermission above guarantees project existence and org membership,
      // so actorOrgId === project.orgId — no separate project lookup needed.
      const plan = await licenseService.getPlan(actorOrgId);
      if (plan.environmentLimit !== null && envs.length > plan.environmentLimit) {
        // case: limit imposed on number of environments allowed
        // case: number of environments used exceeds the number of environments allowed
        throw new BadRequestError({
          message:
            "Failed to update environment due to environment limit exceeded. To update an environment, please upgrade your plan or remove unused environments."
        });
      }

      const env = await projectEnvDAL.transaction(async (tx) => {
        if (position) {
          const existingEnvWithPosition = await projectEnvDAL.findOne({ projectId, position }, tx);

          if (existingEnvWithPosition && existingEnvWithPosition.id !== oldEnv.id) {
            await projectEnvDAL.updateAllPosition(projectId, oldEnv.position, position, tx);
          }
        }
        return projectEnvDAL.updateById(oldEnv.id, { name, slug, position }, tx);
      });

      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.WaitUntilReadyProjectEnvironmentOperation(projectId),
        KeyStoreTtls.ProjectEnvironmentOperationMarkerInSeconds,
        "true"
      );

      return { environment: env, old: oldEnv };
    } finally {
      await lock?.release();
    }
  };

  const deleteEnvironment = async ({
    projectId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    id,
    hardDelete = false
  }: TDeleteEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Environments);

    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectEnvironmentLock(projectId)], 5000)
      .catch(() => null);

    try {
      if (!lock) {
        await keyStore.waitTillReady({
          key: KeyStorePrefixes.WaitUntilReadyProjectEnvironmentOperation(projectId),
          keyCheckCb: (val) => val === "true",
          waitingCb: () => logger.debug("Delete project environment. Waiting for "),
          delay: 500
        });
      }

      const env = await projectEnvDAL.transaction(async (tx) => {
        const secretApprovalPolicies = await secretApprovalPolicyEnvironmentDAL.findAvailablePoliciesByEnvId(id, tx);
        if (secretApprovalPolicies.length > 0) {
          throw new BadRequestError({
            message: "Environment is in use by a secret approval policy",
            name: "DeleteEnvironment"
          });
        }
        const accessApprovalPolicies = await accessApprovalPolicyEnvironmentDAL.findAvailablePoliciesByEnvId(id, tx);
        if (accessApprovalPolicies.length > 0) {
          throw new BadRequestError({
            message: "Environment is in use by an access approval policy",
            name: "DeleteEnvironment"
          });
        }
        if (hardDelete) {
          const [doc] = await projectEnvDAL.delete({ id, projectId }, tx);
          if (!doc)
            throw new NotFoundError({
              message: `Environment with id '${id}' in project with ID '${projectId}' not found`,
              name: "DeleteEnvironment"
            });

          await projectEnvDAL.closePositionGap(projectId, doc.position, tx);

          return doc;
        }

        const target = await projectEnvDAL.findOne({ id, projectId }, tx);
        if (!target)
          throw new NotFoundError({
            message: `Environment with id '${id}' in project with ID '${projectId}' not found`,
            name: "DeleteEnvironment"
          });

        const maxPos = await projectEnvDAL.findLastEnvPosition(projectId, tx);
        // Shift active rows first (closes the gap at oldPos), then place the
        // soft-deleted row at the pre-shift max active position. That slot is
        // now free since its previous active occupant was shifted down.
        await projectEnvDAL.closePositionGap(projectId, target.position, tx);

        const softDeletedAt = new Date();
        const deleteAfter = new Date(softDeletedAt.getTime() + SOFT_DELETE_GRACE_MS);
        const deletedByUserId = actor === ActorType.USER ? actorId : null;
        const deletedByIdentityId = actor === ActorType.IDENTITY ? actorId : null;
        const doc = await projectEnvDAL.softDeleteById(
          id,
          projectId,
          deleteAfter,
          softDeletedAt,
          deletedByUserId,
          deletedByIdentityId,
          maxPos,
          tx
        );
        if (!doc)
          throw new NotFoundError({
            message: `Environment with id '${id}' in project with ID '${projectId}' not found`,
            name: "DeleteEnvironment"
          });

        return doc;
      });

      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.WaitUntilReadyProjectEnvironmentOperation(projectId),
        KeyStoreTtls.ProjectEnvironmentOperationMarkerInSeconds,
        "true"
      );

      return env;
    } finally {
      await lock?.release();
    }
  };

  const restoreEnvironment = async ({ projectId, actor, actorId, actorOrgId, actorAuthMethod, id }: TRestoreEnvDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });
    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Delete, ProjectPermissionSub.Environments);

    const operationMarkerKey = KeyStorePrefixes.WaitUntilReadyProjectEnvironmentOperation(projectId);
    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectEnvironmentLock(projectId)], 5000)
      .catch(() => null);

    try {
      if (!lock) {
        await keyStore.waitTillReady({
          key: operationMarkerKey,
          keyCheckCb: (val) => !val || val === "false",
          waitingCb: () =>
            logger.debug("Restore project environment. Waiting for previous environment operation to finish"),
          delay: 500
        });
      }

      await keyStore.setItemWithExpiry(
        operationMarkerKey,
        KeyStoreTtls.ProjectEnvironmentOperationMarkerInSeconds,
        "true"
      );

      const env = await projectEnvDAL.transaction(async (tx) => {
        const target = await projectEnvDAL.findByIdIncludingExpired(id, tx);
        if (!target || target.projectId !== projectId || target.deleteAfter === null) {
          throw new NotFoundError({
            message: `Soft-deleted environment with id '${id}' in project with ID '${projectId}' not found`,
            name: "RestoreEnvironment"
          });
        }

        const slugConflict = await projectEnvDAL.findOne({ projectId, slug: target.slug }, tx);
        if (slugConflict) {
          throw new BadRequestError({
            message: `Cannot restore environment: slug '${target.slug}' is already in use by another environment in this project. Rename or remove the conflicting environment, then retry.`,
            name: "RestoreEnvironment"
          });
        }

        const activeEnvs = await projectEnvDAL.find({ projectId }, { tx });
        // getProjectPermission above guarantees project existence and org membership,
        // so actorOrgId === project.orgId — no separate project lookup needed.
        const plan = await licenseService.getPlan(actorOrgId);
        if (plan.environmentLimit !== null && activeEnvs.length >= plan.environmentLimit) {
          throw new BadRequestError({
            message:
              "Failed to restore environment due to environment limit reached. Upgrade plan or remove an existing environment."
          });
        }

        const lastPos = await projectEnvDAL.findLastEnvPosition(projectId, tx);
        const doc = await projectEnvDAL.restoreById(id, projectId, lastPos + 1, tx);
        if (!doc)
          throw new NotFoundError({
            message: `Soft-deleted environment with id '${id}' in project with ID '${projectId}' not found`,
            name: "RestoreEnvironment"
          });

        return doc;
      });

      return env;
    } finally {
      await keyStore.deleteItem(operationMarkerKey);
      await lock?.release();
    }
  };

  const getEnvironmentById = async ({ actor, actorId, actorOrgId, actorAuthMethod, id }: TGetEnvDTO) => {
    const environment = await projectEnvDAL.findById(id);

    if (!environment) {
      throw new NotFoundError({
        message: `Environment with ID '${id}' not found`
      });
    }

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: environment.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);

    return environment;
  };

  const getEnvironmentBySlug = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    projectId,
    slug
  }: TGetEnvBySlugDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.SecretManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Environments);

    const environment = await projectEnvDAL.findOne({ projectId, slug });

    if (!environment) {
      throw new NotFoundError({
        message: `Environment with slug '${slug}' in project with ID '${projectId}' not found`
      });
    }

    return environment;
  };

  return {
    createEnvironment,
    updateEnvironment,
    deleteEnvironment,
    restoreEnvironment,
    getEnvironmentById,
    getEnvironmentBySlug
  };
};
