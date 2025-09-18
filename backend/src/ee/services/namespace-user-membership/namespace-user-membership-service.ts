import { ForbiddenError } from "@casl/ability";

import { NamespaceMembershipRole, TNamespaceMembershipRolesInsert } from "@app/db/schemas";
import { TNamespaceDALFactory } from "@app/ee/services/namespace/namespace-dal";
import {
  NamespacePermissionActions,
  NamespacePermissionSubjects
} from "@app/ee/services/permission/namespace-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { ActorType } from "../../../services/auth/auth-type";
import { TLicenseServiceFactory } from "../license/license-service";
import { TNamespaceMembershipRoleDALFactory } from "../namespace-role/namespace-membership-role-dal";
import { TNamespaceRoleDALFactory } from "../namespace-role/namespace-role-dal";
import { TNamespaceUserMembershipDALFactory } from "./namespace-user-membership-dal";
import {
  NamespaceUserMembershipTemporaryMode,
  TCreateNamespaceUserMembershipDTO,
  TDeleteNamespaceMembershipDTO,
  TGetNamespaceMembershipByIdDTO,
  TListNamespaceMembershipDTO,
  TSearchNamespaceMembershipDTO,
  TUpdateNamespaceUserMembershipDTO
} from "./namespace-user-membership-types";

type TNamespaceUserMembershipServiceFactoryDep = {
  namespaceUserMembershipDAL: TNamespaceUserMembershipDALFactory;
  namespaceDAL: Pick<TNamespaceDALFactory, "findOne">;
  orgMembershipDAL: Pick<TOrgDALFactory, "findMembership">;
  namespaceRoleDAL: Pick<TNamespaceRoleDALFactory, "find" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getNamespacePermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  namespaceMembershipRoleDAL: Pick<TNamespaceMembershipRoleDALFactory, "delete" | "insertMany">;
};

export type TNamespaceUserMembershipServiceFactory = ReturnType<typeof namespaceUserMembershipServiceFactory>;

