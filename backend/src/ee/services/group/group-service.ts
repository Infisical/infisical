import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";

import { AccessScope, OrganizationActionScope, OrgMembershipRole, TGroups, TRoles } from "@app/db/schemas";
import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { BadRequestError, NotFoundError, PermissionBoundaryError, UnauthorizedError } from "@app/lib/errors";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { TGenericPermission } from "@app/lib/types";
import { ActorType } from "@app/services/auth/auth-type";
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
    | "listAvailableGroups"
    | "getGroupsReferencingGroup"
  >;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find" | "findOne" | "create" | "getGroupById" | "deleteById">;
  membershipDAL: Pick<TMembershipDALFactory, "find" | "findOne">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create" | "delete">;
  orgDAL: Pick<TOrgDALFactory, "findMembership" | "countAllOrgMembers" | "findById" | "findEffectiveOrgMembership">;
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
          orgId: actorOrgId
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

    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: { scope: AccessScope.Organization, orgId: actorOrgId },
      groupId: id
    });
    if (!groupMembership?.group) {
      throw new NotFoundError({ message: `Failed to find group with ID ${id}` });
    }
    const { group } = groupMembership;

    const isLinkedGroup = group.orgId !== actorOrgId;
    if (isLinkedGroup && (name || slug)) {
      throw new BadRequestError({
        message: "Cannot update name or slug of a linked group. Only the role in this sub-organization can be updated."
      });
    }

    let customRole: TRoles | undefined;
    if (role) {
      const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles([role], actorOrgId);

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

    if (!isLinkedGroup && name) {
      const existingGroup = await groupDAL.findOne({ orgId: actorOrgId, name });
      if (existingGroup && existingGroup.id !== id) {
        throw new BadRequestError({
          message: `Failed to update group with name '${name}'. Group with the same name already exists`
        });
      }
    }

    const updatedGroup = await groupDAL.transaction(async (tx): Promise<TGroups> => {
      const [nameSlugRow] =
        !isLinkedGroup && (name || slug)
          ? await groupDAL.update({ id: group.id }, { name, slug: slug ? slugify(slug) : undefined }, tx)
          : [];

      if (role) {
        const membership = await membershipGroupDAL.findOne(
          {
            scope: AccessScope.Organization,
            actorGroupId: group.id,
            scopeOrgId: actorOrgId
          },
          tx
        );
        if (!membership) {
          throw new NotFoundError({ message: "Group membership not found" });
        }
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

      return nameSlugRow ?? group;
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

    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: { scope: AccessScope.Organization, orgId: actorOrgId },
      groupId: id
    });
    if (!groupMembership?.group) {
      throw new NotFoundError({ message: `Cannot find group with ID ${id}` });
    }
    const { group } = groupMembership;

    if (group.orgId !== actorOrgId) {
      // Linked group: unlink by deleting the org membership and all project memberships for this group in this sub-org
      await groupDAL.transaction(async (tx) => {
        // Collect users and identities in the group before cleanup
        const groupUsers = await userGroupMembershipDAL.find({ groupId: id }, { tx });
        const groupIdentities = await identityGroupMembershipDAL.find({ groupId: id }, { tx });

        // Find all project-level memberships for this group in the sub-org
        const projectMemberships = await membershipGroupDAL.find(
          {
            actorGroupId: id,
            scopeOrgId: actorOrgId,
            scope: AccessScope.Project
          },
          { tx }
        );

        // Delete roles and memberships for each project membership
        if (projectMemberships.length > 0) {
          await Promise.all(
            projectMemberships.map(async (pm) => {
              await membershipRoleDAL.delete({ membershipId: pm.id }, tx);
              await membershipGroupDAL.deleteById(pm.id, tx);
            })
          );
        }

        // Delete the org-level group membership
        await membershipRoleDAL.delete({ membershipId: groupMembership.id }, tx);
        await membershipGroupDAL.deleteById(groupMembership.id, tx);

        // For each user/identity in the group, check if they still have org access; if not, remove their direct project memberships
        await Promise.all([
          ...groupUsers.map(async ({ userId }) => {
            const remainingAccess = await orgDAL.findEffectiveOrgMembership({
              actorType: ActorType.USER,
              actorId: userId,
              orgId: actorOrgId,
              acceptAnyStatus: true,
              tx
            });

            if (!remainingAccess) {
              const userProjectMemberships = await membershipGroupDAL.find(
                { actorUserId: userId, scopeOrgId: actorOrgId, scope: AccessScope.Project },
                { tx }
              );
              await Promise.all(
                userProjectMemberships.map(async (pm) => {
                  await membershipRoleDAL.delete({ membershipId: pm.id }, tx);
                  await membershipGroupDAL.deleteById(pm.id, tx);
                })
              );
            }
          }),
          ...groupIdentities.map(async ({ identityId }) => {
            const remainingAccess = await orgDAL.findEffectiveOrgMembership({
              actorType: ActorType.IDENTITY,
              actorId: identityId,
              orgId: actorOrgId,
              acceptAnyStatus: true,
              tx
            });

            if (!remainingAccess) {
              const identityProjectMemberships = await membershipGroupDAL.find(
                { actorIdentityId: identityId, scopeOrgId: actorOrgId, scope: AccessScope.Project },
                { tx }
              );
              await Promise.all(
                identityProjectMemberships.map(async (pm) => {
                  await membershipRoleDAL.delete({ membershipId: pm.id }, tx);
                  await membershipGroupDAL.deleteById(pm.id, tx);
                })
              );
            }
          })
        ]);
      });
      return group;
    }

    const referencingSubOrgs = await groupDAL.getGroupsReferencingGroup(id);
    if (referencingSubOrgs.length > 0) {
      const orgList = referencingSubOrgs.map((o) => `"${o.orgName}"`).join(", ");
      throw new BadRequestError({
        message: `Cannot delete this group because it is linked by sub-organizations. Unlink it from these sub-organizations first: ${orgList}.`
      });
    }

    const [deletedGroup] = await groupDAL.delete({
      id,
      orgId: actorOrgId
    });

    return deletedGroup;
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

    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: { scope: AccessScope.Organization, orgId: actorOrgId },
      groupId: id
    });
    if (!groupMembership?.group) {
      throw new NotFoundError({ message: `Cannot find group with ID ${id}` });
    }
    const { group } = groupMembership as { group: TGroups };

    const firstRole = groupMembership.roles?.[0];
    const role = firstRole?.role ?? "";
    const roleId = firstRole?.id ?? null;
    const customRoleSlug = firstRole?.customRoleSlug ?? null;
    const customRole = firstRole?.customRoleSlug
      ? {
          id: firstRole.id,
          name: firstRole.customRoleName ?? "",
          slug: firstRole.customRoleSlug,
          permissions: null,
          description: null
        }
      : undefined;
    return {
      id: group.id,
      orgId: group.orgId,
      name: group.name,
      slug: group.slug,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      role,
      roleId,
      customRoleSlug,
      customRole
    };
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

    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: { scope: AccessScope.Organization, orgId: actorOrgId },
      groupId: id
    });
    if (!groupMembership?.group) {
      throw new NotFoundError({ message: `Failed to find group with ID ${id}` });
    }
    const { group } = groupMembership;

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

    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: { scope: AccessScope.Organization, orgId: actorOrgId },
      groupId: id
    });
    if (!groupMembership?.group) {
      throw new NotFoundError({ message: `Failed to find group with ID ${id}` });
    }
    const { group } = groupMembership;

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

    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: { scope: AccessScope.Organization, orgId: actorOrgId },
      groupId: id
    });
    if (!groupMembership?.group) {
      throw new NotFoundError({ message: `Failed to find group with ID ${id}` });
    }
    const { group } = groupMembership;

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

    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: { scope: AccessScope.Organization, orgId: actorOrgId },
      groupId: id
    });
    if (!groupMembership?.group) {
      throw new NotFoundError({ message: `Failed to find group with ID ${id}` });
    }
    const { group } = groupMembership;

    const { projects, totalCount } = await groupDAL.findAllGroupProjects({
      orgId: actorOrgId,
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

  const listAvailableGroups = async ({
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    rootOrgId
  }: TGenericPermission & { rootOrgId: string }) => {
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

    return groupDAL.listAvailableGroups(actorOrgId, rootOrgId);
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
    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      groupId: id
    });

    if (!groupMembership)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const oidcConfig = await oidcConfigDAL.findOne({
      orgId: actorOrgId,
      isActive: true
    });

    if (oidcConfig?.manageGroupMemberships) {
      throw new BadRequestError({
        message:
          "Cannot add user to group: OIDC group membership mapping is enabled - user must be assigned to this group in your OIDC provider."
      });
    }

    const groupRoles = groupMembership.roles.map((el) => el.customRoleSlug || el.role);
    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles(groupRoles, actorOrgId);
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
      group: groupMembership.group,
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
    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      groupId: id
    });

    if (!groupMembership)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const groupRoles = groupMembership.roles.map((el) => el.customRoleSlug || el.role);
    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles(groupRoles, actorOrgId);
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
      scopeOrgId: groupMembership.group.orgId,
      actorIdentityId: identityId
    });

    if (!identityMembership) {
      throw new NotFoundError({ message: `Identity with id ${identityId} is not part of the organization` });
    }

    const identities = await addIdentitiesToGroup({
      group: groupMembership.group,
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
    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      groupId: id
    });

    if (!groupMembership)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const oidcConfig = await oidcConfigDAL.findOne({
      orgId: groupMembership.group.orgId,
      isActive: true
    });

    if (oidcConfig?.manageGroupMemberships) {
      throw new BadRequestError({
        message:
          "Cannot remove user from group: OIDC group membership mapping is enabled - user must be removed from this group in your OIDC provider."
      });
    }

    const groupRoles = groupMembership.roles.map((el) => el.customRoleSlug || el.role);
    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles(groupRoles, actorOrgId);
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
      group: groupMembership.group,
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

    const groupMembership = await membershipGroupDAL.getGroupById({
      scopeData: {
        scope: AccessScope.Organization,
        orgId: actorOrgId
      },
      groupId: id
    });

    if (!groupMembership)
      throw new NotFoundError({
        message: `Failed to find group with ID ${id}`
      });

    const groupRoles = groupMembership.roles.map((el) => el.customRoleSlug || el.role);
    const [rolePermissionDetails] = await permissionService.getOrgPermissionByRoles(groupRoles, actorOrgId);
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
      scopeOrgId: groupMembership.group.orgId,
      actorIdentityId: identityId
    });

    if (!identityMembership) {
      throw new NotFoundError({ message: `Identity with id ${identityId} is not part of the organization` });
    }

    const identities = await removeIdentitiesFromGroup({
      group: groupMembership.group,
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
    getGroupById,
    listGroupUsers,
    listGroupMachineIdentities,
    listGroupMembers,
    listGroupProjects,
    listAvailableGroups,
    addUserToGroup,
    addMachineIdentityToGroup,
    removeUserFromGroup,
    removeMachineIdentityFromGroup
  };
};
