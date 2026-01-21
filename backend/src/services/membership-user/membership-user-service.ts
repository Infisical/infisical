import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  TemporaryPermissionMode,
  TMembershipRolesInsert
} from "@app/db/schemas";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { SearchResourceOperators } from "@app/lib/search-resource/search";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { AuthMethod } from "../auth/auth-type";
import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { deleteOrgMembershipsFn } from "../org/org-fns";
import { isCustomOrgRole } from "../org/org-role-fns";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TRoleDALFactory } from "../role/role-dal";
import { TSmtpService } from "../smtp/smtp-service";
import { getServerCfg } from "../super-admin/super-admin-service";
import { LoginMethod } from "../super-admin/super-admin-types";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { TMembershipUserDALFactory } from "./membership-user-dal";
import {
  TCreateMembershipUserDTO,
  TDeleteMembershipUserDTO,
  TGetMembershipUserByUserIdDTO,
  TListMembershipUserDTO,
  TUpdateMembershipUserDTO
} from "./membership-user-types";
import { newNamespaceMembershipUserFactory } from "./namespace/namespace-membership-user-factory";
import { newOrgMembershipUserFactory } from "./org/org-membership-user-factory";
import { newProjectMembershipUserFactory } from "./project/project-membership-user-factory";

type TMembershipUserServiceFactoryDep = {
  membershipUserDAL: TMembershipUserDALFactory;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "insertMany" | "delete">;
  orgDAL: Pick<TOrgDALFactory, "findById" | "transaction" | "find">;
  roleDAL: Pick<TRoleDALFactory, "find">;
  userDAL: TUserDALFactory;
  permissionService: Pick<
    TPermissionServiceFactory,
    "getProjectPermission" | "getProjectPermissionByRoles" | "getOrgPermission"
  >;
  licenseService: TLicenseServiceFactory;
  projectKeyDAL: TProjectKeyDALFactory;
  userAliasDAL: TUserAliasDALFactory;
  smtpService: TSmtpService;
  tokenService: TAuthTokenServiceFactory;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  projectDAL: TProjectDALFactory;
  additionalPrivilegeDAL: TAdditionalPrivilegeDALFactory;
};

export type TMembershipUserServiceFactory = ReturnType<typeof membershipUserServiceFactory>;

