import {
  AccessScope,
  ActionProjectType,
  OrganizationActionScope,
  OrgMembershipRole,
  ProjectMembershipRole,
  ProjectType,
  TemporaryPermissionMode,
  TMembershipRolesInsert
} from "@app/db/schemas";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionIdentityActions,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import {
  constructPermissionErrorMessage,
  validatePrivilegeChangeOperation
} from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  isCustomProjectRole,
  ProjectPermissionIdentityActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { BadRequestError, NotFoundError, PermissionBoundaryError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TRoleDALFactory } from "@app/services/role/role-dal";

import { ActorType } from "../auth/auth-type";
import { getIdentityActiveLockoutAuthMethods } from "../identity/identity-fns";
import { TIdentityMetadataDALFactory } from "../identity/identity-metadata-dal";
import { TIdentityAccessTokenServiceFactory } from "../identity-access-token/identity-access-token-service";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipIdentityDALFactory } from "../membership-identity/membership-identity-dal";
import { TIdentityV2DALFactory } from "./identity-dal";
import { filterIdentitiesByProjectPermission, TProjectPermissionAbility } from "./identity-fns";
import { TIdentityMembershipV2DALFactory } from "./identity-membership-dal";
import {
  SearchIdentitiesScope,
  TCountIdentitiesV2DTO,
  TCreateIdentityV2DTO,
  TDeleteIdentityV2DTO,
  TGetIdentityByIdV2DTO,
  TListIdentityV2DTO,
  TSearchIdentitiesV2DTO,
  TUpdateIdentityV2DTO
} from "./identity-types";
import { newOrgIdentityFactory } from "./org/org-identity-factory";
import { newProjectIdentityFactory } from "./project/project-identity-factory";

type TScopedIdentityV2ServiceFactoryDep = {
  identityDAL: TIdentityV2DALFactory;
  identityMembershipV2DAL: TIdentityMembershipV2DALFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  membershipIdentityDAL: TMembershipIdentityDALFactory;
  membershipRoleDAL: TMembershipRoleDALFactory;
  identityMetadataDAL: TIdentityMetadataDALFactory;
  identityAccessTokenService: Pick<TIdentityAccessTokenServiceFactory, "revokeAllTokensForIdentity">;
  keyStore: Pick<TKeyStoreFactory, "getKeysByPattern" | "getItem">;
  projectDAL: Pick<TProjectDALFactory, "findActorAccessibleProjectIds" | "findOrgProjectIds" | "findById">;
  orgDAL: Pick<TOrgDALFactory, "findById">;
  roleDAL: Pick<TRoleDALFactory, "find">;
};

export type TScopedIdentityV2ServiceFactory = ReturnType<typeof identityV2ServiceFactory>;