export const namespaceUserMembershipServiceFactory = ({
  namespaceUserMembershipDAL,
  namespaceDAL,
  namespaceRoleDAL,
  permissionService,
  licenseService,
  namespaceMembershipRoleDAL,
  orgMembershipDAL
}: TNamespaceUserMembershipServiceFactoryDep) => {
  const addUserToNamespace = async ({
    namespaceSlug,
    permission,
    roleSlugs,
    validatedUsers
  }: TCreateNamespaceUserMembershipDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.orgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      namespaceId: namespace.id,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId
    });

    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionActions.Create,
      NamespacePermissionSubjects.Member
    );

    const existingMembers = await namespaceUserMembershipDAL.findMembershipsByUsername(
      namespace.id,
      validatedUsers?.map((el) => el.username)
    );

    if (existingMembers.length === validatedUsers.length) return { namespaceUsers: existingMembers };

    // validate custom roles input
    const customInputRoles = roleSlugs.filter(
      (role) =>
        !Object.values(NamespaceMembershipRole)
          .filter((r) => r !== NamespaceMembershipRole.Custom)
          .includes(role as NamespaceMembershipRole.Member)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    if (hasCustomRole) {
      const plan = await licenseService.getPlan(permission.orgId);
      if (!plan.rbac) {
        throw new BadRequestError({
          message: "Failed to set custom role: Plan restriction. Upgrade plan to continue."
        });
      }
    }

    const customRoles = hasCustomRole
      ? await namespaceRoleDAL.find({
          namespaceId: namespace.id,
          $in: { slug: customInputRoles.map((role) => role) }
        })
      : [];

    if (customRoles.length !== customInputRoles.length) {
      throw new NotFoundError({ message: "One or more custom roles not found" });
    }

    const nonExistingUsers = validatedUsers.filter((user) => !existingMembers.find((i) => user.id === i.user.id));
    const orgMembership = await orgMembershipDAL.findMembership({
      $in: { userId: nonExistingUsers.map((el) => el.id) }
    });

    const customRoleGroupBySlug = groupBy(customRoles, (i) => i.slug);
    const newNamespaceUsers = await namespaceUserMembershipDAL.transaction(async (tx) => {
      const newUser = await namespaceUserMembershipDAL.insertMany(
        orgMembership.map((el) => ({
          orgUserMembershipId: el.id,
          namespaceId: namespace.id
        })),
        tx
      );

      const roles = customInputRoles.map((el) =>
        customRoleGroupBySlug?.[el]?.[0]
          ? {
              role: NamespaceMembershipRole.Custom,
              customRoleId: customRoleGroupBySlug?.[el]?.[0]?.id
            }
          : { role: el, customRoleId: null }
      );
      const membershipRoleData: { namespaceMembershipId: string; role: string; customRoleId?: string | null }[] = [];
      for (const role of roles) {
        newUser.forEach((el) => {
          membershipRoleData.push({ namespaceMembershipId: el.id, ...role });
        });
      }

      await namespaceMembershipRoleDAL.insertMany(membershipRoleData, tx);
      return newUser;
    });
    return { newNamespaceUsers };
  };

  const listNamespaceMemberships = async ({
    permission,
    namespaceSlug,
    // TODO(namespace): add count property here
    limit = 1000,
    offset = 0
  }: TListNamespaceMembershipDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.orgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      namespaceId: namespace.id,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId
    });

    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionActions.Read,
      NamespacePermissionSubjects.Member
    );

    const members = await namespaceUserMembershipDAL.findAllMembers(namespace.id, {
      limit,
      offset
    });
    return { members, totalCount: members.length };
  };

  const getNamespaceMembershipById = async ({
    permission,
    namespaceSlug,
    membershipId
  }: TGetNamespaceMembershipByIdDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.orgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      namespaceId: namespace.id,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId
    });
    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionActions.Read,
      NamespacePermissionSubjects.Member
    );

    const [membership] = await namespaceUserMembershipDAL.findAllMembers(namespace.id, {
      id: membershipId
    });
    if (!membership) throw new NotFoundError({ message: `Namespace membership not found for ID ${membershipId}` });
    return membership;
  };

  const searchNamespaceMemberships = async ({
    permission,
    namespaceSlug,
    username,
    limit = 50,
    offset = 0
  }: TSearchNamespaceMembershipDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.orgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      namespaceId: namespace.id,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId
    });
    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionActions.Read,
      NamespacePermissionSubjects.Member
    );

    const members = await namespaceUserMembershipDAL.findAllMembers(namespace.id, {
      username,
      limit,
      offset
    });
    return { members, totalCount: members.length };
  };

  const updateNamespaceMembership = async ({
    permission,
    namespaceSlug,
    membershipId,
    roles
  }: TUpdateNamespaceUserMembershipDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.orgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      namespaceId: namespace.id,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId
    });
    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionActions.Edit,
      NamespacePermissionSubjects.Member
    );

    const membership = await namespaceUserMembershipDAL.findOne({ id: membershipId, namespaceId: namespace.id });
    if (!membership) throw new NotFoundError({ message: "Namespace membership not found" });

    // validate custom roles input
    const customInputRoles = roles.filter(
      ({ role }) =>
        !Object.values(NamespaceMembershipRole)
          .filter((r) => r !== NamespaceMembershipRole.Custom)
          .includes(role as NamespaceMembershipRole.Member)
    );
    const hasCustomRole = Boolean(customInputRoles.length);
    if (hasCustomRole) {
      const plan = await licenseService.getPlan(permission.orgId);
      if (!plan.rbac) {
        throw new BadRequestError({
          message: "Failed to set custom role: Plan restriction. Upgrade plan to continue."
        });
      }
    }

    const customRoles = hasCustomRole
      ? await namespaceRoleDAL.find({
          namespaceId: namespace.id,
          $in: { slug: customInputRoles.map(({ role }) => role) }
        })
      : [];

    if (customRoles.length !== customInputRoles.length) {
      throw new NotFoundError({ message: "One or more custom roles not found" });
    }

    const customRolesGroupBySlug = customRoles.reduce(
      (acc, role) => {
        acc[role.slug] = role;
        return acc;
      },
      {} as Record<string, (typeof customRoles)[0]>
    );

    const sanitizedMembershipRoles = roles.map((inputRole) => {
      const isCustomRole = Boolean(customRolesGroupBySlug[inputRole.role]);
      if (!inputRole.isTemporary) {
        return {
          namespaceMembershipId: membershipId,
          role: isCustomRole ? NamespaceMembershipRole.Custom : inputRole.role,
          customRoleId: customRolesGroupBySlug[inputRole.role]?.id || null
        };
      }

      const relativeTimeInMs = ms(inputRole.temporaryRange);
      return {
        namespaceMembershipId: membershipId,
        role: isCustomRole ? NamespaceMembershipRole.Custom : inputRole.role,
        customRoleId: customRolesGroupBySlug[inputRole.role]?.id || null,
        isTemporary: true,
        temporaryMode: NamespaceUserMembershipTemporaryMode.Relative,
        temporaryRange: inputRole.temporaryRange,
        temporaryAccessStartTime: new Date(inputRole.temporaryAccessStartTime),
        temporaryAccessEndTime: new Date(new Date(inputRole.temporaryAccessStartTime).getTime() + relativeTimeInMs)
      };
    });

    const updatedRoles = await namespaceUserMembershipDAL.transaction(async (tx) => {
      await namespaceMembershipRoleDAL.delete({ namespaceMembershipId: membershipId }, tx);
      return namespaceMembershipRoleDAL.insertMany(sanitizedMembershipRoles as TNamespaceMembershipRolesInsert[], tx);
    });

    return updatedRoles;
  };

  const deleteNamespaceMembership = async ({
    permission,
    namespaceSlug,
    membershipId
  }: TDeleteNamespaceMembershipDTO) => {
    const namespace = await namespaceDAL.findOne({ name: namespaceSlug, orgId: permission.orgId });
    if (!namespace) throw new NotFoundError({ message: "Namespace not found" });

    const { permission: namespacePermission } = await permissionService.getNamespacePermission({
      actor: permission.type,
      actorId: permission.id,
      namespaceId: namespace.id,
      actorAuthMethod: permission.authMethod,
      actorOrgId: permission.orgId
    });

    ForbiddenError.from(namespacePermission).throwUnlessCan(
      NamespacePermissionActions.Delete,
      NamespacePermissionSubjects.Member
    );

    const membership = await namespaceUserMembershipDAL.findOne({ id: membershipId, namespaceId: namespace.id });
    if (!membership) throw new NotFoundError({ message: "Namespace membership not found" });

    // Prevent users from removing themselves if they're the only admin
    if (permission.type === ActorType.USER) {
      const namespaceAdmins = await namespaceUserMembershipDAL.findAllMembers(namespace.id, {
        roles: [NamespaceMembershipRole.Admin]
      });

      if (namespaceAdmins.length === 1 && namespaceAdmins?.[0]?.id === membershipId) {
        throw new BadRequestError({
          message: "Cannot remove the last admin member from the namespace"
        });
      }
    }

    const deletedMembership = await namespaceUserMembershipDAL.transaction(async (tx) => {
      const [deleted] = await namespaceUserMembershipDAL.delete({ id: membershipId }, tx);
      return deleted;
    });

    if (!deletedMembership) {
      throw new NotFoundError({ message: "Failed to delete namespace membership" });
    }

    return deletedMembership;
  };

  return {
    listNamespaceMemberships,
    getNamespaceMembershipById,
    searchNamespaceMemberships,
    updateNamespaceMembership,
    deleteNamespaceMembership,
    addUserToNamespace
  };
};
