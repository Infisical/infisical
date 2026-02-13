/* eslint-disable no-await-in-loop */
import { ForbiddenError } from "@casl/ability";
import { Knex } from "knex";
import RE2 from "re2";

import {
  AccessScope,
  OrganizationActionScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  TGroups,
  TSamlConfigs,
  TSamlConfigsUpdate,
  TUsers
} from "@app/db/schemas";
import { throwOnPlanSeatLimitReached } from "@app/ee/services/license/license-fns";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { ActorType, AuthTokenType } from "@app/services/auth/auth-type";
import { TAuthTokenServiceFactory } from "@app/services/auth-token/auth-token-service";
import { TokenType } from "@app/services/auth-token/auth-token-types";
import { TIdentityMetadataDALFactory } from "@app/services/identity/identity-metadata-dal";
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

import { TGroupDALFactory } from "../group/group-dal";
import { addUsersToGroupByUserIds, removeUsersFromGroupByUserIds } from "../group/group-fns";
import { TUserGroupMembershipDALFactory } from "../group/user-group-membership-dal";
import { TLicenseServiceFactory } from "../license/license-service";
import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TSamlConfigDALFactory } from "./saml-config-dal";
import { SamlProviders, TSamlConfigServiceFactory } from "./saml-config-types";

// SAML providers that support group sync
const GROUP_SYNC_SUPPORTED_PROVIDERS = [SamlProviders.GOOGLE_SAML] as SamlProviders[];

type TSamlConfigServiceFactoryDep = {
  samlConfigDAL: Pick<TSamlConfigDALFactory, "create" | "findOne" | "update" | "findById">;
  userDAL: Pick<
    TUserDALFactory,
    | "create"
    | "findOne"
    | "find"
    | "transaction"
    | "updateById"
    | "findById"
    | "findUserEncKeyByUserId"
    | "findUserEncKeyByUserIdsBatch"
  >;
  userAliasDAL: Pick<TUserAliasDALFactory, "create" | "findOne">;
  orgDAL: Pick<
    TOrgDALFactory,
    | "createMembership"
    | "updateMembershipById"
    | "findMembership"
    | "findEffectiveOrgMembership"
    | "findOrgById"
    | "findOne"
    | "updateById"
  >;
  identityMetadataDAL: Pick<TIdentityMetadataDALFactory, "delete" | "insertMany" | "transaction">;
  membershipRoleDAL: Pick<TMembershipRoleDALFactory, "create">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan" | "updateSubscriptionOrgMemberCount">;
  tokenService: Pick<TAuthTokenServiceFactory, "createTokenForUser">;
  smtpService: Pick<TSmtpService, "sendMail">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  userGroupMembershipDAL: Pick<
    TUserGroupMembershipDALFactory,
    "find" | "delete" | "transaction" | "insertMany" | "filterProjectsByUserMembership"
  >;
  groupDAL: Pick<TGroupDALFactory, "create" | "findOne" | "find" | "transaction">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findProjectGhostUser">;
  projectBotDAL: Pick<TProjectBotDALFactory, "findOne">;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete" | "findLatestProjectKey" | "insertMany">;
  membershipGroupDAL: Pick<TMembershipGroupDALFactory, "find" | "create">;
};

