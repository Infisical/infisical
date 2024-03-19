import { ForbiddenError } from "@casl/ability";

import { OrgMembershipRole, TOrgRoles } from "@app/db/schemas";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError } from "@app/lib/errors";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { TGroupDALFactory } from "./group-dal";
import { TCreateGroupDTO, TDeleteGroupDTO, TUpdateGroupDTO } from "./group-types";

type TGroupServiceFactoryDep = {
  groupDAL: TGroupDALFactory;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TGroupServiceFactory = ReturnType<typeof groupServiceFactory>;

export const groupServiceFactory = ({ groupDAL, permissionService, licenseService }: TGroupServiceFactoryDep) => {
  const createGroup = async ({
    name,
    slug,
    role,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TCreateGroupDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create group due to plan restriction. Upgrade plan to create group."
      });

    const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
      role,
      orgId
    );
    const isCustomRole = Boolean(customRole);
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasRequiredPriviledges) throw new BadRequestError({ message: "Failed to create a more privileged group" });

    const group = await groupDAL.create({
      name,
      slug,
      orgId,
      role: isCustomRole ? OrgMembershipRole.Custom : role,
      roleId: customRole?.id
    });

    return group;
  };

  const updateGroup = async ({
    currentSlug,
    name,
    slug,
    role,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateGroupDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to update group due to plan restrictio Upgrade plan to update group."
      });

    const group = await groupDAL.findOne({ orgId, slug: currentSlug });
    if (!group) throw new BadRequestError({ message: `Failed to find group with slug ${currentSlug}` });

    let customRole: TOrgRoles | undefined;
    if (role) {
      const { permission: rolePermission, role: customOrgRole } = await permissionService.getOrgPermissionByRole(
        role,
        group.orgId
      );

      const isCustomRole = Boolean(customOrgRole);
      const hasRequiredNewRolePermission = isAtLeastAsPrivileged(permission, rolePermission);
      if (!hasRequiredNewRolePermission)
        throw new BadRequestError({ message: "Failed to create a more privileged group" });
      if (isCustomRole) customRole = customOrgRole;
    }

    const [updatedGroup] = await groupDAL.update(
      {
        orgId,
        slug: currentSlug
      },
      {
        name,
        slug,
        ...(role
          ? {
              role: customRole ? OrgMembershipRole.Custom : role,
              roleId: customRole?.id
            }
          : {})
      }
    );

    return updatedGroup;
  };

  const deleteGroup = async ({ slug, actor, actorId, orgId, actorAuthMethod, actorOrgId }: TDeleteGroupDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(orgId);

    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to delete group due to plan restriction. Upgrade plan to delete group."
      });

    const [group] = await groupDAL.delete({
      orgId,
      slug
    });

    return group;
  };

  return {
    createGroup,
    updateGroup,
    deleteGroup
  };
};
