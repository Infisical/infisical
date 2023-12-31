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
import { TIdentityDalFactory } from "./identity-dal";
import { TIdentityOrgDalFactory } from "./identity-org-dal";
import { TCreateIdentityDTO, TDeleteIdentityDTO, TUpdateIdentityDTO } from "./identity-types";

type TIdentityServiceFactoryDep = {
  identityDal: TIdentityDalFactory;
  identityOrgMembershipDal: TIdentityOrgDalFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
};

export type TIdentityServiceFactory = ReturnType<typeof identityServiceFactory>;

export const identityServiceFactory = ({
  identityDal,
  identityOrgMembershipDal,
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

    const identity = await identityDal.transaction(async (tx) => {
      const newIdentity = await identityDal.create({ name }, tx);
      await identityOrgMembershipDal.create(
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

    // TODO(akhilmhdh-pg): add audit log here
    return identity;
  };

  const updateIdentity = async ({ id, role, name, actor, actorId }: TUpdateIdentityDTO) => {
    const identityOrgMembership = await identityOrgMembershipDal.findById(id);
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

    const identity = await identityDal.transaction(async (tx) => {
      const newIdentity = await identityDal.updateById(id, { name }, tx);
      if (role) {
        await identityOrgMembershipDal.update(
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

    // TODO(akhilmhdh-pg): add audit log here
    return identity;
  };

  const deleteIdentity = async ({ actorId, actor, id }: TDeleteIdentityDTO) => {
    const identityOrgMembership = await identityOrgMembershipDal.findById(id);
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

    const deletedIdentity = await identityDal.deleteById(id);
    return deletedIdentity;
  };

  const listOrgIdentities = async ({ orgId, actor, actorId }: TOrgPermission) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Identity
    );

    const identityMemberhips = await identityOrgMembershipDal.findByOrgId(orgId);
    return identityMemberhips;
  };

  return {
    createIdentity,
    updateIdentity,
    deleteIdentity,
    listOrgIdentities
  };
};
