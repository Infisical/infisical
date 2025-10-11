import { ForbiddenError } from "@casl/ability";

import { AccessScope, NamespaceMembershipRole, TNamespaces } from "@app/db/schemas";
import { OrgPermissionNamespaceActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType } from "@app/services/auth/auth-type";

import { TLicenseServiceFactory } from "../license/license-service";
import { NamespacePermissionActions, NamespacePermissionSubjects } from "../permission/namespace-permission";
import { TNamespaceDALFactory } from "./namespace-dal";
import {
  TCreateNamespaceDTO,
  TDeleteNamespaceDTO,
  TGetByNameNamespaceDTO,
  TListNamespaceDTO,
  TSearchNamespaceDTO,
  TUpdateNamespaceDTO
} from "./namespace-types";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";

type TNamespaceServiceFactoryDep = {
  namespaceDAL: TNamespaceDALFactory;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  membershipDAL: Pick<TMembershipDALFactory, "create">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getNamespacePermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TNamespaceServiceFactory = {
  createNamespace: (dto: TCreateNamespaceDTO) => Promise<TNamespaces>;
  updateNamespace: (dto: TUpdateNamespaceDTO) => Promise<TNamespaces>;
  deleteNamespace: (dto: TDeleteNamespaceDTO) => Promise<TNamespaces>;
  listNamespaces: (dto: TListNamespaceDTO) => Promise<{ namespaces: TNamespaces[]; totalCount: number }>;
  getNamespaceByName: (dto: TGetByNameNamespaceDTO) => Promise<TNamespaces>;
  searchNamespaces: (
    dto: TSearchNamespaceDTO
  ) => Promise<{ namespaces: Array<TNamespaces & { isMember: boolean }>; totalCount: number }>;
};

export const namespaceServiceFactory = ({
  namespaceDAL,
  permissionService,
  membershipDAL,
  membershipRoleDAL,
  licenseService
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

    const plan = await licenseService.getPlan(permission.orgId);
    if (!plan.namespace) {
      throw new BadRequestError({
        message: "Failed to create namespace due to plan restriction. Upgrade plan to create namespace."
      });
    }

    const existingNamespace = await namespaceDAL.findOne({ name, orgId: permission.orgId });
    if (existingNamespace) {
      throw new BadRequestError({ message: `Namespace with name '${name}' already exists` });
    }

    const namespace = await namespaceDAL.transaction(async (tx) => {
      const newNamespace = await namespaceDAL.create(
        {
          name,
          description,
          orgId: permission.orgId
        },
        tx
      );
      const namespaceMembership = await membershipDAL.create(
        {
          scopeNamespaceId: newNamespace.id,
          scopeOrgId: permission.orgId,
          scope: AccessScope.Namespace,
          [permission.type === ActorType.USER ? "actorUserId" : "actorIdentityId"]: permission.id
        },
        tx
      );
      await membershipRoleDAL.create(
        {
          membershipId: namespaceMembership.id,
          role: NamespaceMembershipRole.Admin
        },
        tx
      );
      return newNamespace;
    });

    return namespace;
  };

  const updateNamespace: TNamespaceServiceFactory["updateNamespace"] = async ({
    permission,
    name,
    newName,
    description
  }: TUpdateNamespaceDTO) => {
    const existingNamespace = await namespaceDAL.findOne({ name, orgId: permission.orgId });
    if (!existingNamespace) {
      throw new NotFoundError({ message: `Namespace with name '${name}' not found` });
    }

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      namespaceId: existingNamespace.id,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId
    });
    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionActions.Edit,
      NamespacePermissionSubjects.Settings
    );

    const plan = await licenseService.getPlan(permission.orgId);
    if (!plan.namespace) {
      throw new BadRequestError({
        message: "Failed to update namespace due to plan restriction. Upgrade plan to update namespace."
      });
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
    const existingNamespace = await namespaceDAL.findOne({ name, orgId: permission.orgId });
    if (!existingNamespace) {
      throw new NotFoundError({ message: `Namespace with name '${name}' not found` });
    }

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      namespaceId: existingNamespace.id,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId
    });
    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionActions.Edit,
      NamespacePermissionSubjects.Settings
    );

    const [deletedNamespace] = await namespaceDAL.delete({ id: existingNamespace.id });
    return deletedNamespace;
  };

  const listNamespaces: TNamespaceServiceFactory["listNamespaces"] = async ({
    permission,
    offset,
    limit,
    search
  }: TListNamespaceDTO) => {
    await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );

    const { docs: namespaces, totalCount } = await namespaceDAL.listActorNamespaces({
      orgId: permission.orgId,
      name: search,
      actor: permission.type,
      actorId: permission.id,
      offset,
      limit
    });

    return { namespaces, totalCount };
  };

  const getNamespaceByName: TNamespaceServiceFactory["getNamespaceByName"] = async ({
    permission,
    name
  }: TGetByNameNamespaceDTO) => {
    const namespace = await namespaceDAL.findOne({ name, orgId: permission.orgId });
    if (!namespace) {
      throw new NotFoundError({ message: `Namespace with name '${name}' not found` });
    }

    await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      actorOrgId: permission.orgId,
      actorAuthMethod: permission.authMethod,
      namespaceId: namespace.id
    });

    return namespace;
  };

  const searchNamespaces: TNamespaceServiceFactory["searchNamespaces"] = async ({
    permission,
    name,
    limit,
    offset,
    orderBy,
    namespaceIds,
    orderDirection
  }: TSearchNamespaceDTO) => {
    await permissionService.getOrgPermission(
      permission.type,
      permission.id,
      permission.orgId,
      permission.authMethod,
      permission.orgId
    );

    const { docs: namespaces, totalCount } = await namespaceDAL.searchNamespaces({
      orgId: permission.orgId,
      actor: permission.type,
      actorId: permission.id,
      name,
      limit,
      offset,
      sortBy: orderBy,
      sortDir: orderDirection,
      namespaceIds
    });

    return { namespaces, totalCount };
  };

  return {
    createNamespace,
    updateNamespace,
    deleteNamespace,
    listNamespaces,
    getNamespaceByName,
    searchNamespaces
  };
};
