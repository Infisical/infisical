import { packRules } from "@casl/ability/extra";
import { requestContext } from "@fastify/request-context";

import {
  AccessScope,
  ActionProjectType,
  OrganizationActionScope,
  ProjectMembershipRole,
  ProjectType,
  TableName
} from "@app/db/schemas";
import { PlanFeature, TLicenseService } from "@app/domains/platform/license/ce/module";
import {
  AGENT_VAULT_MAX_ROLE_IDS,
  AGENT_VAULT_MAX_ROLE_RULES,
  countAgentVaultRoleIds,
  normalizeAgentVaultRoleName,
  sessionActionsOutsideActorCondition
} from "@app/ee/services/agent-vault-member/agent-vault-member-role-fns";
import { isActiveRole } from "@app/ee/services/permission/permission-fns";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { RequestContextKey } from "@app/lib/request-context/request-context-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { validateHandlebarTemplate } from "@app/lib/template/validate-handlebars";
import { UnpackedPermissionSchema, unpackPermissions } from "@app/server/routes/sanitizedSchema/permission";
import { customRolesNeedRbacPlan, lockProjectRoleChanges } from "@app/services/membership/membership-fns";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";

import { ActorType } from "../auth/auth-type";
import { TExternalGroupOrgRoleMappingDALFactory } from "../external-group-org-role-mapping/external-group-org-role-mapping-dal";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TUserDALFactory } from "../user/user-dal";
import { newOrgRoleFactory } from "./org/org-role-factory";
import { newProjectRoleFactory } from "./project/project-role-factory";
import { TRoleDALFactory } from "./role-dal";
import {
  TCreateRoleDTO,
  TDeleteRoleDTO,
  TGetProjectRoleByIdDTO,
  TGetRoleByIdDTO,
  TGetRoleBySlugDTO,
  TGetUserPermissionDTO,
  TListRoleDTO,
  TUpdateRoleDTO
} from "./role-types";

const stripExpiredTemporaryRoles = <
  M extends {
    roles: Array<{
      role: string;
      isTemporary?: boolean;
      temporaryAccessEndTime?: Date | null;
    }>;
  }
>(
  memberships: M[]
): M[] =>
  memberships.map((m) => ({
    ...m,
    roles: m.roles.filter((r) => !r.isTemporary || (r.temporaryAccessEndTime && new Date() < r.temporaryAccessEndTime))
  }));

type TRoleServiceFactoryDep = {
  roleDAL: TRoleDALFactory;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  userDAL: Pick<TUserDALFactory, "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission" | "getOrgPermission">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  externalGroupOrgRoleMappingDAL: Pick<TExternalGroupOrgRoleMappingDALFactory, "findOne">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "find" | "delete" | "insertMany">;
  licenseService: TLicenseService;
};

export type TRoleServiceFactory = ReturnType<typeof roleServiceFactory>;

