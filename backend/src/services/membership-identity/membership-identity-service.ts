import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, TemporaryPermissionMode, TMembershipRolesInsert } from "@app/db/schemas";
import { TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TIdentityGroupMembershipDALFactory } from "@app/ee/services/group/identity-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { SearchResourceOperators } from "@app/lib/search-resource/search";
import { TAlertServiceFactory } from "@app/services/alert/alert-service";
import { IDENTITY_AUTHENTICATION_RESOURCE_TYPE } from "@app/services/alert/providers/identity-credential-alert-provider";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";
import { getIdentityActiveLockoutAuthMethods } from "@app/services/identity/identity-fns";
import { AgentVaultIdentities, PamIdentities, SecretIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityMetadataDALFactory } from "../identity/identity-metadata-dal";
import { TApplicationMembershipCleanupServiceFactory } from "../membership/application-membership-cleanup-service";
import { assertProductWillRetainAdmin, assertSecretsTemporaryAccessAllowed } from "../membership/membership-fns";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TProjectAccessRevokeServiceFactory, TRevokedProjectAccess } from "../membership/project-access-revoke-service";
import { auditRevokedProjectAccess, lockAndAssertActiveOrgAccess } from "../org/org-access-fns";
import { TOrgDALFactory } from "../org/org-dal";
import { emitOrgMembershipRemoved, OrgAccessRemovalCause, toOrgMembershipActors } from "../org/org-membership-events";
import { ApplicationMemberKind } from "../pki-application/pki-application-types";
import { TProjectDALFactory } from "../project/project-dal";
import { TRoleDALFactory } from "../role/role-dal";
import { TMembershipIdentityDALFactory } from "./membership-identity-dal";
import {
  TCreateMembershipIdentityDTO,
  TDeleteMembershipIdentityDTO,
  TGetMembershipIdentityByIdentityIdDTO,
  TListMembershipIdentityDTO,
  TUpdateMembershipIdentityDTO
} from "./membership-identity-types";
import { newOrgMembershipIdentityFactory } from "./org/org-membership-identity-factory";
import { newProjectMembershipIdentityFactory } from "./project/project-membership-identity-factory";

type TMembershipIdentityServiceFactoryDep = {
  membershipIdentityDAL: TMembershipIdentityDALFactory;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany" | "delete">;
  roleDAL: Pick<TRoleDALFactory, "find">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getOrgPermission" | "getProjectPermission" | "getProjectPermissionByRoles" | "getOrgPermissionByRoles"
  >;
  orgDAL: Pick<TOrgDALFactory, "findById" | "findActorsWithActiveOrgAccess" | "lockActorsForOrgAccess">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  identityMetadataDAL: Pick<TIdentityMetadataDALFactory, "delete">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "deleteByIdentityIdsInGroupsOwnedByOrgs">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  applicationMembershipCleanupService: Pick<
    TApplicationMembershipCleanupServiceFactory,
    "cleanupActorApplicationMemberships"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  keyStore: Pick<TKeyStoreFactory, "sortedSetRangeByScore">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit" | "emitForProject">;
  alertService: Pick<TAlertServiceFactory, "deleteAlertsForResource">;
  identityAccessTokenService: Pick<
    TIdentityAccessTokenServiceFactory,
    "insertOrgMembershipRevocationMarker" | "removeOrgMembershipRevocationMarkers" | "bumpIdentityRevocationVersion"
  >;
  eventEmitter: TEventEmitter;
  projectAccessRevokeService: Pick<TProjectAccessRevokeServiceFactory, "revokeActorsInOrgs">;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
};

export type TMembershipIdentityServiceFactory = ReturnType<typeof membershipIdentityServiceFactory>;

