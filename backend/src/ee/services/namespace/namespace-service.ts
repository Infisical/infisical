import { ForbiddenError } from "@casl/ability";

import { TNamespaces } from "@app/db/schemas";
import { BadRequestError, NotFoundError } from "@app/lib/errors";

import { OrgPermissionNamespaceActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";

import { TNamespaceDALFactory } from "./namespace-dal";
import {
  TCreateNamespaceDTO,
  TDeleteNamespaceDTO,
  TGetByNameNamespaceDTO,
  TListNamespaceDTO,
  TUpdateNamespaceDTO
} from "./namespace-types";

type TNamespaceServiceFactoryDep = {
  namespaceDAL: TNamespaceDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
};

export type TNamespaceServiceFactory = {
  createNamespace: (dto: TCreateNamespaceDTO) => Promise<TNamespaces>;
  updateNamespace: (dto: TUpdateNamespaceDTO) => Promise<TNamespaces>;
  deleteNamespace: (dto: TDeleteNamespaceDTO) => Promise<TNamespaces>;
  listNamespaces: (dto: TListNamespaceDTO) => Promise<TNamespaces[]>;
  getNamespaceByName: (dto: TGetByNameNamespaceDTO) => Promise<TNamespaces>;
};

export const namespaceServiceFactory = ({
  namespaceDAL,
  permissionService
}: TNamespaceServiceFactoryDep): TNamespaceServiceFactory => {
  const createNamespace: TNamespaceServiceFactory["createNamespace"] = async ({ permission, name, description }) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );
    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionNamespaceActions.Create,
      OrgPermissionSubjects.Namespace
    );

    const existingNamespace = await namespaceDAL.findOne({ name, orgId: permission.orgId });
    if (existingNamespace) {
      throw new BadRequestError({ message: `Namespace with name '${name}' already exists` });
    }

    const namespace = await namespaceDAL.create({
      name,
      description,
      orgId: permission.orgId
    });

    return namespace;
  };

  const updateNamespace: TNamespaceServiceFactory["updateNamespace"] = async ({
    permission,
    name,
    newName,
    description
  }: TUpdateNamespaceDTO) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );
    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionNamespaceActions.Edit,
      OrgPermissionSubjects.Namespace
    );

    const existingNamespace = await namespaceDAL.findOne({ name, orgId: permission.orgId });
    if (!existingNamespace) {
      throw new NotFoundError({ message: `Namespace with name '${name}' not found` });
    }

    if (newName && newName !== name) {
      const namespaceWithNewName = await namespaceDAL.findOne({ name: newName, orgId: permission.orgId });
      if (namespaceWithNewName) {
        throw new BadRequestError({ message: `Namespace with name '${newName}' already exists` });
      }
    }

    const [updatedNamespace] = await namespaceDAL.update(
      { id: existingNamespace.id },
      {
        ...(newName && { name: newName }),
        ...(description !== undefined && { description })
      }
    );

    return updatedNamespace;
  };

  const deleteNamespace: TNamespaceServiceFactory["deleteNamespace"] = async ({
    permission,
    name
  }: TDeleteNamespaceDTO) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );
    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionNamespaceActions.Delete,
      OrgPermissionSubjects.Namespace
    );

    const existingNamespace = await namespaceDAL.findOne({ name, orgId: permission.orgId });
    if (!existingNamespace) {
      throw new NotFoundError({ message: `Namespace with name '${name}' not found` });
    }

    const [deletedNamespace] = await namespaceDAL.delete({ id: existingNamespace.id });
    return deletedNamespace;
  };

  const listNamespaces: TNamespaceServiceFactory["listNamespaces"] = async ({
    permission,
    offset,
    limit,
    search
  }: TListNamespaceDTO) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );
    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionNamespaceActions.Read,
      OrgPermissionSubjects.Namespace
    );

    const namespaces = await namespaceDAL.find(
      { orgId: permission.orgId, $search: { name: search } },
      {
        offset,
        limit,
        sort: [["name", "asc"]]
      }
    );

    return namespaces;
  };

  const getNamespaceByName: TNamespaceServiceFactory["getNamespaceByName"] = async ({
    permission,
    name
  }: TGetByNameNamespaceDTO) => {
    const { permission: orgPermission } = await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );
    ForbiddenError.from(orgPermission).throwUnlessCan(
      OrgPermissionNamespaceActions.Read,
      OrgPermissionSubjects.Namespace
    );

    const namespace = await namespaceDAL.findOne({ name, orgId: permission.orgId });
    if (!namespace) {
      throw new NotFoundError({ message: `Namespace with name '${name}' not found` });
    }

    return namespace;
  };

  return {
    createNamespace,
    updateNamespace,
    deleteNamespace,
    listNamespaces,
    getNamespaceByName
  };
};
