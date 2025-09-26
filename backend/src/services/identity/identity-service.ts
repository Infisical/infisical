import { ForbiddenError } from "@casl/ability";

import { NamespaceMembershipRole, OrgMembershipRole, TableName } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TNamespaceDALFactory } from "@app/ee/services/namespace/namespace-dal";
import { TNamespaceIdentityMembershipDALFactory } from "@app/ee/services/namespace-identity-membership/namespace-identity-membership-dal";
import { TNamespaceMembershipRoleDALFactory } from "@app/ee/services/namespace-role/namespace-membership-role-dal";
import {
  NamespacePermissionIdentityActions,
  NamespacePermissionSubjects
} from "@app/ee/services/permission/namespace-permission";
import { OrgPermissionIdentityActions, OrgPermissionSubjects } from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, ForbiddenRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";

import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityDALFactory } from "./identity-dal";
import { TIdentityMetadataDALFactory } from "./identity-metadata-dal";
import { TIdentityOrgDALFactory } from "./identity-org-dal";
import {
  TCreateIdentityDTO,
  TDeleteIdentityDTO,
  TGetIdentityByIdDTO,
  TListIdentitiesDTO,
  TListProjectIdentitiesByIdentityIdDTO,
  TSearchOrgIdentitiesByOrgIdDTO,
  TUpdateIdentityDTO
} from "./identity-types";

