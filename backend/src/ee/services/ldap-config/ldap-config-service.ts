import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";

import { OrgMembershipStatus, SecretKeyEncoding, TableName, TLdapConfigsUpdate, TUsers } from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "@app/ee/services/group/group-fns";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { getConfig } from "@app/lib/config/env";
import {
  decryptSymmetric,
  encryptSymmetric,
  generateAsymmetricKeyPair,
  generateSymmetricKey,
  infisicalSymmetricDecrypt,
  infisicalSymmetricEncypt
} from "@app/lib/crypto/encryption";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { AuthMethod, AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TGroupProjectDALFactory } from "@app/services/group-project/group-project-dal";
import { TOrgBotDALFactory } from "@app/services/org/org-bot-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { getDefaultOrgMembershipRoleDto } from "@app/services/org/org-role-fns";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
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
import { TPermissionServiceFactory } from "../permission/permission-service";
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
  ldapConfigDAL: Pick<TLdapConfigDALFactory, "create" | "update" | "findOne">;
  ldapGroupMapDAL: Pick<TLdapGroupMapDALFactory, "find" | "create" | "delete" | "findLdapGroupMapsByLdapConfigId">;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "create">;
  orgDAL: Pick<
    TOrgDALFactory,
    "createMembership" | "updateMembershipById" | "findMembership" | "findOrgById" | "findOne" | "updateById"
  >;
  orgBotDAL: Pick<TOrgBotDALFactory, "findOne" | "create" | "transaction">;
  groupDAL: Pick<TGroupDALFactory, "find" | "findOne">;
  groupProjectDAL: Pick<TGroupProjectDALFactory, "find">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "findLatestProjectKey" | "insertMany" | "delete">;
  projectDAL: Pick<TProjectDALFactory, "findProjectGhostUser">;
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
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
};

export type TLdapConfigServiceFactory = ReturnType<typeof ldapConfigServiceFactory>;

