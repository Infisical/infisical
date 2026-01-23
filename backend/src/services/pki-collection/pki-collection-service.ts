import { ForbiddenError } from "@casl/ability";

import { ActionProjectType } from "@app/db/schemas/models";
import { TPkiCollectionItems } from "@app/db/schemas/pki-collection-items";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateAuthorityDALFactory } from "@app/services/certificate-authority/certificate-authority-dal";

import { TPkiCollectionDALFactory } from "./pki-collection-dal";
import { transformPkiCollectionItem } from "./pki-collection-fns";
import { TPkiCollectionItemDALFactory } from "./pki-collection-item-dal";
import {
  PkiItemType,
  TAddItemToPkiCollectionDTO,
  TCreatePkiCollectionDTO,
  TDeletePkiCollectionDTO,
  TGetPkiCollectionByIdDTO,
  TGetPkiCollectionItems,
  TRemoveItemFromPkiCollectionDTO,
  TUpdatePkiCollectionDTO
} from "./pki-collection-types";

type TPkiCollectionServiceFactoryDep = {
  pkiCollectionDAL: Pick<TPkiCollectionDALFactory, "create" | "findById" | "updateById" | "deleteById">;
  pkiCollectionItemDAL: Pick<
    TPkiCollectionItemDALFactory,
    "findOne" | "create" | "deleteById" | "findPkiCollectionItems" | "countItemsInPkiCollection"
  >;
  certificateAuthorityDAL: Pick<TCertificateAuthorityDALFactory, "find" | "findOne">;
  certificateDAL: Pick<TCertificateDALFactory, "find">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
};

export type TPkiCollectionServiceFactory = ReturnType<typeof pkiCollectionServiceFactory>;

export const pkiCollectionServiceFactory = ({
  pkiCollectionDAL,
  pkiCollectionItemDAL,
  certificateAuthorityDAL,
  certificateDAL,
  permissionService
}: TPkiCollectionServiceFactoryDep) => {
  const createPkiCollection = async ({
    name,
    description,
    projectId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TCreatePkiCollectionDTO) => {
    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.PkiCollections
    );

    const pkiCollection = await pkiCollectionDAL.create({
      projectId,
      name,
      description
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
    if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${collectionId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiCollections);
    return pkiCollection;
  };

  const updatePkiCollection = async ({
    collectionId,
    name,
    description,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TUpdatePkiCollectionDTO) => {
    let pkiCollection = await pkiCollectionDAL.findById(collectionId);
    if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${collectionId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Edit, ProjectPermissionSub.PkiCollections);
    pkiCollection = await pkiCollectionDAL.updateById(collectionId, {
      name,
      description
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
    if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${collectionId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.PkiCollections
    );
    pkiCollection = await pkiCollectionDAL.deleteById(collectionId);
    return pkiCollection;
  };

  const getPkiCollectionItems = async ({
    collectionId,
    type,
    offset = 0,
    limit = 25,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId
  }: TGetPkiCollectionItems) => {
    const pkiCollection = await pkiCollectionDAL.findById(collectionId);
    if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${collectionId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.PkiCollections);

    const pkiCollectionItems = await pkiCollectionItemDAL.findPkiCollectionItems({
      collectionId,
      type,
      offset,
      limit
    });

    const count = await pkiCollectionItemDAL.countItemsInPkiCollection(collectionId);

    return {
      pkiCollection,
      pkiCollectionItems: pkiCollectionItems.map((p) => ({
        ...transformPkiCollectionItem(p),
        notBefore: p.notBefore,
        notAfter: p.notAfter,
        friendlyName: p.friendlyName
      })),
      totalCount: count
    };
  };

  const addItemToPkiCollection = async ({
    collectionId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    type,
    itemId
  }: TAddItemToPkiCollectionDTO) => {
    const pkiCollection = await pkiCollectionDAL.findById(collectionId);
    if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${collectionId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Create,
      ProjectPermissionSub.PkiCollections
    );

    let pkiCollectionItem: TPkiCollectionItems;
    switch (type) {
      case PkiItemType.CA: {
        // validate that CA has not already been added to PKI collection
        const isCaAdded = await pkiCollectionItemDAL.findOne({
          pkiCollectionId: collectionId,
          caId: itemId
        });

        if (isCaAdded) throw new BadRequestError({ message: "CA is already part of the PKI collection" });

        // validate that there exists a CA in same project as PKI collection
        const ca = await certificateAuthorityDAL.findOne({
          id: itemId,
          projectId: pkiCollection.projectId
        });

        if (!ca) throw new NotFoundError({ message: `CA with ID '${itemId}' not found` });

        pkiCollectionItem = await pkiCollectionItemDAL.create({
          pkiCollectionId: collectionId,
          caId: itemId
        });
        break;
      }
      case PkiItemType.CERTIFICATE: {
        // validate that certificate has not already been added to PKI collection
        const isCertAdded = await pkiCollectionItemDAL.findOne({
          pkiCollectionId: collectionId,
          certId: itemId
        });
        if (isCertAdded) throw new BadRequestError({ message: "Certificate already part of the PKI collection" });

        const [certificate] = await certificateDAL.find({
          projectId: pkiCollection.projectId,
          id: itemId
        });
        if (!certificate) throw new NotFoundError({ message: `Certificate with ID '${itemId}' not found` });

        pkiCollectionItem = await pkiCollectionItemDAL.create({
          pkiCollectionId: collectionId,
          certId: itemId
        });
        break;
      }
      default: {
        throw new BadRequestError({ message: "Invalid PKI item type" });
      }
    }

    return {
      pkiCollection,
      pkiCollectionItem: transformPkiCollectionItem(pkiCollectionItem)
    };
  };

  const removeItemFromPkiCollection = async ({
    collectionId,
    actorId,
    actorAuthMethod,
    actor,
    actorOrgId,
    itemId
  }: TRemoveItemFromPkiCollectionDTO) => {
    const pkiCollection = await pkiCollectionDAL.findById(collectionId);
    if (!pkiCollection) throw new NotFoundError({ message: `PKI collection with ID '${collectionId}' not found` });

    let pkiCollectionItem = await pkiCollectionItemDAL.findOne({
      pkiCollectionId: collectionId,
      id: itemId
    });

    if (!pkiCollectionItem) throw new NotFoundError({ message: `PKI collection item with ID '${itemId}' not found` });

    const { permission } = await permissionService.getProjectPermission({
      actor,
      actorId,
      projectId: pkiCollection.projectId,
      actorAuthMethod,
      actorOrgId,
      actionProjectType: ActionProjectType.CertificateManager
    });

    ForbiddenError.from(permission).throwUnlessCan(
      ProjectPermissionActions.Delete,
      ProjectPermissionSub.PkiCollections
    );

    pkiCollectionItem = await pkiCollectionItemDAL.deleteById(itemId);

    return {
      pkiCollection,
      pkiCollectionItem: transformPkiCollectionItem(pkiCollectionItem)
    };
  };

  return {
    createPkiCollection,
    getPkiCollectionById,
    updatePkiCollection,
    deletePkiCollection,
    getPkiCollectionItems,
    addItemToPkiCollection,
    removeItemFromPkiCollection
  };
};
