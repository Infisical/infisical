import slugify from "@sindresorhus/slugify";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { DatabaseErrorCode } from "@app/lib/error-codes";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TMembershipDALFactory } from "../membership/membership-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import {
  assertManageFolderAccess,
  assertTargetMembership,
  computeTemporaryFields,
  resolveFolder,
  targetActorField,
  targetLabel,
  toFolderGrant
} from "./folder-permission-fns";
import { TCreateFolderGrantDTO, TDeleteFolderGrantDTO, TUpdateFolderGrantDTO } from "./folder-permission-types";

type TFolderPermissionServiceFactoryDep = {
  additionalPrivilegeDAL: Pick<
    TAdditionalPrivilegeDALFactory,
    "findOne" | "create" | "updateById" | "deleteById" | "transaction"
  >;
  secretFolderDAL: Pick<TSecretFolderDALFactory, "findSecretPathByFolderIds">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "invalidateProjectFolderPermissionCache">;
  membershipDAL: Pick<TMembershipDALFactory, "findOne">;
};

export type TFolderPermissionServiceFactory = ReturnType<typeof folderPermissionServiceFactory>;

export const folderPermissionServiceFactory = ({
  additionalPrivilegeDAL,
  secretFolderDAL,
  permissionService,
  membershipDAL
}: TFolderPermissionServiceFactoryDep) => {
  const createFolderGrant = async (dto: TCreateFolderGrantDTO) => {
    const { projectId, folderId, target } = dto;
    const folder = await resolveFolder(projectId, folderId, secretFolderDAL);
    await assertManageFolderAccess(dto.permission, projectId, folder, permissionService);
    await assertTargetMembership(dto.permission.orgId, projectId, target, membershipDAL);

    const actorField = targetActorField(target);
    const alreadyExistsError = () =>
      new BadRequestError({
        message: `${targetLabel(target)} with ID '${target.actorId}' already has folder access on this folder with the '${dto.role}' role or another one. Update the existing access instead of creating a new one.`
      });

    try {
      const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
        const existing = await additionalPrivilegeDAL.findOne(
          { projectId, folderId, [actorField]: target.actorId },
          tx
        );
        if (existing) throw alreadyExistsError();

        const doc = await additionalPrivilegeDAL.create(
          {
            name: slugify(alphaNumericNanoId(8)),
            projectId,
            folderId,
            role: dto.role,
            [actorField]: target.actorId,
            ...computeTemporaryFields(dto.type)
          },
          tx
        );
        await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
        return doc;
      });

      return { folderAccess: toFolderGrant(grant, projectId, folderId, folder) };
    } catch (error) {
      const dbError = error instanceof DatabaseError ? (error.error as { code?: string }) : null;
      if (dbError?.code === DatabaseErrorCode.UniqueViolation) throw alreadyExistsError();
      throw error;
    }
  };

  const updateFolderGrant = async (dto: TUpdateFolderGrantDTO) => {
    const { projectId, folderId, target } = dto;
    const folder = await resolveFolder(projectId, folderId, secretFolderDAL);
    await assertManageFolderAccess(dto.permission, projectId, folder, permissionService);
    await assertTargetMembership(dto.permission.orgId, projectId, target, membershipDAL);

    const actorField = targetActorField(target);
    const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
      const existing = await additionalPrivilegeDAL.findOne({ projectId, folderId, [actorField]: target.actorId }, tx);
      if (!existing) {
        throw new NotFoundError({
          message: `No folder access found for ${targetLabel(target).toLowerCase()} with ID '${target.actorId}' on folder with ID '${folderId}'. Create one first.`
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

    return { folderAccess: toFolderGrant(grant, projectId, folderId, folder) };
  };

  const deleteFolderGrant = async (dto: TDeleteFolderGrantDTO) => {
    const { projectId, folderId, target } = dto;
    const folder = await resolveFolder(projectId, folderId, secretFolderDAL);
    await assertManageFolderAccess(dto.permission, projectId, folder, permissionService);
    // no membership check on revoke: removing access from an actor that already left the project
    // must keep working

    const actorField = targetActorField(target);
    const grant = await additionalPrivilegeDAL.transaction(async (tx) => {
      const existing = await additionalPrivilegeDAL.findOne({ projectId, folderId, [actorField]: target.actorId }, tx);
      if (!existing) {
        throw new NotFoundError({
          message: `No folder access found for ${targetLabel(target).toLowerCase()} with ID '${target.actorId}' on folder with ID '${folderId}'`
        });
      }

      const doc = await additionalPrivilegeDAL.deleteById(existing.id, tx);
      await permissionService.invalidateProjectFolderPermissionCache(projectId, tx);
      return doc;
    });

    return { folderAccess: toFolderGrant(grant, projectId, folderId, folder) };
  };

  return {
    createFolderGrant,
    updateFolderGrant,
    deleteFolderGrant
  };
};
