import slugify from "@sindresorhus/slugify";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TFolderPermissionDALFactory } from "./folder-permission-dal";
import {
  assertGrantTargetEligible,
  assertManageFolderAccess,
  computeTemporaryFields,
  resolveFolder,
  targetActorField,
  targetLabel,
  toFolderGrant
} from "./folder-permission-fns";
import {
  TCreateFolderGrantDTO,
  TDeleteFolderGrantDTO,
  TListFolderAccessActorsDTO,
  TUpdateFolderGrantDTO
} from "./folder-permission-types";

type TFolderPermissionServiceFactoryDep = {
  additionalPrivilegeDAL: Pick<
    TAdditionalPrivilegeDALFactory,
    "findOne" | "create" | "updateById" | "deleteById" | "transaction"
  >;
  secretFolderDAL: Pick<TSecretFolderDALFactory, "findBySecretPath">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "invalidateProjectFolderPermissionCache">;
  folderPermissionDAL: Pick<
    TFolderPermissionDALFactory,
    "findUsersWithFolderAccess" | "findIdentitiesWithFolderAccess" | "hasProjectAccess" | "isProjectAdmin"
  >;
};

export type TFolderPermissionServiceFactory = ReturnType<typeof folderPermissionServiceFactory>;

export const folderPermissionServiceFactory = ({
  additionalPrivilegeDAL,
  secretFolderDAL,
  permissionService,
  folderPermissionDAL
}: TFolderPermissionServiceFactoryDep) => {
  const createFolderGrant = async (dto: TCreateFolderGrantDTO) => {
    const { projectId, environmentSlug, secretPath, target } = dto;
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    await assertManageFolderAccess(dto.permission, projectId, folder, permissionService);
    await assertGrantTargetEligible(dto.permission.orgId, projectId, target, folderPermissionDAL);

    const actorField = targetActorField(target);
    const alreadyExistsError = () =>
      new BadRequestError({
        message: `${targetLabel(target)} with ID '${target.actorId}' already has folder access on this folder with the '${dto.role}' role or another one. Update the existing access instead of creating a new one.`
      });

    try {
      const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
        const existing = await additionalPrivilegeDAL.findOne(
          { projectId, folderId: folder.id, [actorField]: target.actorId },
          tx
        );
        if (existing) throw alreadyExistsError();

        const doc = await additionalPrivilegeDAL.create(
          {
            name: slugify(alphaNumericNanoId(8)),
            projectId,
            folderId: folder.id,
            role: dto.role,
            [actorField]: target.actorId,
            ...computeTemporaryFields(dto.type)
          },
          tx
        );
        await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
        return doc;
      });

      return { folderAccess: toFolderGrant(grant, projectId, folder) };
    } catch (error) {
      const dbError = error instanceof DatabaseError ? (error.error as { code?: string }) : null;
      if (dbError?.code === DatabaseErrorCode.UniqueViolation) throw alreadyExistsError();
      throw error;
    }
  };

  const updateFolderGrant = async (dto: TUpdateFolderGrantDTO) => {
    const { projectId, environmentSlug, secretPath, target } = dto;
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    await assertManageFolderAccess(dto.permission, projectId, folder, permissionService);
    await assertGrantTargetEligible(dto.permission.orgId, projectId, target, folderPermissionDAL);

    const actorField = targetActorField(target);
    const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
      const existing = await additionalPrivilegeDAL.findOne(
        { projectId, folderId: folder.id, [actorField]: target.actorId },
        tx
      );
      if (!existing) {
        throw new NotFoundError({
          message: `No folder access found for ${targetLabel(target).toLowerCase()} with ID '${target.actorId}' on the folder at path '${folder.path}' in environment with slug '${folder.environmentSlug}'. Create one first.`
        });
      }

      const doc = await additionalPrivilegeDAL.updateById(
        existing.id,
        {
          ...(dto.role ? { role: dto.role } : {}),
          ...(dto.type === undefined ? {} : computeTemporaryFields(dto.type))
        },
        tx
      );
      await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
      return doc;
    });

    return { folderAccess: toFolderGrant(grant, projectId, folder) };
  };

  const deleteFolderGrant = async (dto: TDeleteFolderGrantDTO) => {
    const { projectId, environmentSlug, secretPath, target } = dto;
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    await assertManageFolderAccess(dto.permission, projectId, folder, permissionService);
    // no membership check on revoke: removing access from an actor that already left the project
    // must keep working

    const actorField = targetActorField(target);
    const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
      const existing = await additionalPrivilegeDAL.findOne(
        { projectId, folderId: folder.id, [actorField]: target.actorId },
        tx
      );
      if (!existing) {
        throw new NotFoundError({
          message: `No folder access found for ${targetLabel(target).toLowerCase()} with ID '${target.actorId}' on the folder at path '${folder.path}' in environment with slug '${folder.environmentSlug}'`
        });
      }

      const doc = await additionalPrivilegeDAL.deleteById(existing.id, tx);
      await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
      return doc;
    });

    return { folderAccess: toFolderGrant(grant, projectId, folder) };
  };

  const listFolderAccessUsers = async (dto: TListFolderAccessActorsDTO) => {
    const { projectId, environmentSlug, secretPath, limit, offset, search } = dto;
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    await assertManageFolderAccess(dto.permission, projectId, folder, permissionService);

    const { users, totalCount } = await folderPermissionDAL.findUsersWithFolderAccess({
      projectId,
      orgId: dto.permission.orgId,
      folderId: folder.id,
      search,
      limit,
      offset
    });

    return {
      users: users.map(({ folderAccess, ...user }) => ({
        ...user,
        folderRBACAccess: folderAccess ? toFolderGrant(folderAccess, projectId, folder) : null
      })),
      totalCount
    };
  };

  const listFolderAccessIdentities = async (dto: TListFolderAccessActorsDTO) => {
    const { projectId, environmentSlug, secretPath, limit, offset, search } = dto;
    const folder = await resolveFolder(projectId, environmentSlug, secretPath, secretFolderDAL);
    await assertManageFolderAccess(dto.permission, projectId, folder, permissionService);

    const { identities, totalCount } = await folderPermissionDAL.findIdentitiesWithFolderAccess({
      projectId,
      orgId: dto.permission.orgId,
      folderId: folder.id,
      search,
      limit,
      offset
    });

    return {
      identities: identities.map(({ folderAccess, ...identity }) => ({
        ...identity,
        folderRBACAccess: folderAccess ? toFolderGrant(folderAccess, projectId, folder) : null
      })),
      totalCount
    };
  };

  return {
    createFolderGrant,
    updateFolderGrant,
    deleteFolderGrant,
    listFolderAccessUsers,
    listFolderAccessIdentities
  };
};
