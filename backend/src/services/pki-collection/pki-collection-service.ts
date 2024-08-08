import { ForbiddenError } from "@casl/ability";

import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { NotFoundError } from "@app/lib/errors";

import { TPkiCollectionDALFactory } from "./pki-collection-dal";
import {
  TCreatePkiCollectionDTO,
  TDeletePkiCollectionDTO,
  TGetPkiCollectionByIdDTO,
  TUpdatePkiCollectionDTO
} from "./pki-collection-types";

type TPkiCollectionServiceFactoryDep = {
  pkiCollectionDAL: TPkiCollectionDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPkiCollectionServiceFactory = ReturnType<typeof pkiCollectionServiceFactory>;

export const pkiCollectionServiceFactory = ({
  pkiCollectionDAL,
  permissionService
}: TPkiCollectionServiceFactoryDep) => {
  const createPkiCollection = async ({
    name,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreatePkiCollectionDTO) => {
    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.PkiCollections
    );

    const pkiCollection = await pkiCollectionDAL.create({
      projectId,
      name
    });

    return pkiCollection;
  };

  const getPkiCollectionById = async ({
    collectionId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetPkiCollectionByIdDTO) => {
    const pkiCollection = await pkiCollectionDAL.findById(collectionId);
    if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiCollections);
    return pkiCollection;
  };

  const updatePkiCollection = async ({
    collectionId,
    name,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdatePkiCollectionDTO) => {
    let pkiCollection = await pkiCollectionDAL.findById(collectionId);
    if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiCollections);
    pkiCollection = await pkiCollectionDAL.updateById(collectionId, {
      name
    });

    return pkiCollection;
  };

  const deletePkiCollection = async ({
    collectionId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TDeletePkiCollectionDTO) => {
    let pkiCollection = await pkiCollectionDAL.findById(collectionId);
    if (!pkiCollection) throw new NotFoundError({ message: "PKI collection not found" });

    const { permission } = await permissionService.getProjectPermission(
      actor,
      actorId,
      pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.PkiCollections
    );
    pkiCollection = await pkiCollectionDAL.deleteById(collectionId);
    return pkiCollection;
  };

  // TODO: add/remove pki collection items

  return {
    createPkiCollection,
    getPkiCollectionById,
    updatePkiCollection,
    deletePkiCollection
  };
};
