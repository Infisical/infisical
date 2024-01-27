import { ForbiddenError } from "@casl/ability";

import { OrgMembershipRole, TOrgRoles } from "@app/db/schemas";
import {
  OrgPermissionActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { TOrgPermission } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "./identity-dal";
import { TIdentityOrgDALFactory } from "./identity-org-dal";
import { TCreateIdentityDTO, TDeleteIdentityDTO, TUpdateIdentityDTO } from "./identity-types";

type TIdentityServiceFactoryDep = {
  identityDAL: TIdentityDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
};

export type TIdentityServiceFactory = ReturnType<typeof identityServiceFactory>;

export const identityServiceFactory = ({
  identityDAL,
  identityOrgMembershipDAL,
  permissionService
}: TIdentityServiceFactoryDep) => {
  const createIdentity = async ({ name, role, actor, orgId, actorId }: TCreateIdentityDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.Identity
    );

    const { permission: rolePermission, role: customRole } =
      await permissionService.getOrgPermissionByRole(role, orgId);
    const isCustomRole = Boolean(customRole);
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasRequiredPriviledges)
      throw new BadRequestError({ message: "Failed to create a more privileged identity" });

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity = await identityDAL.create({ name }, tx);
      await identityOrgMembershipDAL.create(
        {
          identityId: newIdentity.id,
          orgId,
          role: isCustomRole ? OrgMembershipRole.Custom : role,
          roleId: customRole?.id
        },
        tx
      );
      return newIdentity;
    });


    return identity;
  };

  const updateIdentity = async ({ id, role, name, actor, actorId }: TUpdateIdentityDTO) => {
    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: id });
    if (!identityOrgMembership)
      throw new BadRequestError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.Identity
    );

    const { permission: identityRolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      id,
      identityOrgMembership.orgId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    let customRole: TOrgRoles | undefined;
    if (role) {
      const { permission: rolePermission, role: customOrgRole } =
        await permissionService.getOrgPermissionByRole(role, identityOrgMembership.orgId);

      const isCustomRole = Boolean(customOrgRole);
      const hasRequiredNewRolePermission = isAtLeastAsPrivileged(permission, rolePermission);
      if (!hasRequiredNewRolePermission)
        throw new BadRequestError({ message: "Failed to create a more privileged identity" });
      if (isCustomRole) customRole = customOrgRole;
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity = name
        ? await identityDAL.updateById(id, { name }, tx)
        : await identityDAL.findById(id, tx);
      if (role) {
        await identityOrgMembershipDAL.update(
          { identityId: id },
          {
            role: customRole ? OrgMembershipRole.Custom : role,
            roleId: customRole?.id
          },
          tx
        );
      }
      return newIdentity;
    });

    return { ...identity, orgId: identityOrgMembership.orgId };
  };

  const deleteIdentity = async ({ actorId, actor, id }: TDeleteIdentityDTO) => {
    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: id });
    if (!identityOrgMembership)
      throw new BadRequestError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Delete,
      OrgPermissionSubjects.Identity
    );
    const { permission: identityRolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      id,
      identityOrgMembership.orgId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    const deletedIdentity = await identityDAL.deleteById(id);
    return { ...deletedIdentity, orgId: identityOrgMembership.orgId };
  };

  const listOrgIdentities = async ({ orgId, actor, actorId }: TOrgPermission) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Identity
    );

    const identityMemberhips = await identityOrgMembershipDAL.findByOrgId(orgId);
    return identityMemberhips;
  };

  return {
    createIdentity,
    updateIdentity,
    deleteIdentity,
    listOrgIdentities
  };
};