export const membershipUserServiceFactory = ({
  membershipUserDAL,
  roleDAL,
  membershipRoleDAL,
  userDAL,
  permissionService,
  orgDAL,
  projectKeyDAL,
  userAliasDAL,
  licenseService,
  smtpService,
  tokenService,
  userGroupMembershipDAL,
  projectDAL,
  additionalPrivilegeDAL
}: TMembershipUserServiceFactoryDep) => {
  const scopeFactory = {
    [AccessScope.Organization]: newOrgMembershipUserFactory({
      permissionService,
      licenseService,
      smtpService,
      orgDAL,
      tokenService,
      userDAL,
      userGroupMembershipDAL,
      membershipUserDAL
    }),
    [AccessScope.Namespace]: newNamespaceMembershipUserFactory({}),
    [AccessScope.Project]: newProjectMembershipUserFactory({
      orgDAL,
      permissionService,
      membershipUserDAL,
      projectDAL,
      smtpService
    })
  };

  const $getUsers = async (usernames: string[]) => {
    const existingUsers = await userDAL.find({ $in: { username: usernames } });
    if (existingUsers.length !== usernames.length) {
      const newUserEmails = usernames.filter(
        (inviteeEmail) => !existingUsers.find((el) => el.username === inviteeEmail)
      );
      await userDAL.transaction(async (tx) => {
        for await (const inviteeEmail of newUserEmails) {
          const usersByUsername = await userDAL.findUserByUsername(inviteeEmail, tx);
          let inviteeUser =
            usersByUsername?.length > 1
              ? usersByUsername.find((el) => el.username === inviteeEmail)
              : usersByUsername?.[0];

          // if the user doesn't exist we create the user with the email
          if (!inviteeUser) {
            // TODO(carlos): will be removed once the function receives usernames instead of emails
            const usersByEmail = await userDAL.findUserByEmail(inviteeEmail, tx);
            if (usersByEmail?.length === 1) {
              [inviteeUser] = usersByEmail;
            } else {
              inviteeUser = await userDAL.create(
                {
                  isAccepted: false,
                  email: inviteeEmail,
                  username: inviteeEmail,
                  authMethods: [AuthMethod.EMAIL],
                  isGhost: false
                },
                tx
              );
            }
          }

          existingUsers.push(inviteeUser);
          const inviteeUserId = inviteeUser?.id;
          const existingEncryptionKey = await userDAL.findUserEncKeyByUserId(inviteeUserId, tx);

          // when user is missing the encrytion keys
          // this could happen either if user doesn't exist or user didn't find step 3 of generating the encryption keys of srp
          // So what we do is we generate a random secure password and then encrypt it with a random pub-private key
          // Then when user sign in (as login is not possible as isAccepted is false) we rencrypt the private key with the user password
          if (!inviteeUser || (inviteeUser && !inviteeUser?.isAccepted && !existingEncryptionKey)) {
            await userDAL.createUserEncryption(
              {
                userId: inviteeUserId,
                encryptionVersion: 2
              },
              tx
            );
          }
        }
      });
    }
    return existingUsers;
  };

  const createMembership = async (dto: TCreateMembershipUserDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    const orgDetails = await orgDAL.findById(dto.permission.orgId);

    // If roles array is empty and scope is Organization, use org's default role
    let rolesToUse = data.roles;
    if (data.roles.length === 0 && scopeData.scope === AccessScope.Organization) {
      const defaultMembershipRole = orgDetails.defaultMembershipRole || OrgMembershipRole.NoAccess;

      let defaultRole: string;
      if (isCustomOrgRole(defaultMembershipRole)) {
        const customRoles = await roleDAL.find({
          id: defaultMembershipRole,
          orgId: dto.permission.orgId
        });
        if (customRoles.length === 0) {
          throw new NotFoundError({ message: "Default custom role not found" });
        }
        defaultRole = customRoles[0].slug;
      } else {
        defaultRole = defaultMembershipRole;
      }

      rolesToUse = [{ isTemporary: false, role: defaultRole }];
    }

    const hasNoPermanentRole = rolesToUse.every((el) => el.isTemporary);
    if (hasNoPermanentRole) {
      throw new BadRequestError({
        message: "User must have at least one permanent role"
      });
    }
    const isInvalidTemporaryRole = rolesToUse.some((el) => {
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

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    const users = await $getUsers(dto.data.usernames);
    const existingMemberships = await membershipUserDAL.find({
      scope: scopeData.scope,
      ...scopeDatabaseFields,
      $in: {
        actorUserId: users.map((el) => el.id)
      }
    });

    if (existingMemberships.length === users.length) return { memberships: [] };
    const isSubOrganization = Boolean(orgDetails.rootOrgId);

    const serverCfg = await getServerCfg();
    const isEmailLoginEnabled =
      !serverCfg.enabledLoginMethods || serverCfg.enabledLoginMethods.includes(LoginMethod.EMAIL);

    const newMembershipUsers = users.filter((user) => !existingMemberships?.find((el) => el.actorUserId === user.id));
    await factory.onCreateMembershipUserGuard(dto, newMembershipUsers);
    const newMemberships = newMembershipUsers.map((user) => {
      let status: OrgMembershipStatus | undefined;
      if (scopeData.scope === AccessScope.Organization) {
        if (isSubOrganization || !isEmailLoginEnabled) {
          status = OrgMembershipStatus.Accepted;
        } else {
          status = OrgMembershipStatus.Invited;
        }
      }

      return {
        scope: scopeData.scope,
        ...scopeDatabaseFields,
        actorUserId: user.id,
        status,
        inviteEmail: status === OrgMembershipStatus.Invited ? user.email : undefined
      };
    });

    const customInputRoles = rolesToUse.filter((el) => factory.isCustomRole(el.role));
    const hasCustomRole = customInputRoles.length > 0;
    if (hasCustomRole) {
      const plan = await licenseService.getPlan(scopeData.orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message:
            "Failed to set custom default role due to plan RBAC restriction. Upgrade plan to set custom default org membership role."
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

    const membershipDoc = await membershipUserDAL.transaction(async (tx) => {
      const docs = await membershipUserDAL.insertMany(newMemberships, tx);

      const roleDocs: TMembershipRolesInsert[] = [];
      docs.forEach((membership) => {
        rolesToUse.forEach((membershipRole) => {
          const isCustomRole = Boolean(customRolesGroupBySlug?.[membershipRole.role]?.[0]);
          if (membershipRole.isTemporary) {
            const relativeTimeInMs = membershipRole.temporaryRange ? ms(membershipRole.temporaryRange) : null;
            roleDocs.push({
              membershipId: membership.id,
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
              membershipId: membership.id,
              role: isCustomRole ? ProjectMembershipRole.Custom : membershipRole.role,
              customRoleId: customRolesGroupBySlug[membershipRole.role]
                ? customRolesGroupBySlug[membershipRole.role][0].id
                : null
            });
          }
        });
      });
      await membershipRoleDAL.insertMany(roleDocs, tx);
      return docs;
    });

    const { signUpTokens } = await factory.onCreateMembershipComplete(dto, newMembershipUsers);
    return { memberships: membershipDoc, signUpTokens };
  };

  const updateMembership = async (dto: TUpdateMembershipUserDTO) => {
    const { scopeData, data } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onUpdateMembershipUserGuard(dto);

    const customInputRoles = data.roles.filter((el) => factory.isCustomRole(el.role));
    const hasCustomRole = customInputRoles.length > 0;
    if (hasCustomRole) {
      const plan = await licenseService.getPlan(scopeData.orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message:
            "Failed to set custom default role due to plan RBAC restriction. Upgrade plan to set custom default org membership role."
        });
    }

    const hasNoPermanentRole = data.roles.every((el) => el.isTemporary);
    if (hasNoPermanentRole) {
      throw new BadRequestError({
        message: "User must have at least one permanent role"
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

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    const existingMembership = await membershipUserDAL.findOne({
      scope: scopeData.scope,
      ...scopeDatabaseFields,
      actorUserId: dto.selector.userId
    });
    if (!existingMembership)
      throw new BadRequestError({
        message: "User doesn't have membership"
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

    const membershipDoc = await membershipUserDAL.transaction(async (tx) => {
      const doc =
        typeof data?.isActive === "undefined"
          ? existingMembership
          : await membershipUserDAL.updateById(
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
      const insertedRoles = await membershipRoleDAL.insertMany(roleDocs, tx);
      return { ...doc, roles: insertedRoles };
    });

    return { membership: membershipDoc };
  };

  const deleteMembership = async (dto: TDeleteMembershipUserDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onDeleteMembershipUserGuard(dto);

    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    const existingMembership = await membershipUserDAL.findOne({
      scope: scopeData.scope,
      ...scopeDatabaseFields,
      actorUserId: dto.selector.userId
    });
    if (!existingMembership)
      throw new BadRequestError({
        message: "User doesn't have membership"
      });

    if (existingMembership.actorUserId === dto.permission.id)
      throw new BadRequestError({
        message: "You can't delete your own membership"
      });

    const membershipDoc = await membershipUserDAL.transaction(async (tx) => {
      if (dto.scopeData.scope === AccessScope.Organization) {
        const [doc] = await deleteOrgMembershipsFn({
          orgMembershipIds: [existingMembership.id],
          orgId: dto.permission.orgId,
          orgDAL,
          projectKeyDAL,
          userAliasDAL,
          licenseService,
          userId: dto.permission.id,
          membershipUserDAL,
          userGroupMembershipDAL,
          membershipRoleDAL,
          additionalPrivilegeDAL
        });
        return doc;
      }

      if (dto.scopeData.scope === AccessScope.Project) {
        await additionalPrivilegeDAL.delete(
          {
            actorUserId: dto.selector.userId,
            projectId: dto.scopeData.projectId
          },
          tx
        );
      }

      await membershipRoleDAL.delete({ membershipId: existingMembership.id }, tx);
      const doc = await membershipUserDAL.deleteById(existingMembership.id, tx);
      return doc;
    });
    return { membership: membershipDoc };
  };

  const listMemberships = async (dto: TListMembershipUserDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onListMembershipUserGuard(dto);
    const memberships = await membershipUserDAL.findUsers({
      scopeData,
      filter: {
        limit: dto.data.limit,
        offset: dto.data.offset,
        username: dto.data.username,
        role: dto.data?.roles?.length
          ? {
              [SearchResourceOperators.$in]: dto.data.roles
            }
          : undefined
      }
    });
    return memberships;
  };

  const getMembershipByUserId = async (dto: TGetMembershipUserByUserIdDTO) => {
    const { scopeData, selector } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onGetMembershipUserByUserIdGuard(dto);
    const membership = await membershipUserDAL.getUserById({
      scopeData,
      userId: selector.userId
    });
    if (!membership) throw new NotFoundError({ message: `User membership not found` });

    return membership;
  };

  // Should only be used for sub organization as of now
  const listAvailableUsers = async (dto: TListMembershipUserDTO) => {
    const { scopeData } = dto;
    const factory = scopeFactory[scopeData.scope];

    await factory.onListMembershipUserGuard(dto);

    const organizationDetails = await orgDAL.findById(dto.scopeData.orgId);
    if (!organizationDetails.rootOrgId) return { users: [] };

    const users = await membershipUserDAL.listAvailableUsers(organizationDetails.id, organizationDetails.rootOrgId);
    return { users };
  };

  return {
    createMembership,
    updateMembership,
    deleteMembership,
    listMemberships,
    getMembershipByUserId,
    listAvailableUsers
  };
};