export const membershipIdentityServiceFactory = ({
  membershipIdentityDAL,
  roleDAL,
  membershipRoleDAL,
  permissionService,
  orgDAL,
  additionalPrivilegeDAL,
  identityDAL,
  identityMetadataDAL,
  identityGroupMembershipDAL,
  licenseService,
  applicationMembershipCleanupService,
  projectDAL,
  keyStore,
  usageMeteringService,
  alertService,
  identityAccessTokenService,
  eventEmitter,
  projectAccessRevokeService,
  auditLogService
}: TMembershipIdentityServiceFactoryDep) => {
  const scopeFactory = {
    [AccessScope.Organization]: newOrgMembershipIdentityFactory({
      orgDAL,
      permissionService,
      identityDAL,
      membershipIdentityDAL
    }),
    [AccessScope.Project]: newProjectMembershipIdentityFactory({
      membershipIdentityDAL,
      orgDAL,
      permissionService,
      identityDAL,
      projectDAL
    })
  };

  const createMembership = async (dto: TCreateMembershipIdentityDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    const hasNoPermanentRole = data.roles.every((el) => el.isTemporary);
    if (hasNoPermanentRole) {
      throw new BadRequestError({
        message: "Identity must have at least one permanent role"
      });
    }
    const isInvalidTemporaryRole = data.roles.some((el) => {
      if (el.isTemporary) {
        if (!el.temporaryAccessStartTime || !el.temporaryRange) {
          return true;
        }
      }
      return false;
    });
    if (isInvalidTemporaryRole) {
      throw new BadRequestError({
        message: "Temporary role must have access start time and range"
      });
    }

    await assertSecretsTemporaryAccessAllowed({
      licenseService,
      projectDAL,
      scope: scopeData.scope,
      projectId: scopeData.scope === AccessScope.Project ? scopeData.projectId : undefined,
      orgId: scopeData.orgId,
      roles: data.roles
    });

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    await factory.onCreateMembershipIdentityGuard(dto);

    const customInputRoles = data.roles.filter((el) => factory.isCustomRole(el.role));
    const hasCustomRole = customInputRoles.length > 0;
    if (hasCustomRole) {
      const plan = await licenseService.getPlan(scopeData.orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message:
            "Failed to assign custom role to identity due to plan RBAC restriction. Upgrade to Infisical Enterprise to assign custom roles."
        });
    }

    const scopeField = factory.getScopeField(dto.scopeData);
    const customRoles = hasCustomRole
      ? await roleDAL.find({
          [scopeField.key]: scopeField.value,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length) {
      throw new NotFoundError({ message: "One or more custom roles not found" });
    }

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    const membership = await membershipIdentityDAL.transaction(async (tx) => {
      if (scopeData.scope === AccessScope.Project) {
        await lockAndAssertActiveOrgAccess({ orgDAL, orgId: scopeData.orgId, identityIds: [dto.data.identityId] }, tx);
      }
      const existingMembership = await membershipIdentityDAL.findOne(
        {
          scope: scopeData.scope,
          ...scopeDatabaseFields,
          actorIdentityId: dto.data.identityId
        },
        tx
      );
      if (existingMembership)
        throw new BadRequestError({
          message: "Identity is already a member"
        });

      const doc = await membershipIdentityDAL.create(
        {
          scope: scopeData.scope,
          ...scopeDatabaseFields,
          actorIdentityId: dto.data.identityId
        },
        tx
      );

      const roleDocs: TMembershipRolesInsert[] = [];
      data.roles.forEach((membershipRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[membershipRole.role]?.[0]);
        if (membershipRole.isTemporary) {
          const relativeTimeInMs = membershipRole.temporaryRange ? ms(membershipRole.temporaryRange) : null;
          roleDocs.push({
            membershipId: doc.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: customRolesGroupBySlug[membershipRole.role]
              ? customRolesGroupBySlug[membershipRole.role][0].id
              : null,
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: membershipRole.temporaryRange,
            temporaryAccessStartTime: new Date(membershipRole.temporaryAccessStartTime as string),
            temporaryAccessEndTime: new Date(
              new Date(membershipRole.temporaryAccessStartTime as string).getTime() + (relativeTimeInMs as number)
            )
          });
        } else {
          roleDocs.push({
            membershipId: doc.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: customRolesGroupBySlug[membershipRole.role]
              ? customRolesGroupBySlug[membershipRole.role][0].id
              : null
          });
        }
      });
      await membershipRoleDAL.insertMany(roleDocs, tx);

      // Re-adding an identity that was previously removed must lift the org-scoped
      // token revocation, atomically with the membership insert.
      if (scopeData.scope === AccessScope.Organization) {
        await identityAccessTokenService.removeOrgMembershipRevocationMarkers({
          identityId: dto.data.identityId,
          orgId: scopeData.orgId,
          tx
        });
      }

      return doc;
    });

    if (scopeData.scope === AccessScope.Organization) {
      // Post-commit, so cached membership denies re-check against the restored state.
      await identityAccessTokenService.bumpIdentityRevocationVersion({ identityId: dto.data.identityId });
    }

    // Adding an identity to a project changes the secret-manager and PAM identity meters (a direct member).
    if (scopeData.scope === AccessScope.Project) {
      usageMeteringService.emitForProject(scopeData.projectId, SecretIdentities.key);
      usageMeteringService.emitForProject(scopeData.projectId, PamIdentities.key);
      usageMeteringService.emitForProject(scopeData.projectId, AgentVaultIdentities.key);
    }
    return { membership };
  };

  const updateMembership = async (dto: TUpdateMembershipIdentityDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onUpdateMembershipIdentityGuard(dto);

    const customInputRoles = data.roles.filter((el) => factory.isCustomRole(el.role));
    const hasCustomRole = customInputRoles.length > 0;
    if (hasCustomRole) {
      const plan = await licenseService.getPlan(scopeData.orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message:
            "Failed to assign custom role to identity due to plan RBAC restriction. Upgrade to Infisical Enterprise to assign custom roles."
        });
    }

    const hasNoPermanentRole = data.roles.every((el) => el.isTemporary);
    if (hasNoPermanentRole) {
      throw new BadRequestError({
        message: "Identity must have at least one permanent role"
      });
    }
    const isInvalidTemporaryRole = data.roles.some((el) => {
      if (el.isTemporary) {
        if (!el.temporaryAccessStartTime || !el.temporaryRange) {
          return true;
        }
      }
      return false;
    });
    if (isInvalidTemporaryRole) {
      throw new BadRequestError({
        message: "Temporary role must have access start time and range"
      });
    }

    await assertSecretsTemporaryAccessAllowed({
      licenseService,
      projectDAL,
      scope: scopeData.scope,
      projectId: scopeData.scope === AccessScope.Project ? scopeData.projectId : undefined,
      orgId: scopeData.orgId,
      roles: data.roles
    });

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    const existingMembership = await membershipIdentityDAL.findOne({
      scope: scopeData.scope,
      ...scopeDatabaseFields,
      actorIdentityId: dto.selector.identityId
    });
    if (!existingMembership)
      throw new BadRequestError({
        message: "Identity doesn't have membership"
      });

    const scopeField = factory.getScopeField(dto.scopeData);
    const customRoles = hasCustomRole
      ? await roleDAL.find({
          [scopeField.key]: scopeField.value,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];
    if (customRoles.length !== customInputRoles.length) {
      throw new NotFoundError({ message: "One or more custom roles not found" });
    }

    const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

    let shouldRevokeOrgTokens = false;
    let shouldRestoreOrgTokens = false;

    const membershipDoc = await membershipIdentityDAL.transaction(async (tx) => {
      // The project advisory lock before the row lock, the order every other caller takes: a product-route
      // change holding the advisory lock needs KEY SHARE on this row, so the reverse order deadlocks.
      const newIsActive = data.isActive ?? existingMembership.isActive;
      const newRolesHavePermanentAdmin =
        newIsActive && data.roles.some((r) => r.role === ProjectMembershipRole.Admin && !r.isTemporary);
      if (!newRolesHavePermanentAdmin && scopeData.scope === AccessScope.Project) {
        await assertProductWillRetainAdmin({
          project: await projectDAL.findById(scopeData.projectId, tx),
          excludeMembershipIds: [existingMembership.id],
          tx
        });
      }
      const currentMembership = await membershipIdentityDAL.findByIdForUpdate(existingMembership.id, tx);
      if (!currentMembership) {
        throw new BadRequestError({ message: "Identity doesn't have membership" });
      }
      shouldRevokeOrgTokens =
        scopeData.scope === AccessScope.Organization && data.isActive === false && currentMembership.isActive !== false;
      shouldRestoreOrgTokens =
        scopeData.scope === AccessScope.Organization && data.isActive === true && currentMembership.isActive === false;

      const doc =
        typeof data.isActive === "undefined"
          ? currentMembership
          : await membershipIdentityDAL.updateById(
              existingMembership.id,
              {
                isActive: data.isActive
              },
              tx
            );

      const roleDocs: TMembershipRolesInsert[] = [];
      data.roles.forEach((membershipRole) => {
        const isCustomRole = Boolean(customRolesGroupBySlug?.[membershipRole.role]?.[0]);
        if (membershipRole.isTemporary) {
          const relativeTimeInMs = membershipRole.temporaryRange ? ms(membershipRole.temporaryRange) : null;
          roleDocs.push({
            membershipId: doc.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: customRolesGroupBySlug[membershipRole.role]
              ? customRolesGroupBySlug[membershipRole.role][0].id
              : null,
            isTemporary: true,
            temporaryMode: TemporaryPermissionMode.Relative,
            temporaryRange: membershipRole.temporaryRange,
            temporaryAccessStartTime: new Date(membershipRole.temporaryAccessStartTime as string),
            temporaryAccessEndTime: new Date(
              new Date(membershipRole.temporaryAccessStartTime as string).getTime() + (relativeTimeInMs as number)
            )
          });
        } else {
          roleDocs.push({
            membershipId: doc.id,
            role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: customRolesGroupBySlug[membershipRole.role]
              ? customRolesGroupBySlug[membershipRole.role][0].id
              : null
          });
        }
      });
      await membershipRoleDAL.delete(
        {
          membershipId: doc.id
        },
        tx
      );
      const insertedRoleDocs = await membershipRoleDAL.insertMany(roleDocs, tx);

      if (shouldRevokeOrgTokens) {
        await identityAccessTokenService.insertOrgMembershipRevocationMarker({
          identityId: dto.selector.identityId,
          orgId: scopeData.orgId,
          tx
        });
      }

      if (shouldRestoreOrgTokens) {
        await identityAccessTokenService.removeOrgMembershipRevocationMarkers({
          identityId: dto.selector.identityId,
          orgId: scopeData.orgId,
          tx
        });
      }

      return { ...doc, roles: insertedRoleDocs };
    });

    if (shouldRevokeOrgTokens || shouldRestoreOrgTokens) {
      await identityAccessTokenService.bumpIdentityRevocationVersion({ identityId: dto.selector.identityId });
    }

    return { membership: membershipDoc };
  };

  // Takes an identity out of an org in the caller's tx: its rows there, its rows in the groups the org owns,
  // and everything the org granted it. Bump its revocation version and audit `revoked` after commit.
  const $removeIdentityFromOrg = async ({ identityId, orgId }: { identityId: string; orgId: string }, tx: Knex) => {
    await orgDAL.lockActorsForOrgAccess({ orgId, actorIds: [identityId] }, tx);
    await identityMetadataDAL.delete({ identityId, orgId }, tx);
    await additionalPrivilegeDAL.delete({ actorIdentityId: identityId, orgId }, tx);
    // Runs before the membership delete below so the project rows it removes are the ones audited. It takes
    // everything, even on projects a group linked in from a parent org still reaches: that access belongs to
    // the parent org.
    const { revoked } = await projectAccessRevokeService.revokeActorsInOrgs(
      { orgIds: [orgId], identityIds: [identityId] },
      tx
    );
    await membershipIdentityDAL.delete({ actorIdentityId: identityId, scopeOrgId: orgId }, tx);
    // Group membership counts as org membership, so a row left in one of this org's groups would keep the
    // identity in the org with no way for an admin to see or remove it. A parent org's group linked in here
    // is the parent's to manage.
    await identityGroupMembershipDAL.deleteByIdentityIdsInGroupsOwnedByOrgs(
      { identityIds: [identityId], orgIds: [orgId] },
      tx
    );

    // Durable deny atomic with the org-membership removal.
    await identityAccessTokenService.insertOrgMembershipRevocationMarker({ identityId, orgId, tx });
    await emitOrgMembershipRemoved(
      eventEmitter,
      { orgId, actors: toOrgMembershipActors({ identityIds: [identityId] }) },
      tx
    );
    await alertService.deleteAlertsForResource(
      { orgId, resourceType: IDENTITY_AUTHENTICATION_RESOURCE_TYPE, resourceId: identityId },
      tx
    );

    return revoked;
  };

  const removeIdentityFromOrg = async ({ identityId, orgId }: { identityId: string; orgId: string }) => {
    const revoked = await membershipIdentityDAL.transaction((tx) => $removeIdentityFromOrg({ identityId, orgId }, tx));
    await identityAccessTokenService.bumpIdentityRevocationVersion({ identityId });
    await auditRevokedProjectAccess({ auditLogService, revoked, reason: OrgAccessRemovalCause.RemovedFromOrg });
  };

  // On org removal the identity's project rows in the org are revoked here; the event only lets the reconcile
  // consumer confirm nothing's left.
  const deleteMembership = async (dto: TDeleteMembershipIdentityDTO, externalTx?: Knex) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onDeleteMembershipIdentityGuard(dto);

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    const existingMembership = await membershipIdentityDAL.findOne({
      scope: scopeData.scope,
      ...scopeDatabaseFields,
      actorIdentityId: dto.selector.identityId
    });
    if (!existingMembership)
      throw new BadRequestError({
        message: "Identity doesn't have membership"
      });

    if (existingMembership.actorIdentityId === dto.permission.id)
      throw new BadRequestError({
        message: "You can't delete your own membership"
      });

    let revoked: TRevokedProjectAccess[] = [];

    const performDelete = async (tx: Knex) => {
      if (scopeData.scope === AccessScope.Organization) {
        revoked = await $removeIdentityFromOrg({ identityId: dto.selector.identityId, orgId: scopeData.orgId }, tx);
        return existingMembership;
      }

      await assertProductWillRetainAdmin({
        project: await projectDAL.findById(scopeData.projectId, tx),
        excludeMembershipIds: [existingMembership.id],
        tx
      });

      await additionalPrivilegeDAL.delete(
        { actorIdentityId: dto.selector.identityId, projectId: scopeData.projectId },
        tx
      );
      await membershipRoleDAL.delete({ membershipId: existingMembership.id }, tx);
      const doc = await membershipIdentityDAL.deleteById(existingMembership.id, tx);

      await applicationMembershipCleanupService.cleanupActorApplicationMemberships(
        {
          projectId: scopeData.projectId,
          actorKind: ApplicationMemberKind.Identity,
          actorId: dto.selector.identityId
        },
        tx
      );

      await alertService.deleteAlertsForResource(
        {
          orgId: scopeData.orgId,
          projectId: scopeData.projectId,
          resourceType: IDENTITY_AUTHENTICATION_RESOURCE_TYPE,
          resourceId: dto.selector.identityId
        },
        tx
      );

      return doc;
    };

    const membershipDoc = externalTx
      ? await performDelete(externalTx)
      : await membershipIdentityDAL.transaction(performDelete);

    // The version bump must run after the delete commits. When we own the tx it
    // has already committed here; when the caller owns externalTx we cannot know when
    // it commits, so we return the pending bump for the caller to run post-commit.
    const needsRevocationBump = scopeData.scope === AccessScope.Organization;
    if (needsRevocationBump && !externalTx) {
      await identityAccessTokenService.bumpIdentityRevocationVersion({ identityId: dto.selector.identityId });
      await auditRevokedProjectAccess({ auditLogService, revoked, reason: OrgAccessRemovalCause.RemovedFromOrg });
    }

    // Removing an identity from a project drops a direct member; removing it from the org cascades its
    // project + group memberships. Either way the secret-manager and PAM identity meters change.
    if (scopeData.scope === AccessScope.Project) {
      usageMeteringService.emitForProject(scopeData.projectId, SecretIdentities.key);
      usageMeteringService.emitForProject(scopeData.projectId, PamIdentities.key);
      usageMeteringService.emitForProject(scopeData.projectId, AgentVaultIdentities.key);
    } else {
      usageMeteringService.emit(scopeData.orgId, SecretIdentities.key);
      usageMeteringService.emit(scopeData.orgId, PamIdentities.key);
      usageMeteringService.emit(scopeData.orgId, AgentVaultIdentities.key);
    }

    if (needsRevocationBump && externalTx) {
      return {
        membership: membershipDoc,
        revocationBumpPending: { identityId: dto.selector.identityId },
        revokedProjectAccess: revoked
      };
    }
    return { membership: membershipDoc };
  };

  const listMemberships = async (dto: TListMembershipIdentityDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    const listFilter = await factory.onListMembershipIdentityGuard(dto);
    const memberships = await membershipIdentityDAL.findIdentities({
      scopeData,
      filter: {
        limit: dto.data.limit,
        offset: dto.data.offset,
        name: dto.data.identityName
          ? {
              [SearchResourceOperators.$contains]: dto.data.identityName
            }
          : undefined,
        role: dto.data?.roles?.length
          ? {
              [SearchResourceOperators.$in]: dto.data.roles
            }
          : undefined
      }
    });
    const filtered = memberships.data.filter((el) => listFilter({ identityId: el.identity.id }));
    const withLockouts = await Promise.all(
      filtered.map(async (el) => ({
        ...el,
        identity: {
          ...el.identity,
          activeLockoutAuthMethods: await getIdentityActiveLockoutAuthMethods(el.identity.id, keyStore)
        }
      }))
    );
    return { ...memberships, data: withLockouts };
  };

  const getMembershipByIdentityId = async (dto: TGetMembershipIdentityByIdentityIdDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetMembershipIdentityByIdentityIdGuard(dto);
    const membership = await membershipIdentityDAL.getIdentityById({
      scopeData,
      identityId: selector.identityId
    });
    if (!membership) throw new NotFoundError({ message: `Identity membership not found` });

    return membership;
  };

  // It's a list of org identities, so at project scope only org identity read gates it, plus a check that
  // the project is in the org.
  const listAvailableIdentities = async (dto: TListMembershipIdentityDTO) => {
    const { scopeData } = dto;

    if (scopeData.scope === AccessScope.Project) {
      await scopeFactory[AccessScope.Organization].onListMembershipIdentityGuard({
        ...dto,
        scopeData: { scope: AccessScope.Organization, orgId: scopeData.orgId }
      });
      const project = await requestMemoize(requestMemoKeys.projectFindById(scopeData.projectId), () =>
        projectDAL.findById(scopeData.projectId)
      );
      if (project?.orgId !== scopeData.orgId) {
        throw new NotFoundError({ message: `Project with ID '${scopeData.projectId}' not found` });
      }
    } else {
      await scopeFactory[scopeData.scope].onListMembershipIdentityGuard(dto);
    }

    if (scopeData.scope !== AccessScope.Project && dto.permission.rootOrgId === dto.permission.orgId)
      return { identities: [] };

    const identities = await membershipIdentityDAL.listAvailableIdentities(dto.scopeData, dto.permission.rootOrgId);

    return { identities };
  };

  return {
    createMembership,
    updateMembership,
    deleteMembership,
    removeIdentityFromOrg,
    listMemberships,
    getMembershipByIdentityId,
    listAvailableIdentities
  };
};
