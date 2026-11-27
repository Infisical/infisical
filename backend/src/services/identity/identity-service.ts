import { AccessScope, OrgMembershipRole, TableName } from "@app/db/schemas";
import { sealKnexTransaction } from "@app/domains/lib/transactions";
import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import {
  Meter,
  PlanFeature,
  PlanLimit,
  SeatUsage,
  TLicenseService,
  TUsageMeteringService
} from "@app/domains/platform/license/ce/module";
import {
  OrgPermissionIdentityActions,
  OrgPermissionSubjects,
  TOrganizationsService,
  TOrgPermissionService
} from "@app/domains/platform/organizations/ce/module";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { ActorType } from "@app/lib/auth/actor-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { containsLogUnsafeCharacters, LOG_UNSAFE_TEXT_MESSAGE } from "@app/lib/validator/log-safe-text";
import { TAlertServiceFactory } from "@app/services/alert/alert-service";
import { IDENTITY_AUTHENTICATION_RESOURCE_TYPE } from "@app/services/alert/providers/identity-credential-alert-provider";
import { TIdentityProjectDALFactory } from "@app/services/identity-project/identity-project-dal";

import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TMembershipIdentityServiceFactory } from "../membership-identity/membership-identity-service";
import { resolveMembershipRoleSlugs, toBoundsTargets } from "../membership/membership-fns";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { validateIdentityUpdateForSuperAdminPrivileges } from "../super-admin/super-admin-fns";
import { TIdentityDALFactory } from "./identity-dal";
import { getIdentityActiveLockoutAuthMethods } from "./identity-fns";
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
  membershipIdentityService: Pick<TMembershipIdentityServiceFactory, "removeIdentityFromOrg">;
  membershipRoleDAL: TMembershipRoleDALFactory;
  identityProjectDAL: Pick<TIdentityProjectDALFactory, "findByIdentityId">;
  orgPermissionService: TOrgPermissionService;
  licenseService: TLicenseService;
  usageMeteringService: TUsageMeteringService;
  organizationsService: TOrganizationsService;
  instanceConfigService: TInstanceConfigService;
  keyStore: Pick<TKeyStoreFactory, "sortedSetRangeByScore">;
  orgDAL: Pick<TOrgDALFactory, "findEffectiveOrgMembership">;
  alertService: Pick<TAlertServiceFactory, "deleteAlertsForDeletedResource">;
  identityAccessTokenService: Pick<
    TIdentityAccessTokenServiceFactory,
    "insertIdentityWideRevocationMarker" | "bumpIdentityRevocationVersion"
  >;
};

export type TIdentityServiceFactory = ReturnType<typeof identityServiceFactory>;