export const roleServiceFactory = ({
  roleDAL,
  permissionService,
  projectDAL,
  identityDAL,
  userDAL,
  externalGroupOrgRoleMappingDAL,
  membershipRoleDAL,
  licenseService
}: TRoleServiceFactoryDep) => {
  const orgRoleFactory = newOrgRoleFactory({
    permissionService,
    externalGroupOrgRoleMappingDAL
  });
  const projectRoleFactory = newProjectRoleFactory({
    permissionService,
    projectDAL
  });
  const scopeFactory = {
    [AccessScope.Organization]: orgRoleFactory,
    [AccessScope.Project]: projectRoleFactory
  };

  // A deny on a subject whose schema can't keep it reaches here as an allow. Agent Vault's role editor offers a deny on
  // every row, so a role there is refused rather than saved granting what it was meant to deny.
  const assertNoDroppedDenies = async (
    scopeData: TCreateRoleDTO["scopeData"],
    droppedDenySubjects: string[] | undefined
  ) => {
    if (!droppedDenySubjects?.length || scopeData.scope !== AccessScope.Project) return;
    const { projectId } = scopeData;
    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    if (project?.type !== ProjectType.AgentVault) return;
    throw new BadRequestError({
      message: `An Agent Vault role can't deny ${droppedDenySubjects.join(", ")}: these permissions can only be allowed, so a deny would be saved as an allow. Remove the deny, and leave the permission out instead.`
    });
  };

  // An Agent Vault role's rules are applied on every request that reads its holders' reach, so a role is capped.
  const assertAgentVaultRuleCount = async (scopeData: TCreateRoleDTO["scopeData"], permissions: unknown) => {
    // The role routes pass the packed rules as JSON text.
    const rules: unknown = typeof permissions === "string" ? JSON.parse(permissions) : permissions;
    if (!Array.isArray(rules)) return;
    const tooManyRules = rules.length > AGENT_VAULT_MAX_ROLE_RULES;
    const tooManyIds = countAgentVaultRoleIds(rules) > AGENT_VAULT_MAX_ROLE_IDS;
    if (!tooManyRules && !tooManyIds) return;
    if (scopeData.scope !== AccessScope.Project) return;
    const { projectId } = scopeData;
    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    if (project?.type !== ProjectType.AgentVault) return;
    throw new BadRequestError({
      message: tooManyRules
        ? `An Agent Vault role can have at most ${AGENT_VAULT_MAX_ROLE_RULES} rules. Combine rules that name IDs into one rule per action, or split the role in two.`
        : `An Agent Vault role can name at most ${AGENT_VAULT_MAX_ROLE_IDS} IDs across its rules. Give the role every item of a kind instead of listing them, or split the role in two.`
    });
  };

  const assertSessionConditions = (permissions: unknown) => {
    // The role routes pass the packed rules as JSON text.
    const rules: unknown = typeof permissions === "string" ? JSON.parse(permissions) : permissions;
    if (!Array.isArray(rules)) return;
    const outside = sessionActionsOutsideActorCondition(rules);
    if (!outside.length) return;
    throw new BadRequestError({
      message: `A rule that limits Agent Vault sessions by actorId can only hold read, edit and revoke, not ${outside.join(", ")}. Move ${outside.length === 1 ? "it" : "them"} to a rule without conditions.`
    });
  };

  // Agent Vault members pick roles by name, so a name there is trimmed and checked (normalizeAgentVaultRoleName).
  const agentVaultRoleNameOf = async (scopeData: TCreateRoleDTO["scopeData"], name: string | undefined) => {
    if (name === undefined || scopeData.scope !== AccessScope.Project) return name;
    const { projectId } = scopeData;
    const project = await requestMemoize(requestMemoKeys.projectFindById(projectId), () =>
      projectDAL.findById(projectId)
    );
    return project?.type === ProjectType.AgentVault ? normalizeAgentVaultRoleName(name) : name;
  };

  const createRole = async (dto: TCreateRoleDTO) => {
    const { data, scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];
    await factory.onCreateRoleGuard(dto);
    await assertNoDroppedDenies(scopeData, dto.droppedDenySubjects);
    const name = (await agentVaultRoleNameOf(scopeData, data.name)) ?? data.name;
    await assertAgentVaultRuleCount(scopeData, data.permissions);
    assertSessionConditions(data.permissions);

    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (!plan?.has(PlanFeature.Rbac) && (await customRolesNeedRbacPlan(projectDAL, scopeData))) {
      throw new BadRequestError({
        message:
          "Failed to create custom role due to plan RBAC restriction. Upgrade to Infisical Enterprise plan to create custom roles."
      });
    }

    const scope = factory.getScopeField(scopeData);
    const existingRole = await roleDAL.findOne({
      slug: data.slug,
      [scope.key]: scope.value
    });
    if (existingRole) throw new BadRequestError({ message: `Role with ${data.slug} already exists` });

    validateHandlebarTemplate("Role Creation", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity."),
      allowedHelpers: ["stripPrefix", "trimSuffix"],
      rejectUnescaped: true
    });

    const role = await roleDAL.create({
      name,
      description: data.description,
      slug: data.slug,
      permissions: data.permissions,
      [scope.key]: scope.value
    });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const updateRole = async (dto: TUpdateRoleDTO) => {
    const { data, scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];
    const scope = factory.getScopeField(scopeData);

    await factory.onUpdateRoleGuard(dto);
    await assertNoDroppedDenies(scopeData, dto.droppedDenySubjects);
    const name = await agentVaultRoleNameOf(scopeData, data?.name);
    await assertAgentVaultRuleCount(scopeData, data?.permissions);
    assertSessionConditions(data?.permissions);

    const plan = await licenseService.getPlan(dto.permission.orgId);
    if (!plan?.has(PlanFeature.Rbac) && (await customRolesNeedRbacPlan(projectDAL, scopeData))) {
      throw new BadRequestError({
        message:
          "Failed to update custom role due to plan RBAC restriction. Upgrade to Infisical Enterprise plan to update custom roles."
      });
    }

    const existingRole = await roleDAL.findOne({
      id: dto.selector.id,
      [scope.key]: scope.value
    });
    if (!existingRole) throw new NotFoundError({ message: `Role with ${dto.selector.id} not found` });

    if (data.slug) {
      const existingSlug = await roleDAL.findOne({
        slug: data.slug,
        [scope.key]: scope.value
      });
      if (existingSlug && existingRole.id !== existingSlug.id)
        throw new BadRequestError({ message: `Role with ${data.slug} already exists` });
    }

    validateHandlebarTemplate("Role Update", JSON.stringify(data.permissions || []), {
      allowedExpressions: (val) => val.includes("identity."),
      allowedHelpers: ["stripPrefix", "trimSuffix"],
      rejectUnescaped: true
    });

    const role = await roleDAL.updateById(existingRole.id, {
      name,
      description: data?.description,
      slug: data?.slug,
      permissions: data?.permissions
    });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const deleteRole = async (dto: TDeleteRoleDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];
    const scope = factory.getScopeField(scopeData);
    await factory.onDeleteRoleGuard(dto);

    const existingRole = await roleDAL.findOne({
      id: dto.selector.id,
      [scope.key]: scope.value
    });
    if (!existingRole) throw new NotFoundError({ message: `Role with ${dto.selector.id} not found` });

    const project =
      scopeData.scope === AccessScope.Project
        ? await requestMemoize(requestMemoKeys.projectFindById(scopeData.projectId), () =>
            projectDAL.findById(scopeData.projectId)
          )
        : null;
    if (scopeData.scope === AccessScope.Project && project?.type === ProjectType.AgentVault) {
      const { projectId } = scopeData;
      const [role] = await roleDAL.transaction(async (tx) => {
        await lockProjectRoleChanges(projectId, tx);
        // A time limit that has ended confers nothing and no member list shows it, so only live holders keep the role,
        // and the ended rows go with it.
        const rows = await membershipRoleDAL.find({ customRoleId: existingRole.id }, { tx });
        const holders = rows.filter(isActiveRole);
        if (holders.length) {
          throw new BadRequestError({
            message: `${holders.length} member${holders.length > 1 ? "s hold" : " holds"} this role. Remove it from them under Access Control first.`
          });
        }
        await membershipRoleDAL.delete({ customRoleId: existingRole.id }, tx);
        // A membership needs a role row, so one whose only row was an ended assignment of this role gets No Access.
        const membershipIds = [...new Set(rows.map((row) => row.membershipId))];
        if (membershipIds.length) {
          const remaining = await membershipRoleDAL.find({ $in: { membershipId: membershipIds } }, { tx });
          const emptied = membershipIds.filter((id) => !remaining.some((row) => row.membershipId === id));
          if (emptied.length) {
            await membershipRoleDAL.insertMany(
              emptied.map((membershipId) => ({ membershipId, role: ProjectMembershipRole.NoAccess })),
              tx
            );
          }
        }
        return roleDAL.delete({ id: existingRole.id, projectId }, tx);
      });
      return { ...role, projectId, permissions: unpackPermissions(role.permissions) };
    }

    const [roleUsageData] = await membershipRoleDAL.find(
      {
        customRoleId: dto.selector.id
      },
      { count: true }
    );

    if (roleUsageData) {
      const count = Number.parseInt(roleUsageData.count, 10);
      if (count > 0) {
        const plural = count > 1 ? "s" : "";
        throw new BadRequestError({
          message: `Role is assigned to ${count} identity membership${plural}. Re-assign membership role${plural} to delete this role.`
        });
      }
    }

    const [role] = await roleDAL.delete({
      id: existingRole.id,
      [scope.key]: scope.value
    });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const listRoles = async (dto: TListRoleDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onListRoleGuard(dto);

    const scope = factory.getScopeField(scopeData);
    const predefinedRoles = await factory.getPredefinedRoles(scopeData);
    const roles = await roleDAL.find(
      {
        [scope.key]: scope.value
      },
      { limit: dto.data.limit, offset: dto.data.offset, sort: [[`${TableName.Role}.slug` as "slug", "asc"]] }
    );

    return {
      roles: [...predefinedRoles, ...roles.map((el) => ({ ...el, permissions: unpackPermissions(el.permissions) }))]
    };
  };

  const getRoleById = async (dto: TGetRoleByIdDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetRoleByIdGuard(dto);

    const scope = factory.getScopeField(scopeData);

    const predefinedRole = await factory.getPredefinedRoles(scopeData);
    const selectedRole = predefinedRole.find((el) => el.id === dto.selector.id);
    if (selectedRole) {
      return { ...selectedRole, permissions: UnpackedPermissionSchema.array().parse(selectedRole.permissions) };
    }

    const role = await roleDAL.findOne({
      id: selector.id,
      [scope.key]: scope.value
    });
    if (!role) throw new NotFoundError({ message: `Role with id ${dto.selector.id} not found` });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const getProjectRoleById = async (dto: TGetProjectRoleByIdDTO) => {
    const { permission, selector } = dto;

    const [role] = await roleDAL.find({ id: selector.id, $notNull: ["projectId"] }, { limit: 1 });
    if (!role) {
      throw new NotFoundError({ message: `Role with id ${selector.id} not found` });
    }

    if (!role.projectId) {
      throw new NotFoundError({ message: `Role with id ${selector.id} not found` });
    }

    const project = await projectDAL.findById(role.projectId);
    if (!project || project.orgId !== permission.orgId) {
      throw new NotFoundError({ message: `Role with id ${selector.id} not found` });
    }

    const scopeData = {
      scope: AccessScope.Project,
      orgId: permission.orgId,
      projectId: role.projectId
    } as const;

    const roleResult = await getRoleById({
      permission,
      scopeData,
      selector: { id: role.id }
    });

    return { ...roleResult, projectId: scopeData.projectId };
  };

  const getRoleBySlug = async (dto: TGetRoleBySlugDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetRoleBySlugGuard(dto);

    const scope = factory.getScopeField(scopeData);
    const isCustomRole = factory.isCustomRole(dto.selector.slug);
    if (!isCustomRole) {
      const predefinedRole = await factory.getPredefinedRoles(scopeData);
      const selectedRole = predefinedRole.find((el) => el.slug === dto.selector.slug);
      if (!selectedRole) throw new BadRequestError({ message: `Role with slug ${dto.selector.slug} not found` });
      return { ...selectedRole, permissions: UnpackedPermissionSchema.array().parse(selectedRole.permissions) };
    }

    const role = await roleDAL.findOne({
      slug: selector.slug,
      [scope.key]: scope.value
    });
    if (!role) throw new NotFoundError({ message: `Role with slug ${dto.selector.slug} not found` });

    return { ...role, [scope.key]: scope.value, permissions: unpackPermissions(role.permissions) };
  };

  const getUserPermission = async (dto: TGetUserPermissionDTO) => {
    if (dto.scopeData.scope === AccessScope.Organization) {
      const { permission, memberships } = await permissionService.getOrgPermission({
        actorId: dto.permission.id,
        actor: dto.permission.type,
        orgId: dto.permission.orgId,
        actorOrgId: dto.permission.orgId,
        actorAuthMethod: dto.permission.authMethod,
        scope: OrganizationActionScope.Any
      });
      return {
        permissions: packRules(permission.rules),
        memberships: stripExpiredTemporaryRoles(memberships),
        assumedPrivilegeDetails: undefined
      };
    }

    if (dto.scopeData.scope === AccessScope.Project) {
      const { permission, memberships } = await permissionService.getProjectPermission({
        actor: dto.permission.type,
        actorId: dto.permission.id,
        actionProjectType: ActionProjectType.Any,
        actorAuthMethod: dto.permission.authMethod,
        projectId: dto.scopeData.projectId,
        actorOrgId: dto.permission.orgId
      });

      const assumedPrivilegeDetailsCtx = requestContext.get(RequestContextKey.AssumedPrivilegeDetails);
      const isAssumingPrivilege = assumedPrivilegeDetailsCtx?.projectId === dto.scopeData.projectId;
      const assumedPrivilegeDetails = isAssumingPrivilege
        ? {
            actorId: assumedPrivilegeDetailsCtx?.actorId,
            actorType: assumedPrivilegeDetailsCtx?.actorType,
            actorName: "",
            actorEmail: ""
          }
        : undefined;

      if (assumedPrivilegeDetails?.actorType === ActorType.IDENTITY) {
        const identityDetails = await requestMemoize(
          requestMemoKeys.identityFindById(assumedPrivilegeDetails.actorId),
          () => identityDAL.findById(assumedPrivilegeDetails.actorId)
        );
        if (!identityDetails)
          throw new NotFoundError({ message: `Identity with ID ${assumedPrivilegeDetails.actorId} not found` });
        assumedPrivilegeDetails.actorName = identityDetails.name;
      } else if (assumedPrivilegeDetails?.actorType === ActorType.USER) {
        const userDetails = await requestMemoize(requestMemoKeys.userFindById(assumedPrivilegeDetails.actorId), () =>
          userDAL.findById(assumedPrivilegeDetails.actorId)
        );
        if (!userDetails)
          throw new NotFoundError({ message: `User with ID ${assumedPrivilegeDetails.actorId} not found` });
        assumedPrivilegeDetails.actorName = `${userDetails?.firstName ?? ""} ${userDetails?.lastName ?? ""}`.trim();
        assumedPrivilegeDetails.actorEmail = userDetails?.email || "";
      }

      return {
        permissions: packRules(permission.rules),
        memberships: stripExpiredTemporaryRoles(memberships),
        assumedPrivilegeDetails
      };
    }

    throw new BadRequestError({ message: "Invalid scope defined" });
  };

  return {
    createRole,
    updateRole,
    deleteRole,
    listRoles,
    getRoleById,
    getProjectRoleById,
    getRoleBySlug,
    getUserPermission
  };
};
