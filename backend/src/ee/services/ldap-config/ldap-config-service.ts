import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";

import {
  AccessScope,
  OrganizationActionScope,
  OrgMembershipStatus,
  TableName,
  TLdapConfigsUpdate,
  TUsers
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { throwOnPlanSeatLimitReached } from "@app/ee/services/license/license-fns";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { KmsDataKey } from "@app/services/kms/kms-types";
import { TMembershipRoleDALFactory } from "@app/services/membership/membership-role-dal";
import { TMembershipGroupDALFactory } from "@app/services/membership-group/membership-group-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { getDefaultOrgMembershipRole } from "@app/services/org/org-role-fns";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TProjectBotDALFactory } from "@app/services/project-bot/project-bot-dal";
import { TProjectKeyDALFactory } from "@app/services/project-key/project-key-dal";
import { SmtpTemplates, TSmtpService } from "@app/services/smtp/smtp-service";
import { getServerCfg } from "@app/services/super-admin/super-admin-service";
import { LoginMethod } from "@app/services/super-admin/super-admin-types";
import { TUserDALFactory } from "@app/services/user/user-dal";
import { normalizeUsername } from "@app/services/user/user-fns";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";
import { UserAliasType } from "@app/services/user-alias/user-alias-types";

import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TLdapConfigDALFactory } from "./ldap-config-dal";
import {
  TCreateLdapCfgDTO,
  TCreateLdapGroupMapDTO,
  TDeleteLdapGroupMapDTO,
  TGetLdapCfgDTO,
  TGetLdapGroupMapsDTO,
  TLdapLoginDTO,
  TTestLdapConnectionDTO,
  TUpdateLdapCfgDTO
} from "./ldap-config-types";
import { searchGroups, testLDAPConfig } from "./ldap-fns";
import { TLdapGroupMapDALFactory } from "./ldap-group-map-dal";

type TLdapConfigServiceFactoryDep = {
  ldapConfigDAL: Pick<TLdapConfigDALFactory, "create" | "update" | "findOne" | "transaction">;
  ldapGroupMapDAL: Pick<TLdapGroupMapDALFactory, "find" | "create" | "delete" | "findLdapGroupMapsByLdapConfigId">;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById" | "findOne" | "updateById"
  >;
  groupDAL: Pick<TGroupDALFactory, "find" | "findOne">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany" | "delete">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser" | "findById">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "find" | "transaction" | "insertMany" | "filterProjectsByUserMembership" | "delete"
  >;
  userDAL: Pick<
    TUserDALFactory,
    | "create"
    | "findOne"
    | "transaction"
    | "updateById"
    | "findUserEncKeyByUserIdsBatch"
    | "find"
    | "findUserEncKeyByUserId"
  >;
  userAliasDAL: Pick<TUserAliasDALFactory, "create" | "findOne">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateOrgSubscription">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
};

export type TLdapConfigServiceFactory = ReturnType<typeof ldapConfigServiceFactory>;