type TIdentityServiceFactoryDep = {
  identityDAL: TIdentityDALFactory;
  identityMetadataDAL: TIdentityMetadataDALFactory;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
  namespaceDAL: Pick<TNamespaceDALFactory, "findOne">;
  identityProjectDAL: Pick<TIdentityProjectDALFactory, "findByIdentityId">;
  namespaceIdentityMembershipDAL: TNamespaceIdentityMembershipDALFactory;
  namespaceMembershipRoleDAL: Pick<TNamespaceMembershipRoleDALFactory, "create">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getOrgPermission" | "getOrgPermissionByRole" | "getNamespacePermission"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  keyStore: Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem">;
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
  namespaceIdentityMembershipDAL,
  namespaceDAL,
  namespaceMembershipRoleDAL
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
    metadata,
    namespaceName
  }: TCreateIdentityDTO) => {
    let isCustomOrgRole = false;
    let orgCustomRoleId: string | null = null;
    let namespaceId: string | null = null;
    if (namespaceName) {
      const namespace = await namespaceDAL.findOne({ name: namespaceName, orgId: actorOrgId });
      if (!namespace) throw new NotFoundError({ message: `Namespace with slug ${namespaceName} not found` });

      namespaceId = namespace.id;
      const { permission } = await permissionService.getNamespacePermission({
        actor,
        actorAuthMethod,
        actorId,
        actorOrgId,
        namespaceId: namespace.id
      });
      ForbiddenError.from(permission).throwUnlessCan(
        NamespacePermissionIdentityActions.Create,
        NamespacePermissionSubjects.Identity
      );
    } else {
      const { permission, membership } = await permissionService.getOrgPermission(
        actor,
        actorId,
        orgId,
        actorAuthMethod,
        actorOrgId
      );
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionIdentityActions.Create,
        OrgPermissionSubjects.Identity
      );
      const { permission: rolePermission, role: customRole } = await permissionService.getOrgPermissionByRole(
        role,
        orgId
      );
      isCustomOrgRole = Boolean(customRole);
      orgCustomRoleId = customRole?.id || null;
      if (role !== OrgMembershipRole.NoAccess) {
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
      }
    }

    const plan = await licenseService.getPlan(orgId);

    if (plan?.slug !== "enterprise" && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        message: "Failed to create identity due to identity limit reached. Upgrade plan to create more identities."
      });
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity = await identityDAL.create({ name, hasDeleteProtection, namespaceId }, tx);
      // on namespace and project creation this would be no access
      const orgIdentityMembership = await identityOrgMembershipDAL.create(
        {
          identityId: newIdentity.id,
          orgId,
          role: isCustomOrgRole ? OrgMembershipRole.Custom : role,
          roleId: orgCustomRoleId
        },
        tx
      );

      if (namespaceId) {
        const namespaceIdentityMembership = await namespaceIdentityMembershipDAL.create(
          {
            orgIdentityMembershipId: orgIdentityMembership.id,
            namespaceId
          },
          tx
        );

        await namespaceMembershipRoleDAL.create(
          {
            namespaceMembershipId: namespaceIdentityMembership.id,
            role: NamespaceMembershipRole.NoAccess
          },
          tx
        );
      }

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
    isActorSuperAdmin,
    namespaceName
  }: TUpdateIdentityDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(id, isActorSuperAdmin);

    let isCustomOrgRole = false;
    let orgCustomRoleId: string | undefined | null = null;
    let namespaceId: string | null = null;

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: id, orgId: actorOrgId });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    if (namespaceName) {
      if (!identityOrgMembership.identity.namespace) {
        throw new ForbiddenRequestError({
          message: "Identity is not scoped to a namespace"
        });
      }

      const namespace = await namespaceDAL.findOne({
        name: namespaceName,
        id: identityOrgMembership.identity.namespace.id,
        orgId: actorOrgId
      });
      if (!namespace) throw new NotFoundError({ message: `Namespace with slug ${namespaceName} not found` });
      namespaceId = namespace.id;

      const { permission } = await permissionService.getNamespacePermission({
        actor,
        actorAuthMethod,
        actorId,
        actorOrgId,
        namespaceId: namespace.id
      });
      ForbiddenError.from(permission).throwUnlessCan(
        NamespacePermissionIdentityActions.Edit,
        NamespacePermissionSubjects.Identity
      );
    } else {
      const { permission, membership } = await permissionService.getOrgPermission(
        actor,
        actorId,
        identityOrgMembership.orgId,
        actorAuthMethod,
        actorOrgId
      );
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionIdentityActions.Edit, OrgPermissionSubjects.Identity);

      if (identityOrgMembership.identity.namespace) {
        throw new ForbiddenRequestError({
          message: "Identity is scoped to a namespace"
        });
      }

      if (role) {
        const { permission: rolePermission, role: customOrgRole } = await permissionService.getOrgPermissionByRole(
          role,
          identityOrgMembership.orgId
        );

        isCustomOrgRole = Boolean(customOrgRole);
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

        if (isCustomOrgRole) orgCustomRoleId = customOrgRole?.id;
      }
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity =
        name || hasDeleteProtection
          ? await identityDAL.updateById(id, { name, hasDeleteProtection }, tx)
          : await identityDAL.findById(id, tx);

      if (role && !namespaceId) {
        await identityOrgMembershipDAL.updateById(
          identityOrgMembership.id,
          {
            role: isCustomOrgRole ? OrgMembershipRole.Custom : role,
            roleId: orgCustomRoleId || null
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

    const activeLockouts = await keyStore.getKeysByPattern(`lockout:identity:${id}:*`);

    const activeLockoutAuthMethods = new Set<string>();
    for await (const key of activeLockouts) {
      const parts = key.split(":");
      if (parts.length > 3) {
        const lockoutRaw = await keyStore.getItem(key);
        if (lockoutRaw) {
          const lockout = JSON.parse(lockoutRaw) as { lockedOut: boolean };
          if (lockout.lockedOut) {
            activeLockoutAuthMethods.add(parts[3]);
          }
        }
      }
    }

    return {
      ...identity,
      identity: { ...identity.identity, activeLockoutAuthMethods: Array.from(activeLockoutAuthMethods) }
    };
  };

  const deleteIdentity = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    id,
    isActorSuperAdmin,
    namespaceName
  }: TDeleteIdentityDTO) => {
    await validateIdentityUpdateForSuperAdminPrivileges(id, isActorSuperAdmin);

    const identityOrgMembership = await identityOrgMembershipDAL.findOne({ identityId: id, orgId: actorOrgId });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    if (namespaceName) {
      if (!identityOrgMembership.identity.namespace) {
        throw new ForbiddenRequestError({
          message: "Identity is not scoped to a namespace"
        });
      }

      const namespace = await namespaceDAL.findOne({
        name: namespaceName,
        orgId: actorOrgId,
        id: identityOrgMembership.identity.namespace.id
      });
      if (!namespace) throw new NotFoundError({ message: `Namespace with slug ${namespaceName} not found` });

      const { permission } = await permissionService.getNamespacePermission({
        actor,
        actorAuthMethod,
        actorId,
        actorOrgId,
        namespaceId: namespace.id
      });
      ForbiddenError.from(permission).throwUnlessCan(
        NamespacePermissionIdentityActions.Delete,
        NamespacePermissionSubjects.Identity
      );
    } else {
      if (identityOrgMembership.identity.namespace) {
        throw new ForbiddenRequestError({
          message: "Identity is scoped to a namespace"
        });
      }

      const { permission } = await permissionService.getOrgPermission(
        actor,
        actorId,
        identityOrgMembership.orgId,
        actorAuthMethod,
        actorOrgId
      );

      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionIdentityActions.Delete,
        OrgPermissionSubjects.Identity
      );

      if (identityOrgMembership.identity.hasDeleteProtection)
        throw new BadRequestError({ message: "Identity has delete protection" });
    }

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
  }: TListIdentitiesDTO) => {
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
