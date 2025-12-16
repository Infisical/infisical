import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { AccessScope, OrganizationActionScope, OrgMembershipRole, TRoles } from "@app/db/schemas";
import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";
import { TMembershipDALFactory } from "@app/services/membership/membership-dal";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMembershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionGroupActions, OrgPermissionSubjects } from "../permission/org-permission";
import { constructPermissionErrorMessage, validatePrivilegeChangeOperation } from "../permission/permission-fns";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TGroupDALFactory } from "./group-dal";
import {
  addIdentitiesToGroup,
  addUsersToGroupByUserIds,
  removeIdentitiesFromGroup,
  removeUsersFromGroupByUserIds
} from "./group-fns";
import {
  TAddMachineIdentityToGroupDTO,
  TAddUserToGroupDTO,
  TCreateGroupDTO,
  TDeleteGroupDTO,
  TGetGroupByIdDTO,
  TListGroupMachineIdentitiesDTO,
  TListGroupMembersDTO,
  TListGroupProjectsDTO,
  TListGroupUsersDTO,
  TRemoveMachineIdentityFromGroupDTO,
  TRemoveUserFromGroupDTO,
  TUpdateGroupDTO
} from "./group-types";
import { TIdentityGroupMembershipDALFactory } from "./identity-group-membership-dal";
import { TUserGroupMembershipDALFactory } from "./user-group-membership-dal";

type TGroupServiceFactoryDep = {
  userDAL: Pick<TUserDALFactory, "find" | "findUserEncKeyByUserIdsBatch" | "transaction" | "findUserByUsername">;
  identityDAL: Pick<TIdentityDALFactory, "findOne" | "find" | "transaction">;
  identityGroupMembershipDAL: Pick<TIdentityGroupMembershipDALFactory, "find" | "delete" | "insertMany">;
  groupDAL: Pick<
    TGroupDALFactory,
    | "create"
    | "findOne"
    | "update"
    | "delete"
    | "findAllGroupPossibleUsers"
    | "findAllGroupPossibleMachineIdentities"
    | "findAllGroupPossibleMembers"
    | "findById"
    | "transaction"
    | "findAllGroupProjects"
  >;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find" | "findOne" | "create">;
  membershipDAL: Pick<TMembershipDALFactory, "find" | "findOne">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "delete">;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "countAllOrgMembers" | "findById">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "findOne" | "delete" | "filterProjectsByUserMembership" | "transaction" | "insertMany" | "find"
  >;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete" | "findLatestProjectKey" | "insertMany">;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getOrgPermission" | "getOrgPermissionByRoles" | "invalidateProjectPermissionCache"
  >;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne">;
};

export type TGroupServiceFactory = ReturnType<typeof groupServiceFactory>;