export const ldapConfigServiceFactory = ({
  ldapConfigDAL,
  ldapGroupMapDAL,
  orgDAL,
  groupDAL,
  membershipGroupDAL,
  membershipRoleDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  userGroupMembershipDAL,
  userDAL,
  userAliasDAL,
  permissionService,
  licenseService,
  tokenService,
  smtpService,
  kmsService
}: TLdapConfigServiceFactoryDep) => {
  const createLdapCfg = async ({
    actor,
    actorId,
    orgId,
    actorOrgId,
    actorAuthMethod,
    isActive,
    url,
    bindDN,
    bindPass,
    uniqueUserAttribute,
    searchBase,
    searchFilter,
    groupSearchBase,
    groupSearchFilter,
    caCert
  }: TCreateLdapCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message:
          "Failed to create LDAP configuration due to plan restriction. Upgrade plan to create LDAP configuration."
      });

    const org = await orgDAL.findOrgById(orgId);

    if (!org) {
      throw new NotFoundError({ message: `Could not find organization with ID "${orgId}"` });
    }

    if (org.googleSsoAuthEnforced && isActive) {
      throw new BadRequestError({
        message:
          "You cannot enable LDAP SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable LDAP SSO."
      });
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const isConnected = await testLDAPConfig({
      bindDN,
      bindPass,
      caCert,
      url
    });

    if (!isConnected) {
      throw new BadRequestError({
        message: "Failed to establish connection to LDAP directory. Please verify that your credentials are correct."
      });
    }

    const ldapConfig = await ldapConfigDAL.create({
      orgId,
      isActive,
      url,
      uniqueUserAttribute,
      searchBase,
      searchFilter,
      groupSearchBase,
      groupSearchFilter,
      encryptedLdapCaCertificate: encryptor({ plainText: Buffer.from(caCert) }).cipherTextBlob,
      encryptedLdapBindDN: encryptor({ plainText: Buffer.from(bindDN) }).cipherTextBlob,
      encryptedLdapBindPass: encryptor({ plainText: Buffer.from(bindPass) }).cipherTextBlob
    });

    return ldapConfig;
  };

  const getLdapCfg = async (filter: { orgId: string; isActive?: boolean; id?: string }, tx?: Knex) => {
    const ldapConfig = await ldapConfigDAL.findOne(filter, tx);
    if (!ldapConfig) {
      throw new NotFoundError({
        message: `Failed to find organization LDAP data in organization with ID '${filter.orgId}'`
      });
    }

    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: ldapConfig.orgId
    });

    let bindDN = "";
    if (ldapConfig.encryptedLdapBindDN) {
      bindDN = decryptor({ cipherTextBlob: ldapConfig.encryptedLdapBindDN }).toString();
    }

    let bindPass = "";
    if (ldapConfig.encryptedLdapBindPass) {
      bindPass = decryptor({ cipherTextBlob: ldapConfig.encryptedLdapBindPass }).toString();
    }

    let caCert = "";
    if (ldapConfig.encryptedLdapCaCertificate) {
      caCert = decryptor({ cipherTextBlob: ldapConfig.encryptedLdapCaCertificate }).toString();
    }

    return {
      id: ldapConfig.id,
      organization: ldapConfig.orgId,
      isActive: ldapConfig.isActive,
      url: ldapConfig.url,
      bindDN,
      bindPass,
      uniqueUserAttribute: ldapConfig.uniqueUserAttribute,
      searchBase: ldapConfig.searchBase,
      searchFilter: ldapConfig.searchFilter,
      groupSearchBase: ldapConfig.groupSearchBase,
      groupSearchFilter: ldapConfig.groupSearchFilter,
      caCert
    };
  };

  const updateLdapCfg = async ({
    actor,
    actorId,
    orgId,
    actorOrgId,
    isActive,
    actorAuthMethod,
    url,
    bindDN,
    bindPass,
    uniqueUserAttribute,
    searchBase,
    searchFilter,
    groupSearchBase,
    groupSearchFilter,
    caCert
  }: TUpdateLdapCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message:
          "Failed to update LDAP configuration due to plan restriction. Upgrade plan to update LDAP configuration."
      });

    const org = await orgDAL.findOrgById(orgId);

    if (!org) {
      throw new NotFoundError({ message: `Could not find organization with ID "${orgId}"` });
    }

    if (org.googleSsoAuthEnforced && isActive) {
      throw new BadRequestError({
        message:
          "You cannot enable LDAP SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable LDAP SSO."
      });
    }

    const updateQuery: TLdapConfigsUpdate = {
      isActive,
      url,
      searchBase,
      searchFilter,
      groupSearchBase,
      groupSearchFilter,
      uniqueUserAttribute
    };

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    if (bindDN !== undefined) {
      updateQuery.encryptedLdapBindDN = encryptor({ plainText: Buffer.from(bindDN) }).cipherTextBlob;
    }

    if (bindPass !== undefined) {
      updateQuery.encryptedLdapBindPass = encryptor({ plainText: Buffer.from(bindPass) }).cipherTextBlob;
    }

    if (caCert !== undefined) {
      updateQuery.encryptedLdapCaCertificate = encryptor({ plainText: Buffer.from(caCert) }).cipherTextBlob;
    }

    const config = await ldapConfigDAL.transaction(async (tx) => {
      const [updatedLdapCfg] = await ldapConfigDAL.update({ orgId }, updateQuery, tx);
      const decryptedLdapCfg = await getLdapCfg({ orgId }, tx);

      const isSoftDeletion = !decryptedLdapCfg.url && !decryptedLdapCfg.bindDN && !decryptedLdapCfg.bindPass;
      if (!isSoftDeletion) {
        const isConnected = await testLDAPConfig(decryptedLdapCfg);
        if (!isConnected) {
          throw new BadRequestError({
            message:
              "Failed to establish connection to LDAP directory. Please verify that your credentials are correct."
          });
        }
      }

      return updatedLdapCfg;
    });

    return config;
  };

  const getLdapCfgWithPermissionCheck = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TGetLdapCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Ldap);
    return getLdapCfg({
      orgId
    });
  };

  const bootLdap = async (organizationSlug: string) => {
    const organization = await orgDAL.findOne({ slug: organizationSlug });
    if (!organization) throw new NotFoundError({ message: `Organization with slug '${organizationSlug}' not found` });

    const ldapConfig = await getLdapCfg({
      orgId: organization.id,
      isActive: true
    });

    const opts = {
      server: {
        url: ldapConfig.url,
        bindDN: ldapConfig.bindDN,
        bindCredentials: ldapConfig.bindPass,
        uniqueUserAttribute: ldapConfig.uniqueUserAttribute,
        searchBase: ldapConfig.searchBase,
        searchFilter: ldapConfig.searchFilter || "(uid={{username}})",
        // searchAttributes: ["uid", "uidNumber", "givenName", "sn", "mail"],
        ...(ldapConfig.caCert !== ""
          ? {
              tlsOptions: {
                ca: [ldapConfig.caCert]
              }
            }
          : {})
      },
      passReqToCallback: true
    };

    return { opts, ldapConfig };
  };

  const ldapLogin = async ({
    ldapConfigId,
    externalId,
    username,
    firstName,
    lastName,
    email,
    groups,
    orgId,
    relayState
  }: TLdapLoginDTO) => {
    const appCfg = getConfig();
    const serverCfg = await getServerCfg();

    if (serverCfg.enabledLoginMethods && !serverCfg.enabledLoginMethods.includes(LoginMethod.LDAP)) {
      throw new ForbiddenRequestError({
        message: "Login with LDAP is disabled by administrator."
      });
    }

    let userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType: UserAliasType.LDAP
    });

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

    if (userAlias) {
      await userDAL.transaction(async (tx) => {
        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.Membership}.actorUserId` as "actorUserId"]: userAlias.userId,
            [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
            [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
          },
          { tx }
        );
        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(organization.defaultMembershipRole);

          const membership = await orgDAL.createMembership(
            {
              actorUserId: userAlias.userId,
              scopeOrgId: orgId,
              scope: AccessScope.Organization,
              status: OrgMembershipStatus.Accepted,
              isActive: true
            },
            tx
          );
          await membershipRoleDAL.create(
            {
              membershipId: membership.id,
              role,
              customRoleId: roleId
            },
            tx
          );
        } else if (orgMembership.status === OrgMembershipStatus.Invited) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }
      });
    } else {
      userAlias = await userDAL.transaction(async (tx) => {
        let newUser: TUsers | undefined;
        newUser = await userDAL.findOne(
          {
            email: email.toLowerCase(),
            isEmailVerified: true
          },
          tx
        );

        if (!newUser) {
          const uniqueUsername = await normalizeUsername(username, userDAL);
          newUser = await userDAL.create(
            {
              username: serverCfg.trustLdapEmails ? email.toLowerCase() : uniqueUsername,
              email: email.toLowerCase(),
              isEmailVerified: serverCfg.trustLdapEmails,
              firstName,
              lastName,
              authMethods: [],
              isGhost: false
            },
            tx
          );
        }

        const newUserAlias = await userAliasDAL.create(
          {
            userId: newUser.id,
            username,
            aliasType: UserAliasType.LDAP,
            externalId,
            emails: [email],
            orgId,
            isEmailVerified: serverCfg.trustLdapEmails
          },
          tx
        );

        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.Membership}.actorUserId` as "actorUserId"]: newUserAlias.userId,
            [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
            [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization
          },
          { tx }
        );

        if (!orgMembership) {
          await throwOnPlanSeatLimitReached(licenseService, orgId, UserAliasType.LDAP);

          const { role, roleId } = await getDefaultOrgMembershipRole(organization.defaultMembershipRole);
          const membership = await orgDAL.createMembership(
            {
              actorUserId: newUser.id,
              scopeOrgId: orgId,
              scope: AccessScope.Organization,
              status: newUser.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited, // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
              isActive: true,
              inviteEmail: email.toLowerCase()
            },
            tx
          );
          await membershipRoleDAL.create(
            {
              membershipId: membership.id,
              role,
              customRoleId: roleId
            },
            tx
          );
          // Only update the membership to Accepted if the user account is already completed.
        } else if (orgMembership.status === OrgMembershipStatus.Invited && newUser.isAccepted) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }

        return newUserAlias;
      });
    }
    await licenseService.updateOrgSubscription(organization.id);

    const user = await userDAL.transaction(async (tx) => {
      const newUser = await userDAL.findOne({ id: userAlias.userId }, tx);
      if (groups) {
        const ldapGroupIdsToBePartOf = (
          await ldapGroupMapDAL.find({
            ldapConfigId,
            $in: {
              ldapGroupCN: groups.map((group) => group.cn)
            }
          })
        ).map((groupMap) => groupMap.groupId);

        const groupsToBePartOf = await groupDAL.find({
          orgId,
          $in: {
            id: ldapGroupIdsToBePartOf
          }
        });
        const toBePartOfGroupIdsSet = new Set(groupsToBePartOf.map((groupToBePartOf) => groupToBePartOf.id));

        const allLdapGroupMaps = await ldapGroupMapDAL.find({
          ldapConfigId
        });

        const ldapGroupIdsCurrentlyPartOf = (
          await userGroupMembershipDAL.find({
            userId: newUser.id,
            $in: {
              groupId: allLdapGroupMaps.map((groupMap) => groupMap.groupId)
            }
          })
        ).map((userGroupMembership) => userGroupMembership.groupId);

        const userGroupMembershipGroupIdsSet = new Set(ldapGroupIdsCurrentlyPartOf);

        for await (const group of groupsToBePartOf) {
          if (!userGroupMembershipGroupIdsSet.has(group.id)) {
            // add user to group that they should be part of
            await addUsersToGroupByUserIds({
              group,
              userIds: [newUser.id],
              userDAL,
              userGroupMembershipDAL,
              orgDAL,
              projectKeyDAL,
              projectDAL,
              projectBotDAL,
              membershipGroupDAL,
              tx
            });
          }
        }

        const groupsCurrentlyPartOf = await groupDAL.find({
          orgId,
          $in: {
            id: ldapGroupIdsCurrentlyPartOf
          }
        });

        for await (const group of groupsCurrentlyPartOf) {
          if (!toBePartOfGroupIdsSet.has(group.id)) {
            // remove user from group that they should no longer be part of
            await removeUsersFromGroupByUserIds({
              group,
              userIds: [newUser.id],
              userDAL,
              userGroupMembershipDAL,
              membershipGroupDAL,
              projectKeyDAL,
              tx
            });
          }
        }
      }

      return newUser;
    });

    const isUserCompleted = Boolean(user.isAccepted) && userAlias.isEmailVerified;
    const providerAuthToken = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        username: user.username,
        hasExchangedPrivateKey: true,
        ...(user.email && { email: user.email, isEmailVerified: userAlias.isEmailVerified }),
        firstName,
        lastName,
        organizationName: organization.name,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        authMethod: AuthMethod.LDAP,
        authType: UserAliasType.LDAP,
        aliasId: userAlias.id,
        isUserCompleted,
        ...(relayState
          ? {
              callbackPort: (JSON.parse(relayState) as { callbackPort: string }).callbackPort
            }
          : {})
      },
      appCfg.AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_PROVIDER_AUTH_LIFETIME
      }
    );

    if (user.email && !userAlias.isEmailVerified) {
      const token = await tokenService.createTokenForUser({
        type: TokenType.TOKEN_EMAIL_VERIFICATION,
        userId: user.id,
        aliasId: userAlias.id
      });

      await smtpService.sendMail({
        template: SmtpTemplates.EmailVerification,
        subjectLine: "Infisical confirmation code",
        recipients: [user.email],
        substitutions: {
          code: token
        }
      });
    }

    return { isUserCompleted, providerAuthToken };
  };

  const getLdapGroupMaps = async ({
    ldapConfigId,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TGetLdapGroupMapsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Ldap);

    const ldapConfig = await ldapConfigDAL.findOne({
      id: ldapConfigId,
      orgId
    });

    if (!ldapConfig) {
      throw new NotFoundError({
        message: `Failed to find organization LDAP data with ID '${ldapConfigId}' in organization with ID ${orgId}`
      });
    }

    const groupMaps = await ldapGroupMapDAL.findLdapGroupMapsByLdapConfigId(ldapConfigId);

    return groupMaps;
  };

  const createLdapGroupMap = async ({
    ldapConfigId,
    ldapGroupCN,
    groupSlug,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TCreateLdapGroupMapDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message: "Failed to create LDAP group map due to plan restriction. Upgrade plan to create LDAP group map."
      });

    const ldapConfig = await getLdapCfg({
      orgId,
      id: ldapConfigId
    });

    if (!ldapConfig.groupSearchBase) {
      throw new BadRequestError({
        message: "Configure a group search base in your LDAP configuration in order to proceed."
      });
    }

    const groupSearchFilter = `(cn=${ldapGroupCN})`;
    const groups = await searchGroups(ldapConfig, groupSearchFilter, ldapConfig.groupSearchBase);

    if (!groups.some((g) => g.cn === ldapGroupCN)) {
      throw new NotFoundError({
        message: "Failed to find LDAP Group CN"
      });
    }

    const group = await groupDAL.findOne({ slug: groupSlug, orgId });
    if (!group) {
      throw new NotFoundError({
        message: `Failed to find group with slug '${groupSlug}' in organization with ID '${orgId}'`
      });
    }

    const groupMap = await ldapGroupMapDAL.create({
      ldapConfigId,
      ldapGroupCN,
      groupId: group.id
    });

    return groupMap;
  };

  const deleteLdapGroupMap = async ({
    ldapConfigId,
    ldapGroupMapId,
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteLdapGroupMapDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message: "Failed to delete LDAP group map due to plan restriction. Upgrade plan to delete LDAP group map."
      });

    const ldapConfig = await ldapConfigDAL.findOne({
      id: ldapConfigId,
      orgId
    });

    if (!ldapConfig) {
      throw new NotFoundError({
        message: `Failed to find organization LDAP data with ID '${ldapConfigId}' in organization with ID ${orgId}`
      });
    }

    const [deletedGroupMap] = await ldapGroupMapDAL.delete({
      ldapConfigId: ldapConfig.id,
      id: ldapGroupMapId
    });

    return deletedGroupMap;
  };

  const testLDAPConnection = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId,
    bindDN,
    bindPass,
    caCert,
    url
  }: TTestLdapConnectionDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId: actorOrgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message: "Failed to test LDAP connection due to plan restriction. Upgrade plan to test the LDAP connection."
      });

    return testLDAPConfig({
      bindDN,
      bindPass,
      caCert,
      url
    });
  };

  return {
    createLdapCfg,
    updateLdapCfg,
    getLdapCfgWithPermissionCheck,
    getLdapCfg,
    // getLdapPassportOpts,
    ldapLogin,
    bootLdap,
    getLdapGroupMaps,
    createLdapGroupMap,
    deleteLdapGroupMap,
    testLDAPConnection
  };
};
