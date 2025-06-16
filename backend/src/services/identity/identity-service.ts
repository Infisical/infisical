import { ForbiddenError } from "@casl/ability";

import { OrgMembershipRole, TableName, TOrgRoles } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";

import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityDALFactory } from "./identity-dal";
import { TIdentityMetadataDALFactory } from "./identity-metadata-dal";
import { TIdentityOrgDALFactory } from "./identity-org-dal";
import {
  TCreateIdentityDTO,
  TDeleteIdentityDTO,
  TGetIdentityByIdDTO,
  TListOrgIdentitiesByOrgIdDTO,
  TListProjectIdentitiesByIdentityIdDTO,
  TSearchOrgIdentitiesByOrgIdDTO,
  TUpdateIdentityDTO
} from "./identity-types";

type TIdentityServiceFactoryDep = {
  identityDAL: TIdentityDALFactory;
  identityMetadataDAL: TIdentityMetadataDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  identityProjectDAL: Pick<TIdentityProjectDALFactory, "findByIdentityId">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRole">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
};

export type TIdentityServiceFactory = ReturnType<typeof identityServiceFactory>;

export const identityServiceFactory = ({
  identityDAL,
  identityMetadataDAL,
  identityOrgMembershipDAL,
  identityProjectDAL,
  permissionService,
  licenseService
}: TIdentityServiceFactoryDep) => {
  const createIdentity = async ({
    name,
    role,
    hasDeleteProtection,
    actor,
    orgId,
    actorId,
    actorAuthMethod,
    actorOrgId,
    metadata
  }: TCreateIdentityDTO) => {
    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);

    const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
      role,
      orgId
    );
    const isCustomRole = Boolean(customRole);
    const permissionBoundary = validatePrivilegeChangeOperation(
      membership.shouldUseNewPrivilegeSystem,
      OrgPermissionIdentityActions.GrantPrivileges,
      OrgPermissionSubjects.Identity,
      permission,
      rolePermission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to create identity",
          membership.shouldUseNewPrivilegeSystem,
          OrgPermissionIdentityActions.GrantPrivileges,
          OrgPermissionSubjects.Identity
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const plan = await licenseService.getPlan(orgId);

    if (plan?.slug !== "enterprise" && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        message: "Failed to create identity due to identity limit reached. Upgrade plan to create more identities."
      });
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity = await identityDAL.create({ name, hasDeleteProtection }, tx);
      await identityOrgMembershipDAL.create(
        {
          identityId: newIdentity.id,
          orgId,
          role: isCustomRole ? OrgMembershipRole.Custom : role,
          roleId: customRole?.id
        },
        tx
      );

      let insertedMetadata: Array<{
        id: string;
        key: string;
        value: string;
      }> = [];

      if (metadata && metadata.length) {
        const rowsToInsert = metadata.map(({ key, value }) => ({
          identityId: newIdentity.id,
          orgId,
          key,
          value
        }));

        insertedMetadata = await identityMetadataDAL.insertMany(rowsToInsert, tx);
      }

      return {
        ...newIdentity,
        authMethods: [],
        metadata: insertedMetadata
      };
    });
    await licenseService.updateSubscriptionOrgMemberCount(orgId);

    return identity;
  };

  const updateIdentity = async ({
    id,
    role,
    hasDeleteProtection,
    name,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    metadata,
    isActorSuperAdmin
  }: TUpdateIdentityDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(id, isActorSuperAdmin);

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: id });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const { permission, membership } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    let customRole: TOrgRoles | undefined;
    if (role) {
      const { permission: rolePermission, role: customOrgRole } = await permissionService.getOrgPermissionByRole(
        role,
        identityOrgMembership.orgId
      );

      const isCustomRole = Boolean(customOrgRole);
      const appliedRolePermissionBoundary = validatePrivilegeChangeOperation(
        membership.shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.GrantPrivileges,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermission
      );
      if (!appliedRolePermissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update identity",
            membership.shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.GrantPrivileges,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: appliedRolePermissionBoundary.missingPermissions }
        });
      if (isCustomRole) customRole = customOrgRole;
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity =
        name || hasDeleteProtection
          ? await identityDAL.updateById(id, { name, hasDeleteProtection }, tx)
          : await identityDAL.findById(id, tx);

      if (role) {
        await identityOrgMembershipDAL.updateById(
          identityOrgMembership.id,
          {
            role: customRole ? OrgMembershipRole.Custom : role,
            roleId: customRole?.id || null
          },
          tx
        );
      }
      let insertedMetadata: Array<{
        id: string;
        key: string;
        value: string;
      }> = [];

      if (metadata) {
        await identityMetadataDAL.delete({ orgId: identityOrgMembership.orgId, identityId: id }, tx);

        if (metadata.length) {
          const rowsToInsert = metadata.map(({ key, value }) => ({
            identityId: newIdentity.id,
            orgId: identityOrgMembership.orgId,
            key,
            value
          }));

          insertedMetadata = await identityMetadataDAL.insertMany(rowsToInsert, tx);
        }
      }

      return {
        ...newIdentity,
        metadata: insertedMetadata
      };
    });

    return { ...identity, orgId: identityOrgMembership.orgId };
  };

  const getIdentityById = async ({ id, actor, actorId, actorOrgId, actorAuthMethod }: TGetIdentityByIdDTO) => {
    const doc = await identityOrgMembershipDAL.find({
      [`${TableName.IdentityOrgMembership}.identityId` as "identityId"]: id
    });
    const identity = doc[0];
    if (!identity) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identity.orgId,
      actorAuthMethod,
      actorOrgId
    );
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    return identity;
  };

  const deleteIdentity = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    isActorSuperAdmin
  }: TDeleteIdentityDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(id, isActorSuperAdmin);

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: id });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission(
      actor,
      actorId,
      identityOrgMembership.orgId,
      actorAuthMethod,
      actorOrgId
    );

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity);

    if (identityOrgMembership.identity.hasDeleteProtection)
      throw new BadRequestError({ message: "Identity has delete protection" });

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
    orderDirection,
    search
  }: TListOrgIdentitiesByOrgIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const identityMemberships = await identityOrgMembershipDAL.find({
      [`${TableName.IdentityOrgMembership}.orgId` as "orgId"]: orgId,
      limit,
      offset,
      orderBy,
      orderDirection,
      search
    });

    const totalCount = await identityOrgMembershipDAL.countAllOrgIdentities({
      [`${TableName.IdentityOrgMembership}.orgId` as "orgId"]: orgId,
      search
    });

    return { identityMemberships, totalCount };
  };

  const searchOrgIdentities = async ({
    orgId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    limit,
    offset,
    orderBy,
    orderDirection,
    searchFilter = {}
  }: TSearchOrgIdentitiesByOrgIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const { totalCount, docs } = await identityOrgMembershipDAL.searchIdentities({
      orgId,
      limit,
      offset,
      orderBy,
      orderDirection,
      searchFilter
    });

    return { identityMemberships: docs, totalCount };
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const identityMemberships = await identityProjectDAL.findByIdentityId(identityId);
    return identityMemberships;
  };

  return {
    createIdentity,
    updateIdentity,
    deleteIdentity,
    listOrgIdentities,
    getIdentityById,
    searchOrgIdentities,
    listProjectIdentitiesByIdentityId
  };
};
