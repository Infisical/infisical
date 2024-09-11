import { ForbiddenError } from "@casl/ability";

import { OrgMembershipRole, TableName, TOrgRoles } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { isAtLeastAsPrivileged } from "@app/lib/casl";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";

import { ActorType } from "../auth/auth-type";
import { TIdentityDALFactory } from "./identity-dal";
import { TIdentityOrgDALFactory } from "./identity-org-dal";
import {
  TCreateIdentityDTO,
  TDeleteIdentityDTO,
  TGetIdentityByIdDTO,
  TListOrgIdentitiesByOrgIdDTO,
  TListProjectIdentitiesByIdentityIdDTO,
  TUpdateIdentityDTO
} from "./identity-types";

type TIdentityServiceFactoryDep = {
  identityDAL: TIdentityDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  identityProjectDAL: Pick<TIdentityProjectDALFactory, "findByIdentityId">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
};

export type TIdentityServiceFactory = ReturnType<typeof identityServiceFactory>;

export const identityServiceFactory = ({
  identityDAL,
  identityOrgMembershipDAL,
  identityProjectDAL,
  permissionService,
  licenseService
}: TIdentityServiceFactoryDep) => {
  const createIdentity = async ({
    name,
    role,
    actor,
    orgId,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TCreateIdentityDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Identity);

    const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
      role,
      orgId
    );
    const isCustomRole = Boolean(customRole);
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, rolePermission);
    if (!hasRequiredPriviledges) throw new BadRequestError({ message: "Failed to create a more privileged identity" });

    const plan = await licenseService.getPlan(orgId);
    if (plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        message: "Failed to create identity due to identity limit reached. Upgrade plan to create more identities."
      });
    }

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
    await licenseService.updateSubscriptionOrgMemberCount(orgId);

    return identity;
  };

  const updateIdentity = async ({
    id,
    role,
    name,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateIdentityDTO) => {
    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: id });
    if (!identityOrgMembership) throw new BadRequestError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Identity);

    const { permission: identityRolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      id,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    let customRole: TOrgRoles | undefined;
    if (role) {
      const { permission: rolePermission, role: customOrgRole } = await permissionService.getOrgPermissionByRole(
        role,
        identityOrgMembership.orgId
      );

      const isCustomRole = Boolean(customOrgRole);
      const hasRequiredNewRolePermission = isAtLeastAsPrivileged(permission, rolePermission);
      if (!hasRequiredNewRolePermission)
        throw new BadRequestError({ message: "Failed to create a more privileged identity" });
      if (isCustomRole) customRole = customOrgRole;
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity = name ? await identityDAL.updateById(id, { name }, tx) : await identityDAL.findById(id, tx);
      if (role) {
        await identityOrgMembershipDAL.update(
          { identityId: id },
          {
            role: customRole ? OrgMembershipRole.Custom : role,
            roleId: customRole?.id || null
          },
          tx
        );
      }
      return newIdentity;
    });

    return { ...identity, orgId: identityOrgMembership.orgId };
  };

  const getIdentityById = async ({ id, actor, actorId, actorOrgId, actorAuthMethod }: TGetIdentityByIdDTO) => {
    const doc = await identityOrgMembershipDAL.find({
      [`${TableName.IdentityOrgMembership}.identityId` as "identityId"]: id
    });
    const identity = doc[0];
    if (!identity) throw new BadRequestError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identity.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);
    return identity;
  };

  const deleteIdentity = async ({ actorId, actor, actorOrgId, actorAuthMethod, id }: TDeleteIdentityDTO) => {
    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: id });
    if (!identityOrgMembership) throw new BadRequestError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Identity);
    const { permission: identityRolePermission } = await permissionService.getOrgPermission(
      ActorType.IDENTITY,
      id,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );
    const hasRequiredPriviledges = isAtLeastAsPrivileged(permission, identityRolePermission);
    if (!hasRequiredPriviledges)
      throw new ForbiddenRequestError({ message: "Failed to delete more privileged identity" });

    const deletedIdentity = await identityDAL.deleteById(id);

    await licenseService.updateSubscriptionOrgMemberCount(identityOrgMembership.orgId);

    return { ...deletedIdentity, orgId: identityOrgMembership.orgId };
  };

  const listOrgIdentities = async ({
    orgId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    limit,
    offset,
    orderBy,
    direction,
    textFilter
  }: TListOrgIdentitiesByOrgIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    const identityMemberships = await identityOrgMembershipDAL.find({
      [`${TableName.IdentityOrgMembership}.orgId` as "orgId"]: orgId,
      limit,
      offset,
      orderBy,
      direction,
      textFilter
    });

    const totalCount = await identityOrgMembershipDAL.countAllOrgIdentities({
      [`${TableName.IdentityOrgMembership}.orgId` as "orgId"]: orgId,
      textFilter
    });

    return { identityMemberships, totalCount };
  };

  const listProjectIdentitiesByIdentityId = async ({
    identityId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListProjectIdentitiesByIdentityIdDTO) => {
    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Identity);

    const identityMemberships = await identityProjectDAL.findByIdentityId(identityId);
    return identityMemberships;
  };

  return {
    createIdentity,
    updateIdentity,
    deleteIdentity,
    listOrgIdentities,
    getIdentityById,
    listProjectIdentitiesByIdentityId
  };
};