export const ldapConfigServiceFactory = ({
  ldapConfigDAL,
  ldapGroupMapDAL,
  orgDAL,
  orgMembershipDAL,
  orgBotDAL,
  groupDAL,
  groupProjectDAL,
  projectKeyDAL,
  projectDAL,
  projectBotDAL,
  userGroupMembershipDAL,
  userDAL,
  userAliasDAL,
  permissionService,
  licenseService,
  tokenService,
  smtpService
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message:
          "Failed to create LDAP configuration due to plan restriction. Upgrade plan to create LDAP configuration."
      });

    const orgBot = await orgBotDAL.transaction(async (tx) => {
      const doc = await orgBotDAL.findOne({ orgId }, tx);
      if (doc) return doc;

      const { privateKey, publicKey } = generateAsymmetricKeyPair();
      const key = generateSymmetricKey();
      const {
        ciphertext: encryptedPrivateKey,
        iv: privateKeyIV,
        tag: privateKeyTag,
        encoding: privateKeyKeyEncoding,
        algorithm: privateKeyAlgorithm
      } = infisicalSymmetricEncypt(privateKey);
      const {
        ciphertext: encryptedSymmetricKey,
        iv: symmetricKeyIV,
        tag: symmetricKeyTag,
        encoding: symmetricKeyKeyEncoding,
        algorithm: symmetricKeyAlgorithm
      } = infisicalSymmetricEncypt(key);

      return orgBotDAL.create(
        {
          name: "Infisical org bot",
          publicKey,
          privateKeyIV,
          encryptedPrivateKey,
          symmetricKeyIV,
          symmetricKeyTag,
          encryptedSymmetricKey,
          symmetricKeyAlgorithm,
          orgId,
          privateKeyTag,
          privateKeyAlgorithm,
          privateKeyKeyEncoding,
          symmetricKeyKeyEncoding
        },
        tx
      );
    });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const { ciphertext: encryptedBindDN, iv: bindDNIV, tag: bindDNTag } = encryptSymmetric(bindDN, key);
    const { ciphertext: encryptedBindPass, iv: bindPassIV, tag: bindPassTag } = encryptSymmetric(bindPass, key);
    const { ciphertext: encryptedCACert, iv: caCertIV, tag: caCertTag } = encryptSymmetric(caCert, key);

    const ldapConfig = await ldapConfigDAL.create({
      orgId,
      isActive,
      url,
      encryptedBindDN,
      bindDNIV,
      bindDNTag,
      encryptedBindPass,
      bindPassIV,
      bindPassTag,
      uniqueUserAttribute,
      searchBase,
      searchFilter,
      groupSearchBase,
      groupSearchFilter,
      encryptedCACert,
      caCertIV,
      caCertTag
    });

    return ldapConfig;
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message:
          "Failed to update LDAP configuration due to plan restriction. Upgrade plan to update LDAP configuration."
      });

    const updateQuery: TLdapConfigsUpdate = {
      isActive,
      url,
      searchBase,
      searchFilter,
      groupSearchBase,
      groupSearchFilter,
      uniqueUserAttribute
    };

    const orgBot = await orgBotDAL.findOne({ orgId });
    if (!orgBot) throw new NotFoundError({ message: "Organization bot not found", name: "OrgBotNotFound" });
    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    if (bindDN !== undefined) {
      const { ciphertext: encryptedBindDN, iv: bindDNIV, tag: bindDNTag } = encryptSymmetric(bindDN, key);
      updateQuery.encryptedBindDN = encryptedBindDN;
      updateQuery.bindDNIV = bindDNIV;
      updateQuery.bindDNTag = bindDNTag;
    }

    if (bindPass !== undefined) {
      const { ciphertext: encryptedBindPass, iv: bindPassIV, tag: bindPassTag } = encryptSymmetric(bindPass, key);
      updateQuery.encryptedBindPass = encryptedBindPass;
      updateQuery.bindPassIV = bindPassIV;
      updateQuery.bindPassTag = bindPassTag;
    }

    if (caCert !== undefined) {
      const { ciphertext: encryptedCACert, iv: caCertIV, tag: caCertTag } = encryptSymmetric(caCert, key);
      updateQuery.encryptedCACert = encryptedCACert;
      updateQuery.caCertIV = caCertIV;
      updateQuery.caCertTag = caCertTag;
    }

    const [ldapConfig] = await ldapConfigDAL.update({ orgId }, updateQuery);

    return ldapConfig;
  };

  const getLdapCfg = async (filter: { orgId: string; isActive?: boolean; id?: string }) => {
    const ldapConfig = await ldapConfigDAL.findOne(filter);
    if (!ldapConfig) throw new NotFoundError({ message: "Failed to find organization LDAP data" });

    const orgBot = await orgBotDAL.findOne({ orgId: ldapConfig.orgId });
    if (!orgBot) throw new NotFoundError({ message: "Organization bot not found", name: "OrgBotNotFound" });

    const key = infisicalSymmetricDecrypt({
      ciphertext: orgBot.encryptedSymmetricKey,
      iv: orgBot.symmetricKeyIV,
      tag: orgBot.symmetricKeyTag,
      keyEncoding: orgBot.symmetricKeyKeyEncoding as SecretKeyEncoding
    });

    const {
      encryptedBindDN,
      bindDNIV,
      bindDNTag,
      encryptedBindPass,
      bindPassIV,
      bindPassTag,
      encryptedCACert,
      caCertIV,
      caCertTag
    } = ldapConfig;

    let bindDN = "";
    if (encryptedBindDN && bindDNIV && bindDNTag) {
      bindDN = decryptSymmetric({
        ciphertext: encryptedBindDN,
        key,
        tag: bindDNTag,
        iv: bindDNIV
      });
    }

    let bindPass = "";
    if (encryptedBindPass && bindPassIV && bindPassTag) {
      bindPass = decryptSymmetric({
        ciphertext: encryptedBindPass,
        key,
        tag: bindPassTag,
        iv: bindPassIV
      });
    }

    let caCert = "";
    if (encryptedCACert && caCertIV && caCertTag) {
      caCert = decryptSymmetric({
        ciphertext: encryptedCACert,
        key,
        tag: caCertTag,
        iv: caCertIV
      });
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

  const getLdapCfgWithPermissionCheck = async ({
    actor,
    actorId,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: TGetLdapCfgDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Ldap);
    return getLdapCfg({
      orgId
    });
  };

  const bootLdap = async (organizationSlug: string) => {
    const organization = await orgDAL.findOne({ slug: organizationSlug });
    if (!organization) throw new NotFoundError({ message: "Organization not found" });

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
    if (!organization) throw new NotFoundError({ message: "Organization not found" });

    if (userAlias) {
      await userDAL.transaction(async (tx) => {
        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.userId` as "userId"]: userAlias.userId,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );
        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRoleDto(organization.defaultMembershipRole);

          await orgDAL.createMembership(
            {
              userId: userAlias.userId,
              orgId,
              role,
              roleId,
              status: OrgMembershipStatus.Accepted,
              isActive: true
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
      const plan = await licenseService.getPlan(orgId);
      if (plan?.memberLimit && plan.membersUsed >= plan.memberLimit) {
        // limit imposed on number of members allowed / number of members used exceeds the number of members allowed
        throw new BadRequestError({
          message: "Failed to create new member via LDAP due to member limit reached. Upgrade plan to add more members."
        });
      }

      if (plan?.identityLimit && plan.identitiesUsed >= plan.identityLimit) {
        // limit imposed on number of identities allowed / number of identities used exceeds the number of identities allowed
        throw new BadRequestError({
          message: "Failed to create new member via LDAP due to member limit reached. Upgrade plan to add more members."
        });
      }

      userAlias = await userDAL.transaction(async (tx) => {
        let newUser: TUsers | undefined;
        if (serverCfg.trustLdapEmails) {
          newUser = await userDAL.findOne(
            {
              email,
              isEmailVerified: true
            },
            tx
          );
        }

        if (!newUser) {
          const uniqueUsername = await normalizeUsername(username, userDAL);
          newUser = await userDAL.create(
            {
              username: serverCfg.trustLdapEmails ? email : uniqueUsername,
              email,
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
            orgId
          },
          tx
        );

        const [orgMembership] = await orgDAL.findMembership(
          {
            [`${TableName.OrgMembership}.userId` as "userId"]: newUser.id,
            [`${TableName.OrgMembership}.orgId` as "id"]: orgId
          },
          { tx }
        );

        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRoleDto(organization.defaultMembershipRole);

          await orgMembershipDAL.create(
            {
              userId: newUser.id,
              inviteEmail: email,
              orgId,
              role,
              roleId,
              status: newUser.isAccepted ? OrgMembershipStatus.Accepted : OrgMembershipStatus.Invited, // if user is fully completed, then set status to accepted, otherwise set it to invited so we can update it later
              isActive: true
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
    await licenseService.updateSubscriptionOrgMemberCount(organization.id);

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
              groupProjectDAL,
              projectKeyDAL,
              projectDAL,
              projectBotDAL,
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
              groupProjectDAL,
              projectKeyDAL,
              tx
            });
          }
        }
      }

      return newUser;
    });

    const isUserCompleted = Boolean(user.isAccepted);
    const userEnc = await userDAL.findUserEncKeyByUserId(user.id);

    const providerAuthToken = jwt.sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        username: user.username,
        hasExchangedPrivateKey: Boolean(userEnc?.serverEncryptedPrivateKey),
        ...(user.email && { email: user.email, isEmailVerified: user.isEmailVerified }),
        firstName,
        lastName,
        organizationName: organization.name,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        authMethod: AuthMethod.LDAP,
        authType: UserAliasType.LDAP,
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

    if (user.email && !user.isEmailVerified) {
      const token = await tokenService.createTokenForUser({
        type: TokenType.TOKEN_EMAIL_VERIFICATION,
        userId: user.id
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Ldap);

    const ldapConfig = await ldapConfigDAL.findOne({
      id: ldapConfigId,
      orgId
    });

    if (!ldapConfig) throw new NotFoundError({ message: "Failed to find organization LDAP data" });

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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
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
    if (!group) throw new NotFoundError({ message: "Failed to find group" });

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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
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

    if (!ldapConfig) throw new NotFoundError({ message: "Failed to find organization LDAP data" });

    const [deletedGroupMap] = await ldapGroupMapDAL.delete({
      ldapConfigId: ldapConfig.id,
      id: ldapGroupMapId
    });

    return deletedGroupMap;
  };

  const testLDAPConnection = async ({ actor, actorId, orgId, actorAuthMethod, actorOrgId }: TTestLdapConnectionDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Ldap);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.ldap)
      throw new BadRequestError({
        message: "Failed to test LDAP connection due to plan restriction. Upgrade plan to test the LDAP connection."
      });

    const ldapConfig = await getLdapCfg({
      orgId
    });

    return testLDAPConfig(ldapConfig);
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