export const samlConfigServiceFactory = ({
  samlConfigDAL,
  orgDAL,
  userDAL,
  userAliasDAL,
  groupDAL,
  userGroupMembershipDAL,
  projectDAL,
  projectBotDAL,
  projectKeyDAL,
  permissionService,
  licenseService,
  tokenService,
  smtpService,
  identityMetadataDAL,
  kmsService,
  membershipRoleDAL,
  membershipGroupDAL
}: TSamlConfigServiceFactoryDep): TSamlConfigServiceFactory => {
  const parseSamlGroups = (groupsValue: string): string[] => {
    let samlGroups: string[] = [];

    try {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const parsed = JSON.parse(groupsValue);
      if (Array.isArray(parsed)) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        samlGroups = parsed;
      } else if (typeof parsed === "string") {
        samlGroups = parsed
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean);
      }
    } catch {
      samlGroups = groupsValue
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean);
    }

    return samlGroups;
  };

  const syncUserGroupMemberships = async ({
    userId,
    orgId,
    samlGroups,
    tx
  }: {
    userId: string;
    orgId: string;
    samlGroups: string[];
    tx?: Knex;
  }) => {
    const processGroupSync = async (transaction: Knex) => {
      const currentGroupMemberships = await userGroupMembershipDAL.find(
        {
          userId
        },
        { tx: transaction }
      );

      const orgGroups = await groupDAL.find({ orgId }, { tx: transaction });
      const orgGroupsMap = new Map(orgGroups.map((g: TGroups) => [g.name, g]));
      const orgGroupIds = new Set(orgGroups.map((g) => g.id));

      const currentOrgGroupMemberships = currentGroupMemberships.filter((m) => orgGroupIds.has(m.groupId));
      const currentGroupNames = new Set(
        currentOrgGroupMemberships
          .map((m) => {
            const group = orgGroups.find((g) => g.id === m.groupId);
            return group?.name;
          })
          .filter(Boolean)
      );

      const targetGroupNames = new Set(samlGroups);
      const groupsToAdd = samlGroups.filter((groupName) => !currentGroupNames.has(groupName));
      const groupsToRemove = Array.from(currentGroupNames).filter(
        (groupName) => groupName && !targetGroupNames.has(groupName)
      );
      // eslint-disable-next-line no-await-in-loop
      for (const groupName of groupsToAdd) {
        if (!orgGroupsMap.has(groupName)) {
          const newGroup = await groupDAL.create(
            {
              name: groupName,
              slug: `${groupName.toLowerCase().replace(new RE2("[^a-z0-9]", "g"), "-")}-${Date.now()}`,
              orgId
            },
            transaction
          );
          orgGroupsMap.set(groupName, newGroup);
          const orgMembership = await membershipGroupDAL.create(
            {
              actorGroupId: newGroup.id,
              scope: AccessScope.Organization,
              scopeOrgId: orgId
            },
            transaction
          );
          await membershipRoleDAL.create(
            {
              membershipId: orgMembership.id,
              role: OrgMembershipRole.NoAccess,
              customRoleId: null
            },
            transaction
          );
        }
      }

      // eslint-disable-next-line no-await-in-loop
      for (const groupName of groupsToAdd) {
        const group = orgGroupsMap.get(groupName);
        if (group) {
          try {
            await addUsersToGroupByUserIds({
              userIds: [userId],
              group,
              userDAL,
              userGroupMembershipDAL,
              orgDAL,
              projectKeyDAL,
              projectDAL,
              projectBotDAL,
              membershipGroupDAL,
              tx: transaction
            });
          } catch (error) {
            // Continue if user already in group
          }
        }
      }

      // eslint-disable-next-line no-await-in-loop
      for (const groupName of groupsToRemove) {
        if (groupName) {
          const group = orgGroupsMap.get(groupName);
          if (group) {
            try {
              await removeUsersFromGroupByUserIds({
                userIds: [userId],
                group,
                userDAL,
                userGroupMembershipDAL,
                membershipGroupDAL,
                projectKeyDAL,
                tx: transaction
              });
            } catch (error) {
              // Continue if user not in group
            }
          }
        }
      }
    };

    if (tx) {
      await processGroupSync(tx);
    } else {
      await userDAL.transaction(processGroupSync);
    }
  };

  const createSamlCfg: TSamlConfigServiceFactory["createSamlCfg"] = async ({
    idpCert,
    actor,
    actorAuthMethod,
    actorOrgId,
    orgId,
    issuer,
    actorId,
    isActive,
    entryPoint,
    authProvider,
    enableGroupSync
  }) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Sso);

    const plan = await licenseService.getPlan(orgId);
    if (!plan.samlSSO)
      throw new BadRequestError({
        message:
          "Failed to create SAML SSO configuration due to plan restriction. Upgrade plan to create SSO configuration."
      });

    const org = await orgDAL.findOrgById(orgId);

    if (!org) {
      throw new NotFoundError({ message: `Could not find organization with ID "${orgId}"` });
    }

    if (org.googleSsoAuthEnforced && isActive) {
      throw new BadRequestError({
        message:
          "You cannot enable SAML SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable SAML SSO."
      });
    }

    if (enableGroupSync && !GROUP_SYNC_SUPPORTED_PROVIDERS.includes(authProvider)) {
      throw new BadRequestError({
        message: "Group sync is not supported for this SAML provider."
      });
    }

    if (enableGroupSync && !plan.groups) {
      throw new BadRequestError({
        message: "Failed to enable SAML group sync due to plan restriction. Upgrade plan to enable group sync."
      });
    }

    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    const samlConfig = await samlConfigDAL.create({
      orgId,
      authProvider,
      isActive,
      encryptedSamlCertificate: encryptor({ plainText: Buffer.from(idpCert) }).cipherTextBlob,
      encryptedSamlEntryPoint: encryptor({ plainText: Buffer.from(entryPoint) }).cipherTextBlob,
      encryptedSamlIssuer: encryptor({ plainText: Buffer.from(issuer) }).cipherTextBlob,
      enableGroupSync: enableGroupSync || false
    });

    return samlConfig;
  };

  const updateSamlCfg: TSamlConfigServiceFactory["updateSamlCfg"] = async ({
    orgId,
    actor,
    actorOrgId,
    actorAuthMethod,
    idpCert,
    actorId,
    issuer,
    isActive,
    entryPoint,
    authProvider,
    enableGroupSync
  }) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.ParentOrganization,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);
    const plan = await licenseService.getPlan(orgId);
    if (!plan.samlSSO)
      throw new BadRequestError({
        message:
          "Failed to update SAML SSO configuration due to plan restriction. Upgrade plan to update SSO configuration."
      });

    const org = await orgDAL.findOrgById(orgId);

    if (!org) {
      throw new NotFoundError({ message: `Could not find organization with ID "${orgId}"` });
    }

    if (org.googleSsoAuthEnforced && isActive) {
      throw new BadRequestError({
        message:
          "Cannot enable SAML SSO while Google OAuth is enforced. Disable Google OAuth enforcement to enable SAML SSO."
      });
    }

    if (enableGroupSync && authProvider && !GROUP_SYNC_SUPPORTED_PROVIDERS.includes(authProvider)) {
      throw new BadRequestError({
        message: "Group sync is not supported for this SAML provider."
      });
    }

    if (enableGroupSync && !plan.groups) {
      throw new BadRequestError({
        message: "Failed to enable SAML group sync due to plan restriction. Upgrade plan to enable group sync."
      });
    }

    const updateQuery: TSamlConfigsUpdate = {
      authProvider,
      isActive,
      lastUsed: null
    };

    if (enableGroupSync !== undefined) {
      updateQuery.enableGroupSync = enableGroupSync;
    }
    const { encryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId
    });

    if (entryPoint !== undefined) {
      updateQuery.encryptedSamlEntryPoint = encryptor({ plainText: Buffer.from(entryPoint) }).cipherTextBlob;
    }

    if (issuer !== undefined) {
      updateQuery.encryptedSamlIssuer = encryptor({ plainText: Buffer.from(issuer) }).cipherTextBlob;
    }

    if (idpCert !== undefined) {
      updateQuery.encryptedSamlCertificate = encryptor({ plainText: Buffer.from(idpCert) }).cipherTextBlob;
    }

    const [ssoConfig] = await samlConfigDAL.update({ orgId }, updateQuery);
    await orgDAL.updateById(orgId, { authEnforced: false, scimEnabled: false });

    return ssoConfig;
  };

  const getSaml: TSamlConfigServiceFactory["getSaml"] = async (dto) => {
    let samlConfig: TSamlConfigs | undefined;
    if (dto.type === "org") {
      samlConfig = await samlConfigDAL.findOne({ orgId: dto.orgId });
      if (!samlConfig) {
        throw new NotFoundError({
          message: `SAML configuration for organization with ID '${dto.orgId}' not found`
        });
      }
    } else if (dto.type === "orgSlug") {
      const org = await orgDAL.findOne({ slug: dto.orgSlug, rootOrgId: null });
      if (!org) {
        throw new NotFoundError({
          message: `Organization with slug '${dto.orgSlug}' not found`
        });
      }
      samlConfig = await samlConfigDAL.findOne({ orgId: org.id });
    } else if (dto.type === "ssoId") {
      // TODO:
      // We made this change because saml config ids were not moved over during the migration
      // This will patch this issue.
      // Remove in the future
      const UUIDToMongoId: Record<string, string> = {
        "64c81ff7905fadcfead01e9a": "0978bcbe-8f94-4d95-8600-009787262613",
        "652d4777c74d008c85c8bed5": "42044bf5-119e-443e-a51b-0308ac7e45ea",
        "6527df39771217236f8721f6": "6311ec4b-d692-4422-b52a-337f719ae6b0",
        "650374a561d12cd3d835aeb8": "6453516c-930d-4ff0-ad3b-496ba6eb80ca",
        "655d67d10a0f4d307c8b1536": "73b9f1b1-f946-4f18-9a2d-310f157f7df5",
        "64f23239a5d4ed17f1e544c4": "9256337f-e3da-43d7-8266-39c9276e8426",
        "65348e49db355e6e4782571f": "b8a227c7-843e-410e-8982-b4976a599b69",
        "657a219fc8a80c2eff97eb38": "fcab1573-ae7f-4fcf-9645-646207acf035"
      };

      const id = UUIDToMongoId[dto.id] ?? dto.id;

      samlConfig = await samlConfigDAL.findById(id);
    }
    if (!samlConfig) throw new NotFoundError({ message: `Failed to find SSO data` });

    // when dto is type id means it's internally used
    if (dto.type === "org") {
      const { permission } = await permissionService.getOrgPermission({
        scope: OrganizationActionScope.ParentOrganization,
        actor: dto.actor,
        actorId: dto.actorId,
        orgId: samlConfig.orgId,
        actorAuthMethod: dto.actorAuthMethod,
        actorOrgId: dto.actorOrgId
      });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Sso);
    }
    const { decryptor } = await kmsService.createCipherPairWithDataKey({
      type: KmsDataKey.Organization,
      orgId: samlConfig.orgId
    });

    let entryPoint = "";
    if (samlConfig.encryptedSamlEntryPoint) {
      entryPoint = decryptor({ cipherTextBlob: samlConfig.encryptedSamlEntryPoint }).toString();
    }

    let issuer = "";
    if (samlConfig.encryptedSamlIssuer) {
      issuer = decryptor({ cipherTextBlob: samlConfig.encryptedSamlIssuer }).toString();
    }

    let cert = "";
    if (samlConfig.encryptedSamlCertificate) {
      cert = decryptor({ cipherTextBlob: samlConfig.encryptedSamlCertificate }).toString();
    }

    return {
      id: samlConfig.id,
      organization: samlConfig.orgId,
      orgId: samlConfig.orgId,
      authProvider: samlConfig.authProvider,
      isActive: samlConfig.isActive,
      entryPoint,
      issuer,
      cert,
      lastUsed: samlConfig.lastUsed,
      enableGroupSync: samlConfig.enableGroupSync
    };
  };

  const samlLogin: TSamlConfigServiceFactory["samlLogin"] = async ({
    externalId,
    email,
    firstName,
    lastName,
    authProvider,
    orgId,
    relayState,
    metadata
  }) => {
    const appCfg = getConfig();
    const serverCfg = await getServerCfg();

    if (serverCfg.enabledLoginMethods && !serverCfg.enabledLoginMethods.includes(LoginMethod.SAML)) {
      throw new ForbiddenRequestError({
        message: "Login with SAML is disabled by administrator."
      });
    }

    let userAlias = await userAliasDAL.findOne({
      externalId,
      orgId,
      aliasType: UserAliasType.SAML
    });

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

    const samlConfig = await samlConfigDAL.findOne({ orgId });
    const groupsMetadata = metadata?.find(({ key }) => key === "groups");

    const plan = await licenseService.getPlan(orgId);
    const shouldSyncGroups = !!samlConfig?.enableGroupSync && !!plan.groups;

    let user: TUsers;
    if (userAlias) {
      user = await userDAL.transaction(async (tx) => {
        const foundUser = await userDAL.findById(userAlias.userId, tx);
        const orgMembership = await orgDAL.findEffectiveOrgMembership({
          actorType: ActorType.USER,
          actorId: userAlias.userId,
          orgId,
          acceptAnyStatus: true,
          tx
        });

        if (!orgMembership) {
          const { role, roleId } = await getDefaultOrgMembershipRole(organization.defaultMembershipRole);

          const membership = await orgDAL.createMembership(
            {
              actorUserId: userAlias.userId,
              inviteEmail: email,
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
          // Only update the membership to Accepted if the user account is already completed.
        } else if (
          orgMembership.actorUserId === userAlias.userId &&
          orgMembership.status === OrgMembershipStatus.Invited &&
          foundUser.isAccepted
        ) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }

        if (metadata && foundUser.id) {
          await identityMetadataDAL.delete({ userId: foundUser.id, orgId }, tx);
          if (metadata.length) {
            await identityMetadataDAL.insertMany(
              metadata.map(({ key, value }) => ({
                userId: foundUser.id,
                orgId,
                key,
                value
              })),
              tx
            );
          }
        }

        if (shouldSyncGroups && metadata && foundUser.id) {
          const samlGroups = groupsMetadata?.value ? parseSamlGroups(groupsMetadata.value) : [];

          await syncUserGroupMemberships({
            userId: foundUser.id,
            orgId,
            samlGroups,
            tx
          });
        }

        return foundUser;
      });
    } else {
      user = await userDAL.transaction(async (tx) => {
        let newUser: TUsers | undefined;

        const usersWithSameEmail = await userDAL.find(
          {
            email: email.toLowerCase()
          },
          {
            tx
          }
        );

        const verifiedEmail = usersWithSameEmail.find((el) => el.isEmailVerified);
        const userWithSameUsername = usersWithSameEmail.find((el) => el.username === email.toLowerCase());
        if (verifiedEmail) {
          newUser = verifiedEmail;
        } else if (userWithSameUsername) {
          newUser = userWithSameUsername;
        }

        if (!newUser) {
          const uniqueUsername = await normalizeUsername(`${firstName ?? ""}-${lastName ?? ""}`, userDAL);
          newUser = await userDAL.create(
            {
              username: serverCfg.trustSamlEmails ? email.toLowerCase() : uniqueUsername,
              email,
              isEmailVerified: serverCfg.trustSamlEmails,
              firstName,
              lastName,
              authMethods: [],
              isGhost: false
            },
            tx
          );
        }

        userAlias = await userAliasDAL.create(
          {
            userId: newUser.id,
            aliasType: UserAliasType.SAML,
            externalId,
            emails: email ? [email.toLowerCase()] : [],
            orgId,
            isEmailVerified: serverCfg.trustSamlEmails
          },
          tx
        );

        const orgMembership = await orgDAL.findEffectiveOrgMembership({
          actorType: ActorType.USER,
          actorId: userAlias.userId,
          orgId,
          acceptAnyStatus: true,
          tx
        });

        if (!orgMembership) {
          await throwOnPlanSeatLimitReached(licenseService, orgId, UserAliasType.SAML);

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
        } else if (
          orgMembership.actorUserId === newUser.id &&
          orgMembership.status === OrgMembershipStatus.Invited &&
          newUser.isAccepted
        ) {
          await orgDAL.updateMembershipById(
            orgMembership.id,
            {
              status: OrgMembershipStatus.Accepted
            },
            tx
          );
        }

        if (metadata && newUser.id) {
          await identityMetadataDAL.delete({ userId: newUser.id, orgId }, tx);
          if (metadata.length) {
            await identityMetadataDAL.insertMany(
              metadata.map(({ key, value }) => ({
                userId: newUser?.id,
                orgId,
                key,
                value
              })),
              tx
            );
          }
        }

        if (shouldSyncGroups && metadata && newUser.id) {
          const samlGroups = groupsMetadata?.value ? parseSamlGroups(groupsMetadata.value) : [];

          await syncUserGroupMemberships({
            userId: newUser.id,
            orgId,
            samlGroups,
            tx
          });
        }

        return newUser;
      });
    }
    await licenseService.updateSubscriptionOrgMemberCount(organization.id);

    const isUserCompleted = Boolean(user.isAccepted && userAlias.isEmailVerified);
    const providerAuthToken = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.PROVIDER_TOKEN,
        userId: user.id,
        username: user.username,
        ...(user.email && { email: user.email, isEmailVerified: userAlias.isEmailVerified }),
        firstName,
        lastName,
        organizationName: organization.name,
        organizationId: organization.id,
        organizationSlug: organization.slug,
        authMethod: authProvider,
        hasExchangedPrivateKey: true,
        aliasId: userAlias.id,
        authType: UserAliasType.SAML,
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

    await samlConfigDAL.update({ orgId }, { lastUsed: new Date() });

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

    return { isUserCompleted, providerAuthToken, user, organization };
  };

  return {
    createSamlCfg,
    updateSamlCfg,
    getSaml,
    samlLogin
  };
};
