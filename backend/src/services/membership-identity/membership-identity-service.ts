import { Knex } from "knex";

import { AccessScope, ProjectMembershipRole, TemporaryPermissionMode, TMembershipRolesInsert } from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { SearchResourceOperators } from "@app/lib/search-resource/search";
import { getIdentityActiveLockoutAuthMethods } from "@app/services/identity/identity-fns";
import { PamIdentities, SecretIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
import { TApplicationMembershipCleanupServiceFactory } from "../membership/application-membership-cleanup-service";
import { assertSecretsTemporaryAccessAllowed } from "../membership/membership-fns";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TOrgDALFactory } from "../org/org-dal";
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
  orgDAL: Pick<TOrgDALFactory, "findById" | "findEffectiveOrgMembership">;
  additionalPrivilegeDAL: Pick<TAdditionalPrivilegeDALFactory, "delete">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  applicationMembershipCleanupService: Pick<
    TApplicationMembershipCleanupServiceFactory,
    "cleanupActorApplicationMemberships"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  keyStore: Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit" | "emitForProject">;
  identityAccessTokenService: Pick<
    TIdentityAccessTokenServiceFactory,
    "insertOrgMembershipRevocationMarker" | "bumpIdentityRevocationVersion"
  >;
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
  licenseService,
  applicationMembershipCleanupService,
  projectDAL,
  keyStore,
  usageMeteringService,
  identityAccessTokenService
}: TMembershipIdentityServiceFactoryDep) => {
  const scopeFactory = {
    [AccessScope.Organization]: newOrgMembershipIdentityFactory({
      orgDAL,
      permissionService,
      identityDAL
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
      return doc;
    });

    // Adding an identity to a project changes the secret-manager and PAM identity meters (a direct member).
    if (scopeData.scope === AccessScope.Project) {
      usageMeteringService.emitForProject(scopeData.projectId, SecretIdentities.key);
      usageMeteringService.emitForProject(scopeData.projectId, PamIdentities.key);
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

    const shouldRevokeOrgTokens =
      scopeData.scope === AccessScope.Organization && data.isActive === false && existingMembership.isActive !== false;

    const membershipDoc = await membershipIdentityDAL.transaction(async (tx) => {
      const doc =
        typeof data.isActive === "undefined"
          ? existingMembership
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

      return { ...doc, roles: insertedRoleDocs };
    });

    if (shouldRevokeOrgTokens) {
      await identityAccessTokenService.bumpIdentityRevocationVersion({ identityId: dto.selector.identityId });
    }

    return { membership: membershipDoc };
  };

  const deleteMembership = async (dto: TDeleteMembershipIdentityDTO, externalTx?: Knex) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onDeleteMembershipIdentityGuard(dto);

    const scopeField = factory.getScopeField(scopeData);
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

    const performDelete = async (tx: Knex) => {
      await additionalPrivilegeDAL.delete(
        {
          actorIdentityId: dto.selector.identityId,
          [scopeField.key]: scopeField.value
        },
        tx
      );
      await membershipRoleDAL.delete({ membershipId: existingMembership.id }, tx);
      const doc = await membershipIdentityDAL.deleteById(existingMembership.id, tx);

      if (scopeData.scope === AccessScope.Project) {
        const projectScopeFields = scopeDatabaseFields as { scopeProjectId?: string };
        if (projectScopeFields.scopeProjectId) {
          await applicationMembershipCleanupService.cleanupActorApplicationMemberships(
            {
              projectId: projectScopeFields.scopeProjectId,
              actorKind: ApplicationMemberKind.Identity,
              actorId: dto.selector.identityId
            },
            tx
          );
        }
      }

      // Durable deny atomic with the org-membership removal.
      if (scopeData.scope === AccessScope.Organization) {
        await identityAccessTokenService.insertOrgMembershipRevocationMarker({
          identityId: dto.selector.identityId,
          orgId: scopeData.orgId,
          tx
        });
      }

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
    }

    // Removing an identity from a project drops a direct member; removing it from the org cascades its
    // project + group memberships. Either way the secret-manager and PAM identity meters change.
    if (scopeData.scope === AccessScope.Project) {
      usageMeteringService.emitForProject(scopeData.projectId, SecretIdentities.key);
      usageMeteringService.emitForProject(scopeData.projectId, PamIdentities.key);
    } else {
      usageMeteringService.emit(scopeData.orgId, SecretIdentities.key);
      usageMeteringService.emit(scopeData.orgId, PamIdentities.key);
    }

    if (needsRevocationBump && externalTx) {
      return {
        membership: membershipDoc,
        revocationBumpPending: { identityId: dto.selector.identityId }
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

  const listAvailableIdentities = async (dto: TListMembershipIdentityDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onListMembershipIdentityGuard(dto);

    if (scopeData.scope !== AccessScope.Project && dto.permission.rootOrgId === dto.permission.orgId)
      return { identities: [] };

    const identities = await membershipIdentityDAL.listAvailableIdentities(dto.scopeData, dto.permission.rootOrgId);

    return { identities };
  };

  return {
    createMembership,
    updateMembership,
    deleteMembership,
    listMemberships,
    getMembershipByIdentityId,
    listAvailableIdentities
  };
};