export const identityServiceFactory = ({
  identityDAL,
  identityMetadataDAL,
  identityOrgMembershipDAL,
  identityProjectDAL,
  orgPermissionService,
  licenseService,
  usageMeteringService,
  organizationsService,
  instanceConfigService,
  keyStore,
  orgDAL,
  membershipIdentityDAL,
  membershipIdentityService,
  membershipRoleDAL,
  alertService,
  identityAccessTokenService
}: TIdentityServiceFactoryDep) => {
  const createIdentity = async ({ name, role, hasDeleteProtection, actor, orgId, metadata }: TCreateIdentityDTO) => {
    const permission = await orgPermissionService.getOrgPermission({ actor, orgId });
    permission.assert({ action: OrgPermissionIdentityActions.Create, subject: OrgPermissionSubjects.Identity });

    const [rolePermissionDetails] = await orgPermissionService.getOrgPermissionByRoles({ orgId, roles: [role] });

    const isCustomRole = Boolean(rolePermissionDetails?.role);
    if (isCustomRole) {
      const plan = await licenseService.getPlan(orgId);
      if (!plan?.has(PlanFeature.Rbac))
        throw new BadRequestError({
          message:
            "Failed to assign custom role to identity due to plan RBAC restriction. Upgrade to Infisical Enterprise to assign custom roles."
        });
    }
    if (role !== OrgMembershipRole.NoAccess) {
      permission.assertBounds({
        actions: OrgPermissionIdentityActions.GrantPrivileges,
        subject: OrgPermissionSubjects.Identity,
        targets: [{ permission: rolePermissionDetails.permission }],
        message: "Failed to create identity"
      });
    }

    // Before the transaction: a plan cache miss calls the License Server.
    const plan = await licenseService.getPlan(orgId);

    const seatCountScope = licenseService.getSeatCountScope(orgId);

    const identity = await identityDAL.transaction(async (tx) => {
      // Counted under the seat lock on this transaction, so concurrent creates can't pass the limit together.
      if (plan.isLimited(PlanLimit.Identities)) {
        const counts = await organizationsService
          .within(sealKnexTransaction(tx))
          .lockAndCountBillableOrgActors(seatCountScope);
        if (!counts) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
        if (plan.exceeds(PlanLimit.Identities, SeatUsage.fromBillableActors(counts).identitiesUsed)) {
          throw new BadRequestError({
            message: "Failed to create identity due to identity limit reached. Upgrade plan to create more identities."
          });
        }
      }

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
    await usageMeteringService.syncSeats(orgId);
    usageMeteringService.emit(orgId, Meter.Identities);

    return identity;
  };

  const updateIdentity = async ({
    id,
    role,
    hasDeleteProtection,
    name,
    actor,
    metadata,
    isActorSuperAdmin
  }: TUpdateIdentityDTO) => {
    const identityOrgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: ActorType.IDENTITY,
      actorId: id,
      orgId: actor.org.id
    });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const permission = await orgPermissionService.getOrgPermission({ actor, orgId: identityOrgMembership.scopeOrgId });
    permission.assert({ action: OrgPermissionIdentityActions.Edit, subject: OrgPermissionSubjects.Identity });

    let customRole: { id: string } | undefined;
    if (role) {
      const [rolePermissionDetails] = await orgPermissionService.getOrgPermissionByRoles({
        orgId: actor.org.id,
        roles: [role]
      });

      const isCustomRole = Boolean(rolePermissionDetails?.role);
      if (isCustomRole) {
        const plan = await licenseService.getPlan(actor.org.id);
        if (!plan?.has(PlanFeature.Rbac))
          throw new BadRequestError({
            message:
              "Failed to assign custom role to identity due to plan RBAC restriction. Upgrade to Infisical Enterprise to assign custom roles."
          });
      }
      const targetRoles = resolveMembershipRoleSlugs(
        await membershipRoleDAL.findRolesByMembershipIds([identityOrgMembership.id])
      );
      const targetPermissions = await orgPermissionService.getOrgPermissionByRoles({
        orgId: actor.org.id,
        roles: targetRoles,
        ignoreUnresolvedRoles: true
      });

      permission.assertBounds({
        actions: OrgPermissionIdentityActions.GrantPrivileges,
        subject: OrgPermissionSubjects.Identity,
        targets: toBoundsTargets(targetPermissions),
        message: "Failed to change the roles of a more privileged identity"
      });

      permission.assertBounds({
        actions: OrgPermissionIdentityActions.GrantPrivileges,
        subject: OrgPermissionSubjects.Identity,
        targets: [{ permission: rolePermissionDetails?.permission }],
        message: "Failed to update identity"
      });

      if (isCustomRole) customRole = rolePermissionDetails?.role;
    }

    await validateIdentityUpdateForSuperAdminPrivileges(instanceConfigService, id, isActorSuperAdmin);

    const identityDetails = await requestMemoize(requestMemoKeys.identityFindById(id), () => identityDAL.findById(id));

    if (identityDetails.projectId) {
      throw new BadRequestError({ message: `Identity is managed by project` });
    }

    if (name && name !== identityDetails.name && containsLogUnsafeCharacters(name)) {
      throw new BadRequestError({ message: LOG_UNSAFE_TEXT_MESSAGE });
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity =
        identityDetails.orgId === actor.org.id && (name || hasDeleteProtection)
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

      if (metadata && identityDetails.orgId === actor.org.id) {
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

  const getIdentityById = async ({ id, actor }: TGetIdentityByIdDTO) => {
    const doc = await identityOrgMembershipDAL.find({
      [`${TableName.Membership}.actorIdentityId` as "actorIdentityId"]: id,
      scope: AccessScope.Organization,
      scopeOrgId: actor.org.id
    });
    const identity = doc[0];
    if (!identity) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const permission = await orgPermissionService.getOrgPermission({ actor, orgId: identity.orgId });
    permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });

    const activeLockoutAuthMethods = await getIdentityActiveLockoutAuthMethods(id, keyStore);

    return {
      ...identity,
      identity: { ...identity.identity, activeLockoutAuthMethods }
    };
  };

  const deleteIdentity = async ({ actor, id, isActorSuperAdmin }: TDeleteIdentityDTO) => {
    const identityOrgMembership = await membershipIdentityDAL.getIdentityById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actor.org.id
      },
      identityId: id
    });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${id}` });

    const permission = await orgPermissionService.getOrgPermission({ actor, orgId: identityOrgMembership.scopeOrgId });

    permission.assert({ action: OrgPermissionIdentityActions.Delete, subject: OrgPermissionSubjects.Identity });

    const targetRoles = resolveMembershipRoleSlugs(identityOrgMembership.roles);
    const targetPermissions = await orgPermissionService.getOrgPermissionByRoles({
      orgId: actor.org.id,
      roles: targetRoles,
      ignoreUnresolvedRoles: true
    });

    permission.assertBounds({
      actions: OrgPermissionIdentityActions.Delete,
      subject: OrgPermissionSubjects.Identity,
      targets: toBoundsTargets(targetPermissions),
      message: "Failed to remove a more privileged identity from the organization"
    });

    await validateIdentityUpdateForSuperAdminPrivileges(instanceConfigService, id, isActorSuperAdmin);

    if (identityOrgMembership.identity.projectId) {
      throw new BadRequestError({ message: `Identity is managed by project` });
    }

    if (identityOrgMembership.identity.orgId === actor.org.id) {
      if (identityOrgMembership.identity.hasDeleteProtection)
        throw new BadRequestError({ message: "Identity has delete protection" });

      const deletedIdentity = await identityDAL.transaction(async (tx) => {
        await identityAccessTokenService.insertIdentityWideRevocationMarker({ identityId: id, tx });

        await alertService.deleteAlertsForDeletedResource(
          {
            resourceType: IDENTITY_AUTHENTICATION_RESOURCE_TYPE,
            resourceId: id
          },
          tx
        );
        return identityDAL.deleteById(id, tx);
      });
      await identityAccessTokenService.bumpIdentityRevocationVersion({ identityId: id });
      await usageMeteringService.syncSeats(identityOrgMembership.scopeOrgId);
      usageMeteringService.emit(identityOrgMembership.scopeOrgId, Meter.Identities);
      usageMeteringService.emit(identityOrgMembership.scopeOrgId, Meter.SecretIdentities);
      usageMeteringService.emit(identityOrgMembership.scopeOrgId, Meter.PamIdentities);
      return { ...deletedIdentity, orgId: identityOrgMembership.scopeOrgId };
    }

    await membershipIdentityService.removeIdentityFromOrg({ identityId: id, orgId: actor.org.id });

    const deletedIdentity = await requestMemoize(requestMemoKeys.identityFindById(id), () => identityDAL.findById(id));
    usageMeteringService.emit(identityOrgMembership.scopeOrgId, Meter.Identities);
    // Deleting the identity cascades its project + group memberships, so the secret-manager and PAM
    // identity meters change too.
    usageMeteringService.emit(identityOrgMembership.scopeOrgId, Meter.SecretIdentities);
    usageMeteringService.emit(identityOrgMembership.scopeOrgId, Meter.PamIdentities);
    return { ...deletedIdentity, orgId: identityOrgMembership.scopeOrgId };
  };

  const listOrgIdentities = async ({
    orgId,
    actor,
    limit,
    offset,
    orderBy,
    orderDirection,
    search
  }: TListOrgIdentitiesByOrgIdDTO) => {
    const permission = await orgPermissionService.getOrgPermission({ actor, orgId });
    permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });

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
    limit,
    offset,
    orderBy,
    orderDirection,
    searchFilter = {}
  }: TSearchOrgIdentitiesByOrgIdDTO) => {
    const permission = await orgPermissionService.getOrgPermission({ actor, orgId: actor.org.id });
    permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });

    const { totalCount, docs } = await identityOrgMembershipDAL.searchIdentities({
      orgId,
      limit,
      offset,
      orderBy,
      orderDirection,
      searchFilter
    });

    const docsWithLockouts = await Promise.all(
      docs.map(async (doc) => ({
        ...doc,
        identity: {
          ...doc.identity,
          activeLockoutAuthMethods: await getIdentityActiveLockoutAuthMethods(doc.identity.id, keyStore)
        }
      }))
    );

    return { identityMemberships: docsWithLockouts, totalCount };
  };

  const listProjectIdentitiesByIdentityId = async ({
    identityId,
    actor,
    limit,
    offset,
    search,
    orderDirection,
    excludeProjectType
  }: TListProjectIdentitiesByIdentityIdDTO) => {
    const identityOrgMembership = await orgDAL.findEffectiveOrgMembership({
      actorType: ActorType.IDENTITY,
      actorId: identityId,
      orgId: actor.org.id
    });
    if (!identityOrgMembership) throw new NotFoundError({ message: `Failed to find identity with id ${identityId}` });

    const permission = await orgPermissionService.getOrgPermission({ actor, orgId: identityOrgMembership.scopeOrgId });
    permission.assert({ action: OrgPermissionIdentityActions.Read, subject: OrgPermissionSubjects.Identity });

    return identityProjectDAL.findByIdentityId(identityId, actor.org.id, {
      limit,
      offset,
      search,
      orderDirection,
      excludeProjectType
    });
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