export const identityV2ServiceFactory = ({
  identityDAL,
  identityMembershipV2DAL,
  permissionService,
  licenseService,
  membershipIdentityDAL,
  membershipRoleDAL,
  identityMetadataDAL,
  identityAccessTokenService,
  keyStore,
  projectDAL,
  orgDAL,
  roleDAL
}: TScopedIdentityV2ServiceFactoryDep) => {
  const orgFactory = newOrgIdentityFactory({
    permissionService
  });
  const projectFactory = newProjectIdentityFactory({
    permissionService
  });

  const scopeFactory = {
    [AccessScope.Organization]: orgFactory,
    [AccessScope.Project]: projectFactory
  };

  const createIdentity = async (dto: TCreateIdentityV2DTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onCreateIdentityGuard(dto);

    const plan = await licenseService.getPlan(dto.permission.orgId);
    const isEnterpriseBypass = plan?.slug === "enterprise" && !plan?.enforceIdentityLimit;

    if (!isEnterpriseBypass && plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
      // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
      throw new BadRequestError({
        message: "Failed to create identity due to identity limit reached. Upgrade plan to create more identities."
      });
    }

    let resolvedRoleDocs: Omit<TMembershipRolesInsert, "membershipId">[] | null = null;

    if (scopeData.scope === AccessScope.Project && data.roles && data.roles.length > 0) {
      const hasNoPermanentRole = data.roles.every((el) => el.isTemporary);
      if (hasNoPermanentRole) {
        throw new BadRequestError({ message: "Identity must have at least one permanent role" });
      }

      const { permission: actorPermission } = await permissionService.getProjectPermission({
        actor: dto.permission.type,
        actorId: dto.permission.id,
        actionProjectType: ActionProjectType.Any,
        actorAuthMethod: dto.permission.authMethod,
        projectId: scopeData.projectId,
        actorOrgId: dto.permission.orgId
      });

      const project = await requestMemoize(requestMemoKeys.projectFindById(scopeData.projectId), () =>
        projectDAL.findById(scopeData.projectId)
      );
      if (project?.type === ProjectType.CertificateManager) {
        const invalidRoles = data.roles.filter(
          (r) => r.role !== ProjectMembershipRole.Admin && r.role !== ProjectMembershipRole.Member
        );
        if (invalidRoles.length > 0) {
          throw new BadRequestError({ message: "Certificate Manager only supports Admin and Member roles." });
        }
      }

      const { shouldUseNewPrivilegeSystem } = await requestMemoize(
        requestMemoKeys.orgFindById(dto.permission.orgId),
        () => orgDAL.findById(dto.permission.orgId)
      );

      const permissionRoles = await permissionService.getProjectPermissionByRoles(
        data.roles.map((el) => el.role),
        scopeData.projectId
      );
      for (const permissionRole of permissionRoles) {
        if (permissionRole?.role?.name !== ProjectMembershipRole.NoAccess) {
          const permissionBoundary = validatePrivilegeChangeOperation(
            shouldUseNewPrivilegeSystem,
            [ProjectPermissionIdentityActions.AssignRole, ProjectPermissionIdentityActions.GrantPrivileges],
            ProjectPermissionSub.Identity,
            actorPermission,
            permissionRole.permission,
            { assignableRole: permissionRole.role?.slug }
          );
          if (!permissionBoundary.isValid) {
            throw new PermissionBoundaryError({
              message: constructPermissionErrorMessage(
                "Failed to create identity project membership",
                shouldUseNewPrivilegeSystem,
                ProjectPermissionIdentityActions.AssignRole,
                ProjectPermissionSub.Identity
              ),
              details: { missingPermissions: permissionBoundary.missingPermissions }
            });
          }
        }
      }

      const customInputRoles = data.roles.filter((el) => isCustomProjectRole(el.role));
      const hasCustomRole = customInputRoles.length > 0;
      if (hasCustomRole && !plan?.rbac) {
        throw new BadRequestError({
          message:
            "Failed to assign custom role to identity due to plan RBAC restriction. Upgrade to Infisical Enterprise to assign custom roles."
        });
      }
      const customRoles = hasCustomRole
        ? await roleDAL.find({
            projectId: scopeData.projectId,
            $in: { slug: customInputRoles.map(({ role }) => role) }
          })
        : [];
      if (customRoles.length !== customInputRoles.length) {
        throw new NotFoundError({ message: "One or more custom roles not found" });
      }
      const customRolesGroupBySlug = groupBy(customRoles, ({ slug }) => slug);

      resolvedRoleDocs = data.roles.map((membershipRole) => {
        const isCustom = Boolean(customRolesGroupBySlug?.[membershipRole.role]?.[0]);
        if (membershipRole.isTemporary) {
          if (membershipRole.temporaryMode !== TemporaryPermissionMode.Relative) {
            throw new BadRequestError({ message: "Only relative temporary permission mode is supported" });
          }
          const relativeTimeInMs = ms(membershipRole.temporaryRange);
          return {
            role: isCustom ? ProjectMembershipRole.Custom : membershipRole.role,
            customRoleId: isCustom ? customRolesGroupBySlug[membershipRole.role][0].id : null,
            isTemporary: true as const,
            temporaryMode: membershipRole.temporaryMode,
            temporaryRange: membershipRole.temporaryRange,
            temporaryAccessStartTime: new Date(membershipRole.temporaryAccessStartTime),
            temporaryAccessEndTime: new Date(
              new Date(membershipRole.temporaryAccessStartTime).getTime() + relativeTimeInMs
            )
          };
        }
        return {
          role: isCustom ? ProjectMembershipRole.Custom : membershipRole.role,
          customRoleId: isCustom ? customRolesGroupBySlug[membershipRole.role][0].id : null
        };
      });
    }

    let projectMemberRole = ProjectMembershipRole.NoAccess as string;
    if (scopeData.scope === AccessScope.Project && !resolvedRoleDocs) {
      const project = await projectDAL.findById(scopeData.projectId);
      if (project?.type === ProjectType.CertificateManager) {
        projectMemberRole = ProjectMembershipRole.Member;
      }
    }

    const identity = await identityDAL.transaction(async (tx) => {
      const newIdentity = await identityDAL.create(
        {
          name: data.name,
          hasDeleteProtection: data.hasDeleteProtection,
          orgId: dto.permission.orgId,
          projectId: scopeData.scope === AccessScope.Project ? scopeData.projectId : null
        },
        tx
      );
      const orgMembership = await membershipIdentityDAL.create(
        {
          scope: AccessScope.Organization,
          actorIdentityId: newIdentity.id,
          scopeOrgId: dto.permission.orgId
        },
        tx
      );

      await membershipRoleDAL.insertMany([{ membershipId: orgMembership.id, role: OrgMembershipRole.NoAccess }], tx);

      if (scopeData.scope === AccessScope.Project) {
        const projectMembership = await membershipIdentityDAL.create(
          {
            scope: AccessScope.Project,
            actorIdentityId: newIdentity.id,
            scopeOrgId: dto.permission.orgId,
            scopeProjectId: scopeData.projectId
          },
          tx
        );
        const roleEntries: TMembershipRolesInsert[] = resolvedRoleDocs
          ? resolvedRoleDocs.map((doc) => ({ ...doc, membershipId: projectMembership.id }))
          : [{ membershipId: projectMembership.id, role: projectMemberRole }];
        await membershipRoleDAL.insertMany(roleEntries, tx);
      }

      let insertedMetadata: Array<{
        id: string;
        key: string;
        value: string;
      }> = [];

      if (data.metadata && data.metadata.length) {
        const rowsToInsert = data.metadata.map(({ key, value }) => ({
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
    await licenseService.updateSubscriptionOrgMemberCount(dto.permission.orgId);

    return { identity };
  };

  const updateIdentity = async (dto: TUpdateIdentityV2DTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onUpdateIdentityGuard(dto);
    const existingIdentity = await identityDAL.findOne({
      id: dto.selector.identityId,
      orgId: dto.permission.orgId,
      projectId: dto.scopeData.scope === AccessScope.Project ? dto.scopeData.projectId : null
    });
    if (!existingIdentity)
      throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });

    const identity = await identityDAL.transaction(async (tx) => {
      const updatedIdentity =
        data?.name || data?.hasDeleteProtection
          ? await identityDAL.updateById(
              dto.selector.identityId,
              { name: data.name, hasDeleteProtection: data.hasDeleteProtection },
              tx
            )
          : existingIdentity;

      let insertedMetadata: Array<{
        id: string;
        key: string;
        value: string;
      }> = [];

      if (data.metadata) {
        await identityMetadataDAL.delete({ orgId: dto.permission.orgId, identityId: dto.selector.identityId }, tx);

        if (data.metadata.length) {
          const rowsToInsert = data.metadata.map(({ key, value }) => ({
            identityId: updatedIdentity.id,
            orgId: updatedIdentity.orgId,
            key,
            value
          }));

          insertedMetadata = await identityMetadataDAL.insertMany(rowsToInsert, tx);
        }
      }

      return {
        ...updatedIdentity,
        metadata: insertedMetadata
      };
    });

    return { identity };
  };

  const deleteIdentity = async (dto: TDeleteIdentityV2DTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onDeleteIdentityGuard(dto);

    const existingIdentity = await identityDAL.findOne({
      id: dto.selector.identityId,
      orgId: dto.permission.orgId,
      projectId: dto.scopeData.scope === AccessScope.Project ? dto.scopeData.projectId : null
    });
    if (!existingIdentity)
      throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });
    if (existingIdentity.hasDeleteProtection) {
      throw new BadRequestError({ message: "Cannot delete identity while delete protection is enabled" });
    }

    // Set the identity-wide PG revocation epoch before removing the row so
    // any JWT issued for this identity (with iat < now) is rejected.
    await identityAccessTokenService.revokeAllTokensForIdentity(dto.selector.identityId);

    const deletedIdentity = await identityDAL.deleteById(dto.selector.identityId);

    await licenseService.updateSubscriptionOrgMemberCount(scopeData.orgId);

    return { identity: deletedIdentity };
  };

  const getIdentityById = async (dto: TGetIdentityByIdV2DTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetIdentityByIdGuard(dto);

    const identity = await identityDAL.getIdentityById(dto.scopeData, dto.selector.identityId);
    if (!identity) throw new NotFoundError({ message: `Identity with id ${dto.selector.identityId} not found` });

    const activeLockoutAuthMethods = await getIdentityActiveLockoutAuthMethods(identity.id, keyStore);

    return { identity: { ...identity, activeLockoutAuthMethods } };
  };

  const listIdentities = async (dto: TListIdentityV2DTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    const isIdentityAccessible = await factory.onListIdentityGuard(dto);

    const identities = await identityDAL.listIdentities(dto.scopeData, {
      search: dto.data.search,
      offset: dto.data.offset,
      limit: dto.data.limit
    });

    return { ...identities, docs: identities.docs.filter((el) => isIdentityAccessible({ identityId: el.id })) };
  };

  const resolveIdentitySearchScope = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    scope
  }: {
    actor: ActorType;
    actorId: string;
    actorAuthMethod: TSearchIdentitiesV2DTO["actorAuthMethod"];
    actorOrgId: string;
    scope: SearchIdentitiesScope[];
  }): Promise<{
    uniqueScope: Set<SearchIdentitiesScope>;
    accessibleProjectIds: string[];
    projectPermissions: Map<string, TProjectPermissionAbility>;
    conditionalProjectIds: Set<string>;
  }> => {
    const uniqueScope = new Set(scope);
    const { permission: orgPermission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    const canReadOrgIdentities = orgPermission.can(OrgPermissionIdentityActions.Read, OrgPermissionSubjects.Identity);
    if (uniqueScope.has(SearchIdentitiesScope.OrganizationScope) && !canReadOrgIdentities) {
      uniqueScope.delete(SearchIdentitiesScope.OrganizationScope);
    }

    const accessibleProjectIds: string[] = [];
    const projectPermissions = new Map<string, TProjectPermissionAbility>();
    const conditionalProjectIds = new Set<string>();
    if (uniqueScope.has(SearchIdentitiesScope.ProjectScope)) {
      const canAccessAllProjects = orgPermission.can(
        OrgPermissionAdminConsoleAction.AccessAllProjects,
        OrgPermissionSubjects.AdminConsole
      );

      if (canAccessAllProjects && canReadOrgIdentities) {
        // Org admins read unconditionally across every project — skip the per-project probe,
        // which would otherwise throw ProjectMembershipNotFound for projects the admin hasn't
        // explicitly joined and drop them from accessibleProjectIds. The org-level identity:read
        // gate stops access-all-projects holders without identity:read from enumerating
        // project-scoped machine identities across the org.
        accessibleProjectIds.push(...(await projectDAL.findOrgProjectIds(actorOrgId)));
      } else {
        const candidateProjectIds = await projectDAL.findActorAccessibleProjectIds(actorId, actor, actorOrgId);

        const projectAccessChecks = await Promise.all(
          candidateProjectIds.map(async (projectId) => {
            try {
              const { permission: projectPermission } = await permissionService.getProjectPermission({
                actor,
                actorId,
                actionProjectType: ActionProjectType.Any,
                actorAuthMethod,
                projectId,
                actorOrgId
              });
              // Broad `can(Read, Identity)` returns true for conditional rules too. We keep the
              // project here and use the per-row check below to honor `identityId` conditions.
              return projectPermission.can(ProjectPermissionIdentityActions.Read, ProjectPermissionSub.Identity)
                ? { projectId, permission: projectPermission }
                : null;
            } catch {
              return null;
            }
          })
        );

        for (const entry of projectAccessChecks) {
          if (entry) {
            accessibleProjectIds.push(entry.projectId);
            projectPermissions.set(entry.projectId, entry.permission);
            // Tracking which projects carry conditional Read(Identity) rules lets the row filter
            // skip CASL.can() for projects whose access is already unconditional — the broad
            // can(Read, Identity) check above is authoritative for them.
            const rules = entry.permission.rulesFor(
              ProjectPermissionIdentityActions.Read,
              ProjectPermissionSub.Identity
            );
            if (rules.some((rule) => rule.conditions)) {
              conditionalProjectIds.add(entry.projectId);
            }
          }
        }
      }

      if (accessibleProjectIds.length === 0) {
        uniqueScope.delete(SearchIdentitiesScope.ProjectScope);
      }
    }

    return { uniqueScope, accessibleProjectIds, projectPermissions, conditionalProjectIds };
  };

  const searchOrgIdentities = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    limit,
    offset,
    orderBy,
    orderDirection,
    scope,
    searchFilter = {}
  }: TSearchIdentitiesV2DTO) => {
    const { uniqueScope, accessibleProjectIds, projectPermissions, conditionalProjectIds } =
      await resolveIdentitySearchScope({
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        scope
      });

    if (!uniqueScope.size) {
      return { identityMemberships: [], totalCount: 0 };
    }

    const enrichWithLockouts = async <T extends { identity: { id: string } }>(rows: T[]) =>
      Promise.all(
        rows.map(async (row) => ({
          ...row,
          identity: {
            ...row.identity,
            activeLockoutAuthMethods: await getIdentityActiveLockoutAuthMethods(row.identity.id, keyStore)
          }
        }))
      );

    if (conditionalProjectIds.size === 0) {
      const { totalCount, docs } = await identityMembershipV2DAL.searchIdentitiesV2({
        orgId: actorOrgId,
        limit,
        offset,
        orderBy,
        orderDirection,
        searchFilter,
        scope: Array.from(uniqueScope),
        accessibleProjectIds
      });

      return { identityMemberships: await enrichWithLockouts(docs), totalCount };
    }

    // Conditional Read rules on Identity exist for at least one accessible project. SQL pagination
    // would over-return rows the caller can't see, so fetch the full ordered set and filter by
    // per-row CASL before paginating in memory. Mirrors the tier-2 pattern in pam-resource-service.
    const { docs } = await identityMembershipV2DAL.searchIdentitiesV2({
      orgId: actorOrgId,
      orderBy,
      orderDirection,
      searchFilter,
      scope: Array.from(uniqueScope),
      accessibleProjectIds
    });

    const filtered = filterIdentitiesByProjectPermission(docs, projectPermissions, conditionalProjectIds);
    const pageOffset = offset ?? 0;
    const pageLimit = limit ?? filtered.length;
    return {
      identityMemberships: await enrichWithLockouts(filtered.slice(pageOffset, pageOffset + pageLimit)),
      totalCount: filtered.length
    };
  };

  const countOrgIdentities = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    scope,
    searchFilter = {}
  }: TCountIdentitiesV2DTO) => {
    const requestedOrg = scope.includes(SearchIdentitiesScope.OrganizationScope);
    const requestedProject = scope.includes(SearchIdentitiesScope.ProjectScope);

    const { uniqueScope, accessibleProjectIds, projectPermissions, conditionalProjectIds } =
      await resolveIdentitySearchScope({
        actor,
        actorId,
        actorAuthMethod,
        actorOrgId,
        scope
      });

    // Build the response shape from the *requested* scopes so callers always get a number
    // for every scope they asked about (zero when permissions/projects filter the scope out).
    const counts: { organization?: number; project?: number } = {};
    if (requestedOrg) counts.organization = 0;
    if (requestedProject) counts.project = 0;

    if (!uniqueScope.size) {
      return counts;
    }

    if (conditionalProjectIds.size === 0) {
      const dalCounts = await identityMembershipV2DAL.countIdentitiesV2({
        orgId: actorOrgId,
        scope: Array.from(uniqueScope),
        accessibleProjectIds,
        searchFilter
      });

      if (requestedOrg && dalCounts.organization !== undefined) counts.organization = dalCounts.organization;
      if (requestedProject && dalCounts.project !== undefined) counts.project = dalCounts.project;

      return counts;
    }

    // Project-scope count must respect identityId conditions, so list the rows and count survivors.
    // Org-scope rows have no per-identity conditions, so the SQL count is still correct.
    if (requestedOrg && uniqueScope.has(SearchIdentitiesScope.OrganizationScope)) {
      const orgOnly = await identityMembershipV2DAL.countIdentitiesV2({
        orgId: actorOrgId,
        scope: [SearchIdentitiesScope.OrganizationScope],
        accessibleProjectIds: [],
        searchFilter
      });
      counts.organization = orgOnly.organization ?? 0;
    }

    if (requestedProject && uniqueScope.has(SearchIdentitiesScope.ProjectScope)) {
      // Only identityId / scope / projectId are needed to apply the per-row CASL filter, so fetch
      // the lean refs instead of the full search payload (which the count would otherwise discard).
      const refs = await identityMembershipV2DAL.listIdentityRefsV2({
        orgId: actorOrgId,
        scope: [SearchIdentitiesScope.ProjectScope],
        accessibleProjectIds,
        searchFilter
      });
      counts.project = filterIdentitiesByProjectPermission(refs, projectPermissions, conditionalProjectIds).length;
    }

    return counts;
  };

  return {
    createIdentity,
    updateIdentity,
    deleteIdentity,
    getIdentityById,
    listIdentities,
    searchOrgIdentities,
    countOrgIdentities
  };
};
