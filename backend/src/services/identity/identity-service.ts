import { ForbiddenError } from "@casl/ability";

import { AccessScope, OrganizationActionScope, OrgMembershipRole, TableName, TRoles } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";
import { getIdentityActiveLockoutAuthMethods } from "@app/services/identity-v2/identity-fns";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TOrgDALFactory } from "../org/org-dal";
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
  membershipIdentityDAL: TMembershipIdentityDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  identityProjectDAL: Pick<TIdentityProjectDALFactory, "findByIdentityId">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission" | "getOrgPermissionByRoles">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateOrgSubscription">;
  keyStore: Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
};

export type TIdentityServiceFactory = ReturnType<typeof identityServiceFactory>;

export const identityServiceFactory = ({
  identityDAL,
  identityMetadataDAL,
  identityOrgMembershipDAL,
  identityProjectDAL,
  permissionService,
  licenseService,
  keyStore,
  orgDAL,
  membershipIdentityDAL,
  membershipRoleDAL,
  additionalPrivilegeDAL
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
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Create, OrgPermissionSubjects.Identity);

    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([role], orgId);

    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);
    const isCustomRole = Boolean(rolePermissionDetails?.role);
    if (role !== OrgMembershipRole.NoAccess) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.GrantPrivileges,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermissionDetails.permission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create identity",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.GrantPrivileges,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const plan = await licenseService.getPlan(orgId);

    if (plan?.slug !== "enterprise" && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        message: "Failed to create identity due to identity limit reached. Upgrade plan to create more identities."
      });
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity = await identityDAL.create({ name, hasDeleteProtection, orgId }, tx);
      const membership = await membershipIdentityDAL.create(
        {
          scope: AccessScope.Organization,
          actorIdentityId: newIdentity.id,
          scopeOrgId: orgId
        },
        tx
      );

      await membershipRoleDAL.create(
        {
          membershipId: membership.id,
          role: isCustomRole ? OrgMembershipRole.Custom : role,
          customRoleId: rolePermissionDetails?.role?.id
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
          orgId: newIdentity.orgId,
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
    await licenseService.updateOrgSubscription(orgId);

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

    const identityOrgMembership = await membershipIdentityDAL.findOne({
      actorIdentityId: id,
      scope: AccessScope.Organization,
      scopeOrgId: actorOrgId
    });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: identityOrgMembership.scopeOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

    let customRole: TRoles | undefined;
    if (role) {
      const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([role], actorOrgId);
      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);

      const isCustomRole = Boolean(rolePermissionDetails?.role);
      const appliedRolePermissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionIdentityActions.GrantPrivileges,
        OrgPermissionSubjects.Identity,
        permission,
        rolePermissionDetails?.permission
      );
      if (!appliedRolePermissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update identity",
            shouldUseNewPrivilegeSystem,
            OrgPermissionIdentityActions.GrantPrivileges,
            OrgPermissionSubjects.Identity
          ),
          details: { missingPermissions: appliedRolePermissionBoundary.missingPermissions }
        });

      if (isCustomRole) customRole = rolePermissionDetails?.role;
    }

    const identityDetails = await identityDAL.findById(id);

    if (identityDetails.projectId) {
      throw new BadRequestError({ message: `Identity is managed by project` });
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity =
        identityDetails.orgId === actorOrgId && (name || hasDeleteProtection)
          ? await identityDAL.updateById(id, { name, hasDeleteProtection }, tx)
          : identityDetails;

      if (role) {
        await membershipRoleDAL.delete({ membershipId: identityOrgMembership.id }, tx);
        await membershipRoleDAL.create(
          {
            membershipId: identityOrgMembership.id,
            role: customRole ? OrgMembershipRole.Custom : role,
            customRoleId: customRole?.id || null
          },
          tx
        );
      }
      let insertedMetadata: Array<{
        id: string;
        key: string;
        value: string;
      }> = [];

      if (metadata && identityDetails.orgId === actorOrgId) {
        await identityMetadataDAL.delete({ orgId: newIdentity.orgId, identityId: id }, tx);

        if (metadata.length) {
          const rowsToInsert = metadata.map(({ key, value }) => ({
            identityId: newIdentity.id,
            orgId: newIdentity.orgId,
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

    return { ...identity, orgId: identityOrgMembership.scopeOrgId };
  };

  const getIdentityById = async ({ id, actor, actorId, actorOrgId, actorAuthMethod }: TGetIdentityByIdDTO) => {
    const doc = await identityOrgMembershipDAL.find({
      [`${TableName.Membership}.actorIdentityId` as "actorIdentityId"]: id,
      scope: AccessScope.Organization,
      scopeOrgId: actorOrgId
    });
    const identity = doc[0];
    if (!identity) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: identity.orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const activeLockoutAuthMethods = await getIdentityActiveLockoutAuthMethods(id, keyStore);

    return {
      ...identity,
      identity: { ...identity.identity, activeLockoutAuthMethods }
    };
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
    const identityOrgMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      identityId: id
    });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: identityOrgMembership.scopeOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Delete, OrgPermissionSubjects.Identity);

    if (identityOrgMembership.identity.projectId) {
      throw new BadRequestError({ message: `Identity is managed by project` });
    }

    if (identityOrgMembership.identity.orgId === actorOrgId) {
      if (identityOrgMembership.identity.hasDeleteProtection)
        throw new BadRequestError({ message: "Identity has delete protection" });

      const deletedIdentity = await identityDAL.deleteById(id);
      await licenseService.updateOrgSubscription(identityOrgMembership.scopeOrgId);
      return { ...deletedIdentity, orgId: identityOrgMembership.scopeOrgId };
    }

    await membershipIdentityDAL.transaction(async (tx) => {
      await identityMetadataDAL.delete(
        {
          identityId: id,
          orgId: actorOrgId
        },
        tx
      );
      const identityProjectMembership = await membershipIdentityDAL.find(
        {
          actorIdentityId: id,
          scope: AccessScope.Project,
          scopeOrgId: actorOrgId
        },
        { tx }
      );
      await additionalPrivilegeDAL.delete(
        {
          actorIdentityId: id,
          $in: {
            projectId: identityProjectMembership.map((el) => el.scopeProjectId)
          }
        },
        tx
      );
      const doc = await membershipIdentityDAL.delete({ actorIdentityId: id, scopeOrgId: actorOrgId }, tx);
      return doc;
    });

    const deletedIdentity = await identityDAL.findById(id);
    return { ...deletedIdentity, orgId: identityOrgMembership.scopeOrgId };
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
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const identityMemberships = await identityOrgMembershipDAL.find({
      [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
      scope: AccessScope.Organization,
      limit,
      offset,
      orderBy,
      orderDirection,
      search
    });

    const totalCount = await identityOrgMembershipDAL.countAllOrgIdentities({
      [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
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
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
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
    const identityOrgMembership = await membershipIdentityDAL.findOne({
      actorIdentityId: identityId,
      scope: AccessScope.Organization,
      scopeOrgId: actorOrgId
    });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: identityOrgMembership.scopeOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);

    const identityMemberships = await identityProjectDAL.findByIdentityId(identityId, actorOrgId);
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