export const groupServiceFactory = ({
  identityDAL,
  membershipDAL,
  identityGroupMembershipDAL,
  userDAL,
  groupDAL,
  orgDAL,
  userGroupMembershipDAL,
  projectDAL,
  projectBotDAL,
  projectKeyDAL,
  permissionService,
  licenseService,
  oidcConfigDAL,
  membershipGroupDAL,
  membershipRoleDAL
}: TGroupServiceFactoryDep) => {
  const createGroup = async ({ name, slug, role, actor, actorId, actorAuthMethod, actorOrgId }: TCreateGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Create, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to create group due to plan restriction. Upgrade plan to create group."
      });

    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([role], actorOrgId);
    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);
    const isCustomRole = Boolean(rolePermissionDetails?.role);
    if (role !== OrgMembershipRole.NoAccess) {
      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionGroupActions.GrantPrivileges,
        OrgPermissionSubjects.Groups,
        permission,
        rolePermissionDetails.permission
      );

      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to create group",
            shouldUseNewPrivilegeSystem,
            OrgPermissionGroupActions.GrantPrivileges,
            OrgPermissionSubjects.Groups
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
    }

    const group = await groupDAL.transaction(async (tx) => {
      const existingGroup = await groupDAL.findOne({ orgId: actorOrgId, name }, tx);
      if (existingGroup) {
        throw new BadRequestError({
          message: `Failed to create group with name '${name}'. Group with the same name already exists`
        });
      }

      const newGroup = await groupDAL.create(
        {
          name,
          slug: slug || slugify(`${name}-${alphaNumericNanoId(4)}`),
          orgId: actorOrgId,
          role: isCustomRole ? OrgMembershipRole.Custom : role,
          roleId: null
        },
        tx
      );

      const membership = await membershipGroupDAL.create(
        {
          actorGroupId: newGroup.id,
          scope: AccessScope.Organization,
          scopeOrgId: actorOrgId
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

      return newGroup;
    });

    return group;
  };

  const updateGroup = async ({
    id,
    name,
    slug,
    role,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TUpdateGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);
    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to update group due to plan restriction Upgrade plan to update group."
      });

    const group = await groupDAL.findOne({ orgId: actorOrgId, id });
    if (!group) {
      throw new NotFoundError({ message: `Failed to find group with ID ${id}` });
    }

    let customRole: TRoles | undefined;
    if (role) {
      const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([role], group.orgId);

      const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);
      const isCustomRole = Boolean(rolePermissionDetails?.role);

      const permissionBoundary = validatePrivilegeChangeOperation(
        shouldUseNewPrivilegeSystem,
        OrgPermissionGroupActions.GrantPrivileges,
        OrgPermissionSubjects.Groups,
        permission,
        rolePermissionDetails.permission
      );
      if (!permissionBoundary.isValid)
        throw new PermissionBoundaryError({
          message: constructPermissionErrorMessage(
            "Failed to update group",
            shouldUseNewPrivilegeSystem,
            OrgPermissionGroupActions.GrantPrivileges,
            OrgPermissionSubjects.Groups
          ),
          details: { missingPermissions: permissionBoundary.missingPermissions }
        });
      if (isCustomRole) customRole = rolePermissionDetails?.role;
    }

    const updatedGroup = await groupDAL.transaction(async (tx) => {
      if (name) {
        const existingGroup = await groupDAL.findOne({ orgId: actorOrgId, name }, tx);

        if (existingGroup && existingGroup.id !== id) {
          throw new BadRequestError({
            message: `Failed to update group with name '${name}'. Group with the same name already exists`
          });
        }
      }

      let updated = group;

      if (name || slug) {
        [updated] = await groupDAL.update(
          {
            id: group.id
          },
          {
            name,
            slug: slug ? slugify(slug) : undefined
          },
          tx
        );
      }

      if (role) {
        const membership = await membershipGroupDAL.findOne(
          {
            scope: AccessScope.Organization,
            actorGroupId: updated.id,
            scopeOrgId: updated.orgId
          },
          tx
        );
        await membershipRoleDAL.delete({ membershipId: membership.id }, tx);
        await membershipRoleDAL.create(
          {
            membershipId: membership.id,
            role: customRole ? OrgMembershipRole.Custom : role,
            customRoleId: customRole?.id ?? null
          },
          tx
        );
      }

      return updated;
    });

    return updatedGroup;
  };

  const deleteGroup = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TDeleteGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Delete, OrgPermissionSubjects.Groups);

    const plan = await licenseService.getPlan(actorOrgId);

    if (!plan.groups)
      throw new BadRequestError({
        message: "Failed to delete group due to plan restriction. Upgrade plan to delete group."
      });

    const [group] = await groupDAL.delete({
      id,
      orgId: actorOrgId
    });

    return group;
  };

  const getGroupById = async ({ id, actor, actorId, actorAuthMethod, actorOrgId }: TGetGroupByIdDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findById(id);
    if (!group || group.orgId !== actorOrgId) {
      throw new NotFoundError({
        message: `Cannot find group with ID ${id}`
      });
    }

    return group;
  };

  const listGroupUsers = async ({
    id,
    offset,
    limit,
    username,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search,
    filter
  }: TListGroupUsersDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const { members, totalCount } = await groupDAL.findAllGroupPossibleUsers({
      orgId: group.orgId,
      groupId: group.id,
      offset,
      limit,
      username,
      search,
      filter
    });

    return { users: members, totalCount };
  };

  const listGroupMachineIdentities = async ({
    id,
    offset,
    limit,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    search,
    filter
  }: TListGroupMachineIdentitiesDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const { machineIdentities, totalCount } = await groupDAL.findAllGroupPossibleMachineIdentities({
      orgId: group.orgId,
      groupId: group.id,
      offset,
      limit,
      search,
      filter
    });

    return { machineIdentities, totalCount };
  };

  const listGroupMembers = async ({
    id,
    offset,
    limit,
    search,
    orderBy,
    orderDirection,
    memberTypeFilter,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListGroupMembersDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const { members, totalCount } = await groupDAL.findAllGroupPossibleMembers({
      orgId: group.orgId,
      groupId: group.id,
      offset,
      limit,
      search,
      orderBy,
      orderDirection,
      memberTypeFilter
    });

    return { members, totalCount };
  };

  const listGroupProjects = async ({
    id,
    offset,
    limit,
    search,
    filter,
    orderBy,
    orderDirection,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListGroupProjectsDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const { projects, totalCount } = await groupDAL.findAllGroupProjects({
      orgId: group.orgId,
      groupId: group.id,
      offset,
      limit,
      search,
      filter,
      orderBy,
      orderDirection
    });

    return { projects, totalCount };
  };

  const addUserToGroup = async ({ id, username, actor, actorId, actorAuthMethod, actorOrgId }: TAddUserToGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const oidcConfig = await oidcConfigDAL.findOne({
      orgId: group.orgId,
      isActive: true
    });

    if (oidcConfig?.manageGroupMemberships) {
      throw new BadRequestError({
        message:
          "Cannot add user to group: OIDC group membership mapping is enabled - user must be assigned to this group in your OIDC provider."
      });
    }

    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([group.role], actorOrgId);
    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);

    // check if user has broader or equal to privileges than group
    const permissionBoundary = validatePrivilegeChangeOperation(
      shouldUseNewPrivilegeSystem,
      OrgPermissionGroupActions.AddMembers,
      OrgPermissionSubjects.Groups,
      permission,
      rolePermissionDetails.permission
    );

    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to add user to more privileged group",
          shouldUseNewPrivilegeSystem,
          OrgPermissionGroupActions.AddMembers,
          OrgPermissionSubjects.Groups
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const usersWithUsername = await userDAL.findUserByUsername(username);
    // akhilmhdh: case sensitive email resolution
    const user =
      usersWithUsername?.length > 1 ? usersWithUsername.find((el) => el.username === username) : usersWithUsername?.[0];
    if (!user) throw new NotFoundError({ message: `Failed to find user with username ${username}` });

    const users = await addUsersToGroupByUserIds({
      group,
      userIds: [user.id],
      userDAL,
      userGroupMembershipDAL,
      orgDAL,
      membershipGroupDAL,
      projectKeyDAL,
      projectDAL,
      projectBotDAL
    });

    return users[0];
  };

  const addMachineIdentityToGroup = async ({
    id,
    identityId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TAddMachineIdentityToGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([group.role], actorOrgId);
    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);

    // check if user has broader or equal to privileges than group
    const permissionBoundary = validatePrivilegeChangeOperation(
      shouldUseNewPrivilegeSystem,
      OrgPermissionGroupActions.AddIdentities,
      OrgPermissionSubjects.Groups,
      permission,
      rolePermissionDetails.permission
    );

    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to add identity to more privileged group",
          shouldUseNewPrivilegeSystem,
          OrgPermissionGroupActions.AddIdentities,
          OrgPermissionSubjects.Groups
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const identityMembership = await membershipDAL.findOne({
      scope: AccessScope.Organization,
      scopeOrgId: group.orgId,
      actorIdentityId: identityId
    });

    if (!identityMembership) {
      throw new NotFoundError({ message: `Identity with id ${identityId} is not part of the organization` });
    }

    const identities = await addIdentitiesToGroup({
      group,
      identityIds: [identityId],
      identityDAL,
      membershipDAL,
      identityGroupMembershipDAL
    });

    return identities[0];
  };

  const removeUserFromGroup = async ({
    id,
    username,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveUserFromGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);

    // check if group with slug exists
    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const oidcConfig = await oidcConfigDAL.findOne({
      orgId: group.orgId,
      isActive: true
    });

    if (oidcConfig?.manageGroupMemberships) {
      throw new BadRequestError({
        message:
          "Cannot remove user from group: OIDC group membership mapping is enabled - user must be removed from this group in your OIDC provider."
      });
    }

    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([group.role], actorOrgId);
    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);

    // check if user has broader or equal to privileges than group
    const permissionBoundary = validatePrivilegeChangeOperation(
      shouldUseNewPrivilegeSystem,
      OrgPermissionGroupActions.RemoveMembers,
      OrgPermissionSubjects.Groups,
      permission,
      rolePermissionDetails.permission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to delete user from more privileged group",
          shouldUseNewPrivilegeSystem,
          OrgPermissionGroupActions.RemoveMembers,
          OrgPermissionSubjects.Groups
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const usersWithUsername = await userDAL.findUserByUsername(username);
    // akhilmhdh: case sensitive email resolution
    const user =
      usersWithUsername?.length > 1 ? usersWithUsername.find((el) => el.username === username) : usersWithUsername?.[0];
    if (!user) throw new NotFoundError({ message: `Failed to find user with username ${username}` });

    const users = await removeUsersFromGroupByUserIds({
      group,
      userIds: [user.id],
      userDAL,
      userGroupMembershipDAL,
      membershipGroupDAL,
      projectKeyDAL
    });

    return users[0];
  };

  const removeMachineIdentityFromGroup = async ({
    id,
    identityId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TRemoveMachineIdentityFromGroupDTO) => {
    if (!actorOrgId) throw new UnauthorizedError({ message: "No organization ID provided in request" });

    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Edit, OrgPermissionSubjects.Groups);

    const group = await groupDAL.findOne({
      orgId: actorOrgId,
      id
    });

    if (!group)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([group.role], actorOrgId);
    const { shouldUseNewPrivilegeSystem } = await orgDAL.findById(actorOrgId);

    // check if user has broader or equal to privileges than group
    const permissionBoundary = validatePrivilegeChangeOperation(
      shouldUseNewPrivilegeSystem,
      OrgPermissionGroupActions.RemoveIdentities,
      OrgPermissionSubjects.Groups,
      permission,
      rolePermissionDetails.permission
    );
    if (!permissionBoundary.isValid)
      throw new PermissionBoundaryError({
        message: constructPermissionErrorMessage(
          "Failed to remove identity from more privileged group",
          shouldUseNewPrivilegeSystem,
          OrgPermissionGroupActions.RemoveIdentities,
          OrgPermissionSubjects.Groups
        ),
        details: { missingPermissions: permissionBoundary.missingPermissions }
      });

    const identityMembership = await membershipDAL.findOne({
      scope: AccessScope.Organization,
      scopeOrgId: group.orgId,
      actorIdentityId: identityId
    });

    if (!identityMembership) {
      throw new NotFoundError({ message: `Identity with id ${identityId} is not part of the organization` });
    }

    const identities = await removeIdentitiesFromGroup({
      group,
      identityIds: [identityId],
      identityDAL,
      membershipDAL,
      identityGroupMembershipDAL
    });

    return identities[0];
  };

  return {
    createGroup,
    updateGroup,
    deleteGroup,
    listGroupUsers,
    listGroupMachineIdentities,
    listGroupMembers,
    listGroupProjects,
    addUserToGroup,
    addMachineIdentityToGroup,
    removeUserFromGroup,
    removeMachineIdentityFromGroup,
    getGroupById
  };
};
