import { Knex } from "knex";

import {
  AccessScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  ProjectMembershipRole,
  TemporaryPermissionMode,
  TMembershipRolesInsert
} from "@app/db/schemas";
import { TEmailDomainDALFactory } from "@app/ee/services/email-domain/email-domain-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TSamlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { ms } from "@app/lib/ms";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { SearchResourceOperators } from "@app/lib/search-resource/search";
import { isDisposableEmail, sanitizeEmail, validateEmail } from "@app/lib/validator";
import { PamIdentities, SecretIdentities } from "@app/services/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TApprovalPolicyDALFactory } from "../approval-policy/approval-policy-dal";
import { AuthMethod } from "../auth/auth-type";
import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TApplicationMembershipCleanupServiceFactory } from "../membership/application-membership-cleanup-service";
import { assertSecretsTemporaryAccessAllowed } from "../membership/membership-fns";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TOrgDALFactory } from "../org/org-dal";
import { deleteOrgMembershipsFn } from "../org/org-fns";
import { isCustomOrgRole } from "../org/org-role-fns";
import { ApplicationMemberKind } from "../pki-application/pki-application-types";
import { TProjectAccessRequestDALFactory } from "../project/project-access-request-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TRoleDALFactory } from "../role/role-dal";
import { TSmtpService } from "../smtp/smtp-service";
import { getServerCfg } from "../super-admin/super-admin-service";
import { LoginMethod } from "../super-admin/super-admin-types";
import { TUserDALFactory } from "../user/user-dal";
import { TUserAliasDALFactory } from "../user-alias/user-alias-dal";
import { TMembershipUserDALFactory } from "./membership-user-dal";
import { assertWillRetainOrgAdmin } from "./membership-user-fns";
import {
  TCreateMembershipUserDTO,
  TDeleteMembershipUserDTO,
  TGetMembershipUserByUserIdDTO,
  TListMembershipUserDTO,
  TUpdateMembershipUserDTO
} from "./membership-user-types";
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
    | "getProjectPermission"
    | "getProjectPermissionByRoles"
    | "getOrgPermission"
    | "getOrgPermissionByRoles"
    | "getResourcePermission"
  >;
  licenseService: TLicenseServiceFactory;
  projectKeyDAL: TProjectKeyDALFactory;
  userAliasDAL: TUserAliasDALFactory;
  smtpService: TSmtpService;
  tokenService: TAuthTokenServiceFactory;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  projectDAL: TProjectDALFactory;
  additionalPrivilegeDAL: TAdditionalPrivilegeDALFactory;
  projectAccessRequestDAL: TProjectAccessRequestDALFactory;
  applicationMembershipCleanupService: Pick<
    TApplicationMembershipCleanupServiceFactory,
    "cleanupActorApplicationMemberships"
  >;
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "deleteUserStepApproversInProjects">;
  emailDomainDAL: Pick<TEmailDomainDALFactory, "find">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne">;
  samlConfigDAL: Pick<TSamlConfigDALFactory, "findOne">;
  usageMeteringService: Pick<TUsageMeteringServiceFactory, "emit" | "emitForProject">;
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
  additionalPrivilegeDAL,
  projectAccessRequestDAL,
  applicationMembershipCleanupService,
  approvalPolicyDAL,
  emailDomainDAL,
  oidcConfigDAL,
  samlConfigDAL,
  usageMeteringService
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
      membershipUserDAL,
      emailDomainDAL,
      oidcConfigDAL,
      samlConfigDAL
    }),
    [AccessScope.Project]: newProjectMembershipUserFactory({
      orgDAL,
      permissionService,
      membershipUserDAL,
      projectDAL,
      smtpService,
      userDAL,
      projectAccessRequestDAL
    })
  };

  const $getUsers = async (usernames: string[]) => {
    const existingUsers = await userDAL.find({ $in: { username: usernames } });
    if (existingUsers.length !== usernames.length) {
      const newUserEmails = usernames
        .filter((inviteeEmail) => !existingUsers.find((el) => el.username === inviteeEmail))
        .map((el) => el.toLowerCase());

      const invalidEmails = newUserEmails.filter((el) => {
        try {
          validateEmail(el);
          return false;
        } catch (err) {
          return true;
        }
      });
      if (invalidEmails.length > 0) {
        throw new BadRequestError({ message: `Invalid emails: ${invalidEmails.join(", ")}` });
      }

      await userDAL.transaction(async (tx) => {
        for await (const inviteeEmail of newUserEmails) {
          let inviteeUser = await userDAL.findOne({ username: inviteeEmail }, tx);
          // if the user doesn't exist we create the user with the email
          if (!inviteeUser) {
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

    const orgDetails = await requestMemoize(requestMemoKeys.orgFindById(dto.permission.orgId), () =>
      orgDAL.findById(dto.permission.orgId)
    );

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
      // Expose resolved roles to onCreateMembershipUserGuard's boundary check
      data.roles = rolesToUse;
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

    await assertSecretsTemporaryAccessAllowed({
      licenseService,
      projectDAL,
      scope: scopeData.scope,
      projectId: scopeData.scope === AccessScope.Project ? scopeData.projectId : undefined,
      orgId: scopeData.orgId,
      roles: rolesToUse
    });

    const isEmailInvalid = await isDisposableEmail(data.usernames);
    if (isEmailInvalid) {
      throw new BadRequestError({
        message: "Disposable emails are not allowed"
      });
    }
    const scopeDatabaseFields = factory.getScopeDatabaseFields(dto.scopeData);
    const sanitizedEmails = dto.data.usernames.map((el) => sanitizeEmail(el));
    const users = await $getUsers(sanitizedEmails);
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

    // Adding a user to a project changes the secret-manager and PAM identity meters (a direct member).
    if (scopeData.scope === AccessScope.Project) {
      usageMeteringService.emitForProject(scopeData.projectId, SecretIdentities.key);
      usageMeteringService.emitForProject(scopeData.projectId, PamIdentities.key);
    }
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

    await assertSecretsTemporaryAccessAllowed({
      licenseService,
      projectDAL,
      scope: scopeData.scope,
      projectId: scopeData.scope === AccessScope.Project ? scopeData.projectId : undefined,
      orgId: scopeData.orgId,
      roles: data.roles
    });

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

    const newIsActive = typeof data.isActive === "undefined" ? existingMembership.isActive : data.isActive;
    const newRolesHavePermanentAdmin =
      newIsActive && data.roles.some((r) => r.role === OrgMembershipRole.Admin && !r.isTemporary);

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
      if (!newRolesHavePermanentAdmin && scopeData.scope === AccessScope.Organization) {
        await assertWillRetainOrgAdmin({
          scopeOrgId: scopeData.orgId,
          excludeMembershipIds: [existingMembership.id],
          dal: membershipUserDAL,
          tx
        });
      }

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

  const deleteMembership = async (dto: TDeleteMembershipUserDTO, externalTx?: Knex) => {
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

    const performDelete = async (tx: Knex) => {
      if (dto.scopeData.scope === AccessScope.Organization) {
        // Org-scope last-admin guard runs inside deleteOrgMembershipsFn's transaction so the
        // advisory lock and count are race-safe with the delete itself.
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
          additionalPrivilegeDAL,
          approvalPolicyDAL
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

        await applicationMembershipCleanupService.cleanupActorApplicationMemberships(
          {
            projectId: dto.scopeData.projectId,
            actorKind: ApplicationMemberKind.User,
            actorId: dto.selector.userId
          },
          tx
        );
      }

      await membershipRoleDAL.delete({ membershipId: existingMembership.id }, tx);
      const doc = await membershipUserDAL.deleteById(existingMembership.id, tx);
      return doc;
    };

    const membershipDoc = externalTx
      ? await performDelete(externalTx)
      : await membershipUserDAL.transaction(performDelete);

    // Removing a user from a project drops a direct member; removing them from the org cascades their
    // project + group memberships. Either way the secret-manager and PAM identity meters change.
    if (scopeData.scope === AccessScope.Project) {
      usageMeteringService.emitForProject(scopeData.projectId, SecretIdentities.key);
      usageMeteringService.emitForProject(scopeData.projectId, PamIdentities.key);
    } else {
      usageMeteringService.emit(scopeData.orgId, SecretIdentities.key);
      usageMeteringService.emit(scopeData.orgId, PamIdentities.key);
    }
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

    const organizationDetails = await requestMemoize(requestMemoKeys.orgFindById(dto.scopeData.orgId), () =>
      orgDAL.findById(dto.scopeData.orgId)
    );
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
