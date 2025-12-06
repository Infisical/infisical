import { ForbiddenError } from "@casl/ability";
import slugify from "@sindresorhus/slugify";
import { Knex } from "knex";

import {
  AccessScope,
  OrganizationActionScope,
  OrgMembershipRole,
  OrgMembershipStatus,
  TableName,
  TOidcConfigs,
  TSamlConfigs
} from "@app/db/schemas";
import { TGroupDALFactory } from "@app/ee/services/group/group-dal";
import { TUserGroupMembershipDALFactory } from "@app/ee/services/group/user-group-membership-dal";
import { TLdapConfigDALFactory } from "@app/ee/services/ldap-config/ldap-config-dal";
import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { TOidcConfigDALFactory } from "@app/ee/services/oidc/oidc-config-dal";
import {
  OrgPermissionActions,
  OrgPermissionGroupActions,
  OrgPermissionSecretShareAction,
  OrgPermissionSubjects
} from "@app/ee/services/permission/org-permission";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import { TSamlConfigDALFactory } from "@app/ee/services/saml-config/saml-config-dal";
import { getConfig } from "@app/lib/config/env";
import { crypto } from "@app/lib/crypto/cryptography";
import { generateUserSrpKeys } from "@app/lib/crypto/srp";
import { applyJitter } from "@app/lib/dates";
import { delay as delayMs } from "@app/lib/delay";
import { BadRequestError, ForbiddenRequestError, NotFoundError, UnauthorizedError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { alphaNumericNanoId } from "@app/lib/nanoid";
import { QueueName } from "@app/queue";
import { getDefaultOrgMembershipRoleForUpdateOrg } from "@app/services/org/org-role-fns";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";
import { TUserAliasDALFactory } from "@app/services/user-alias/user-alias-dal";

import { TAdditionalPrivilegeDALFactory } from "../additional-privilege/additional-privilege-dal";
import { TAuthLoginFactory } from "../auth/auth-login-service";
import { ActorAuthMethod, ActorType, AuthMethod, AuthModeJwtTokenPayload, AuthTokenType } from "../auth/auth-type";
import { TAuthTokenServiceFactory } from "../auth-token/auth-token-service";
import { TokenType } from "../auth-token/auth-token-types";
import { TIdentityMetadataDALFactory } from "../identity/identity-metadata-dal";
import { TMembershipRoleDALFactory } from "../membership/membership-role-dal";
import { TMembershipUserDALFactory } from "../membership-user/membership-user-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TProjectBotServiceFactory } from "../project-bot/project-bot-service";
import { TProjectKeyDALFactory } from "../project-key/project-key-dal";
import { TProjectMembershipDALFactory } from "../project-membership/project-membership-dal";
import { TReminderServiceFactory } from "../reminder/reminder-types";
import { TRoleDALFactory } from "../role/role-dal";
import { TSecretDALFactory } from "../secret/secret-dal";
import { fnDeleteProjectSecretReminders } from "../secret/secret-fns";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { SmtpTemplates, TSmtpService } from "../smtp/smtp-service";
import { TUserDALFactory } from "../user/user-dal";
import { TIncidentContactsDALFactory } from "./incident-contacts-dal";
import { TOrgDALFactory } from "./org-dal";
import { deleteOrgMembershipsFn } from "./org-fns";
import {
  TDeleteOrgMembershipDTO,
  TDeleteOrgMembershipsDTO,
  TFindAllWorkspacesDTO,
  TFindOrgMembersByEmailDTO,
  TGetOrgGroupsDTO,
  TGetOrgMembershipDTO,
  TListProjectMembershipsByOrgMembershipIdDTO,
  TResendOrgMemberInvitationDTO,
  TUpdateOrgDTO,
  TUpdateOrgMembershipDTO,
  TUpgradePrivilegeSystemDTO,
  TVerifyUserToOrgDTO
} from "./org-types";

type TOrgServiceFactoryDep = {
  userAliasDAL: Pick<TUserAliasDALFactory, "delete">;
  secretDAL: Pick<TSecretDALFactory, "find">;
  secretV2BridgeDAL: Pick<TSecretV2BridgeDALFactory, "find">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByProjectId">;
  orgDAL: TOrgDALFactory;
  roleDAL: TRoleDALFactory;
  userDAL: TUserDALFactory;
  groupDAL: TGroupDALFactory;
  projectDAL: TProjectDALFactory;
  identityMetadataDAL: Pick<TIdentityMetadataDALFactory, "delete" | "insertMany" | "transaction">;
  membershipUserDAL: TMembershipUserDALFactory;
  projectMembershipDAL: Pick<
    TProjectMembershipDALFactory,
    "findProjectMembershipsByUserId" | "findProjectMembershipsByUserIds"
  >;
  projectKeyDAL: Pick<TProjectKeyDALFactory, "find" | "delete" | "insertMany" | "findLatestProjectKey" | "create">;
  orgMembershipDAL: Pick<
    TOrgMembershipDALFactory,
    "findOrgMembershipById" | "findRecentInvitedMemberships" | "updateLastInvitedAtByIds"
  >;
  membershipRoleDAL: TMembershipRoleDALFactory;
  incidentContactDAL: TIncidentContactsDALFactory;
  samlConfigDAL: Pick<TSamlConfigDALFactory, "findOne">;
  oidcConfigDAL: Pick<TOidcConfigDALFactory, "findOne">;
  ldapConfigDAL: Pick<TLdapConfigDALFactory, "findOne">;
  smtpService: TSmtpService;
  tokenService: TAuthTokenServiceFactory;
  permissionService: TPermissionServiceFactory;
  licenseService: Pick<
    TLicenseServiceFactory,
    "getPlan" | "updateSubscriptionOrgMemberCount" | "generateOrgCustomerId" | "removeOrgCustomer"
  >;
  projectBotService: Pick<TProjectBotServiceFactory, "getBotKey">;
  loginService: Pick<TAuthLoginFactory, "generateUserTokens">;
  reminderService: Pick<TReminderServiceFactory, "deleteReminderBySecretId">;
  userGroupMembershipDAL: TUserGroupMembershipDALFactory;
  additionalPrivilegeDAL: TAdditionalPrivilegeDALFactory;
};

export type TOrgServiceFactory = ReturnType<typeof orgServiceFactory>;

export const orgServiceFactory = ({
  userAliasDAL,
  orgDAL,
  secretDAL,
  secretV2BridgeDAL,
  folderDAL,
  userDAL,
  groupDAL,
  roleDAL,
  incidentContactDAL,
  permissionService,
  smtpService,
  projectDAL,
  projectMembershipDAL,
  projectKeyDAL,
  orgMembershipDAL,
  tokenService,
  licenseService,
  samlConfigDAL,
  oidcConfigDAL,
  ldapConfigDAL,
  identityMetadataDAL,
  projectBotService,
  loginService,
  reminderService,
  membershipRoleDAL,
  membershipUserDAL,
  userGroupMembershipDAL,
  additionalPrivilegeDAL
}: TOrgServiceFactoryDep) => {
  /*
   * Get organization details by the organization id
   * */
  const findOrganizationById = async ({
    userId,
    orgId,
    actorAuthMethod,
    rootOrgId,
    actorOrgId
  }: {
    userId: string;
    orgId: string;
    actorAuthMethod: ActorAuthMethod;
    rootOrgId: string;
    actorOrgId: string;
  }) => {
    await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    const appCfg = getConfig();
    const hasSubOrg = rootOrgId !== actorOrgId;

    const org = await orgDAL.findOrgById(rootOrgId);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${rootOrgId}' not found` });

    let subOrg;
    if (hasSubOrg) {
      subOrg = await orgDAL.findOne({ rootOrgId, id: actorOrgId });

      if (!subOrg) throw new NotFoundError({ message: `Sub-organization with ID '${actorOrgId}' not found` });
    }

    const data = hasSubOrg && subOrg ? subOrg : org;
    if (!data.userTokenExpiration) {
      return { ...data, userTokenExpiration: appCfg.JWT_REFRESH_LIFETIME };
    }
    return data;
  };

  /*
   * Get all organization a user part of
   * */
  const findAllOrganizationOfUser = async (userId: string) => {
    const orgs = await orgDAL.findAllOrgsByUserId(userId);

    // Filter out orgs where the membership object is an invitation
    return orgs.filter((org) => org.userStatus !== "invited");
  };

  /*
   * Get all organization an identity is part of
   * */
  const findIdentityOrganization = async (identityId: string) => {
    const org = await orgDAL.findIdentityOrganization(identityId);

    return org;
  };
  /*
   * Get all workspace members
   * */
  const findAllOrgMembers = async (
    userId: string,
    orgId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const members = await orgDAL.findAllOrgMembers(orgId);
    return members;
  };

  const getOrgGroups = async ({ actor, actorId, orgId, actorAuthMethod, actorOrgId }: TGetOrgGroupsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionGroupActions.Read, OrgPermissionSubjects.Groups);
    const groups = await groupDAL.findByOrgId(orgId);
    return groups;
  };

  const findOrgMembersByUsername = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId,
    emails
  }: TFindOrgMembersByEmailDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const members = await orgDAL.findOrgMembersByUsername(orgId, emails);

    return members;
  };

  const findOrgBySlug = async (slug: string) => {
    const org = await orgDAL.findOrgBySlug(slug);
    if (!org) {
      throw new NotFoundError({ message: `Organization with slug '${slug}' not found` });
    }

    return org;
  };

  const findAllWorkspaces = async ({ actor, actorId, orgId }: TFindAllWorkspacesDTO) => {
    if (actor === ActorType.USER) {
      const workspaces = await projectDAL.findUserProjects(actorId, orgId);
      return workspaces;
    }

    if (actor === ActorType.IDENTITY) {
      const workspaces = await projectDAL.findIdentityProjects(actorId, orgId);
      return workspaces;
    }

    throw new BadRequestError({ message: "Invalid actor type" });
  };

  const addGhostUser = async (orgId: string, tx?: Knex) => {
    const email = `sudo-${alphaNumericNanoId(16)}-${orgId}@infisical.com`; // We add a nanoid because the email is unique. And we have to create a new ghost user each time, so we can have access to the private key.

    const password = crypto.randomBytes(128).toString("hex");

    const user = await userDAL.create(
      {
        isGhost: true,
        authMethods: [AuthMethod.EMAIL],
        username: email,
        email,
        isAccepted: true
      },
      tx
    );

    const encKeys = await generateUserSrpKeys(email, password);

    await userDAL.upsertUserEncryptionKey(
      user.id,
      {
        encryptionVersion: 2,
        publicKey: encKeys.publicKey
      },
      tx
    );

    const createMembershipData = {
      scopeOrgId: orgId,
      scope: AccessScope.Organization,
      actorUserId: user.id,
      status: OrgMembershipStatus.Accepted,
      isActive: true
    };

    const membership = await orgDAL.createMembership(createMembershipData, tx);
    await membershipRoleDAL.create(
      {
        membershipId: membership.id,
        role: OrgMembershipRole.Admin
      },
      tx
    );

    return {
      user,
      keys: encKeys
    };
  };

  const upgradePrivilegeSystem = async ({
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId
  }: TUpgradePrivilegeSystemDTO) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        message: "Insufficient privileges - only the organization admin can upgrade the privilege system."
      });
    }

    return orgDAL.transaction(async (tx) => {
      const org = await orgDAL.findById(actorOrgId, tx);
      if (org.shouldUseNewPrivilegeSystem) {
        throw new BadRequestError({
          message: "Privilege system already upgraded"
        });
      }

      const user = await userDAL.findById(actorId, tx);
      if (!user) {
        throw new NotFoundError({ message: `User with ID '${actorId}' not found` });
      }

      return orgDAL.updateById(
        actorOrgId,
        {
          shouldUseNewPrivilegeSystem: true,
          privilegeUpgradeInitiatedAt: new Date(),
          privilegeUpgradeInitiatedByUsername: user.username
        },
        tx
      );
    });
  };

  /*
   * Update organization details
   * */
  const updateOrg = async ({
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    orgId,
    data: {
      name,
      slug,
      authEnforced,
      googleSsoAuthEnforced,
      scimEnabled,
      defaultMembershipRoleSlug,
      enforceMfa,
      selectedMfaMethod,
      allowSecretSharingOutsideOrganization,
      bypassOrgAuthEnabled,
      userTokenExpiration,
      secretsProductEnabled,
      pkiProductEnabled,
      kmsProductEnabled,
      sshProductEnabled,
      scannerProductEnabled,
      shareSecretsProductEnabled,
      maxSharedSecretLifetime,
      maxSharedSecretViewLimit,
      blockDuplicateSecretSyncDestinations
    }
  }: TUpdateOrgDTO) => {
    const appCfg = getConfig();
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Settings);

    if (allowSecretSharingOutsideOrganization !== undefined) {
      ForbiddenError.from(permission).throwUnlessCan(
        OrgPermissionSecretShareAction.ManageSettings,
        OrgPermissionSubjects.SecretShare
      );
    }
    const plan = await licenseService.getPlan(orgId);
    const currentOrg = await orgDAL.findOrgById(actorOrgId);

    if (enforceMfa !== undefined) {
      if (!plan.enforceMfa) {
        throw new BadRequestError({
          message: "Failed to enforce user MFA due to plan restriction. Upgrade plan to enforce/un-enforce MFA."
        });
      }

      if (!appCfg.isSmtpConfigured) {
        throw new BadRequestError({
          message: "Failed to enforce user MFA due to missing instance SMTP configuration."
        });
      }
    }

    if (authEnforced !== undefined) {
      if (!plan?.samlSSO && !plan.oidcSSO)
        throw new BadRequestError({
          message: "Failed to enforce/un-enforce SSO due to plan restriction. Upgrade plan to enforce/un-enforce SSO."
        });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);
    }

    if (scimEnabled !== undefined) {
      if (!plan?.scim)
        throw new BadRequestError({
          message:
            "Failed to enable/disable SCIM provisioning due to plan restriction. Upgrade plan to enable/disable SCIM provisioning."
        });
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Scim);
      if (scimEnabled && !currentOrg.orgAuthMethod) {
        throw new BadRequestError({
          message: "Cannot enable SCIM when neither SAML or OIDC is configured."
        });
      }
    }

    if (googleSsoAuthEnforced !== undefined) {
      if (!plan.enforceGoogleSSO) {
        throw new BadRequestError({
          message: "Failed to enforce Google SSO due to plan restriction. Upgrade plan to enforce Google SSO."
        });
      }
      ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Sso);
    }

    if (authEnforced && googleSsoAuthEnforced) {
      throw new BadRequestError({
        message: "SAML/OIDC auth enforcement and Google SSO auth enforcement cannot be enabled at the same time."
      });
    }

    let samlCfg: TSamlConfigs | undefined;
    let oidcCfg: TOidcConfigs | undefined;
    if (authEnforced || googleSsoAuthEnforced) {
      samlCfg = await samlConfigDAL.findOne({
        orgId,
        isActive: true
      });
      oidcCfg = await oidcConfigDAL.findOne({
        orgId,
        isActive: true
      });
    }

    if (authEnforced) {
      if (!samlCfg && !oidcCfg)
        throw new NotFoundError({
          message: `SAML or OIDC configuration for organization with ID '${orgId}' not found`
        });

      if (samlCfg && !samlCfg.lastUsed) {
        throw new BadRequestError({
          message:
            "To apply the new SAML auth enforcement, please log in via SAML at least once. This step is required to enforce SAML-based authentication."
        });
      }

      if (oidcCfg && !oidcCfg.lastUsed) {
        throw new BadRequestError({
          message:
            "To apply the new OIDC auth enforcement, please log in via OIDC at least once. This step is required to enforce OIDC-based authentication."
        });
      }
    }

    if (slug) {
      const existingOrg = await orgDAL.findOne({ slug, rootOrgId: null });
      if (existingOrg && existingOrg?.id !== orgId)
        throw new BadRequestError({ message: `Organization with slug ${slug} already exists` });
    }

    if (googleSsoAuthEnforced) {
      if (googleSsoAuthEnforced && currentOrg.authEnforced) {
        throw new BadRequestError({
          message: "Google SSO auth enforcement cannot be enabled when SAML/OIDC auth enforcement is enabled."
        });
      }

      if (samlCfg) {
        throw new BadRequestError({
          message:
            "Cannot enable Google OAuth enforcement while SAML SSO is configured. Disable SAML SSO to enforce Google OAuth."
        });
      }

      if (oidcCfg) {
        throw new BadRequestError({
          message:
            "Cannot enable Google OAuth enforcement while OIDC SSO is configured. Disable OIDC SSO to enforce Google OAuth."
        });
      }

      const ldapCfg = await ldapConfigDAL.findOne({
        orgId,
        isActive: true
      });

      if (ldapCfg) {
        throw new BadRequestError({
          message:
            "Cannot enable Google OAuth enforcement while LDAP SSO is configured. Disable LDAP SSO to enforce Google OAuth."
        });
      }

      if (!currentOrg.googleSsoAuthLastUsed) {
        throw new BadRequestError({
          message:
            "Google SSO auth enforcement cannot be enabled because Google SSO has not been used yet. Please log in via Google SSO at least once before enforcing it for your organization."
        });
      }
    }

    let defaultMembershipRole: string | undefined;
    if (defaultMembershipRoleSlug) {
      defaultMembershipRole = await getDefaultOrgMembershipRoleForUpdateOrg({
        membershipRoleSlug: defaultMembershipRoleSlug,
        orgId,
        roleDAL,
        plan
      });
    }

    const org = await orgDAL.updateById(orgId, {
      name,
      slug: slug ? slugify(slug) : undefined,
      authEnforced,
      googleSsoAuthEnforced,
      scimEnabled,
      defaultMembershipRole,
      enforceMfa,
      selectedMfaMethod,
      allowSecretSharingOutsideOrganization,
      bypassOrgAuthEnabled,
      userTokenExpiration,
      secretsProductEnabled,
      pkiProductEnabled,
      kmsProductEnabled,
      sshProductEnabled,
      scannerProductEnabled,
      shareSecretsProductEnabled,
      maxSharedSecretLifetime,
      maxSharedSecretViewLimit,
      blockDuplicateSecretSyncDestinations
    });
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return org;
  };
  /*
   * Create organization
   * */
  const createOrganization = async (
    {
      userId,
      userEmail,
      orgName
    }: {
      userId?: string;
      orgName: string;
      userEmail?: string | null;
    },
    trx?: Knex
  ) => {
    const customerId = await licenseService.generateOrgCustomerId(orgName, userEmail);

    const createOrg = async (tx: Knex) => {
      // akhilmhdh: for now this is auto created. in future we can input from user and for previous users just modifiy
      const org = await orgDAL.create(
        { name: orgName, customerId, slug: slugify(`${orgName}-${alphaNumericNanoId(4)}`) },
        tx
      );
      if (userId) {
        const membership = await orgDAL.createMembership(
          {
            scope: AccessScope.Organization,
            actorUserId: userId,
            scopeOrgId: org.id,
            status: OrgMembershipStatus.Accepted,
            isActive: true
          },
          tx
        );
        await membershipRoleDAL.create(
          {
            membershipId: membership.id,
            role: OrgMembershipRole.Admin
          },
          tx
        );
      }

      return org;
    };

    const organization = await (trx ? createOrg(trx) : orgDAL.transaction(createOrg));

    await licenseService.updateSubscriptionOrgMemberCount(organization.id, trx);
    return organization;
  };

  /*
   * Delete organization by id
   * */
  const deleteOrganizationById = async ({
    userId,
    authorizationHeader,
    userAgentHeader,
    ipAddress,
    orgId,
    actorAuthMethod,
    actorOrgId
  }: {
    userId: string;
    authorizationHeader?: string;
    userAgentHeader?: string;
    ipAddress: string;
    orgId: string;
    actorAuthMethod: ActorAuthMethod;
    actorOrgId: string;
  }) => {
    const { hasRole } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    if (!hasRole(OrgMembershipRole.Admin)) {
      throw new ForbiddenRequestError({
        name: "DeleteOrganizationById",
        message: "Insufficient privileges"
      });
    }

    if (!authorizationHeader) {
      throw new UnauthorizedError({ name: "Authorization header not set on request." });
    }

    if (!userAgentHeader) {
      throw new BadRequestError({ name: "User agent not set on request." });
    }

    const cfg = getConfig();
    const authToken = authorizationHeader.replace("Bearer ", "");

    const decodedToken = crypto.jwt().verify(authToken, cfg.AUTH_SECRET) as AuthModeJwtTokenPayload;
    if (!decodedToken.authMethod) throw new UnauthorizedError({ name: "Auth method not found on existing token" });

    const response = await orgDAL.transaction(async (tx) => {
      const projects = await projectDAL.find({ orgId }, { tx });

      for await (const project of projects) {
        await fnDeleteProjectSecretReminders(project.id, {
          secretDAL,
          secretV2BridgeDAL,
          reminderService,
          projectBotService,
          folderDAL
        });
      }

      const deletedOrg = await orgDAL.deleteById(orgId, tx);

      if (deletedOrg.customerId) {
        await licenseService.removeOrgCustomer(deletedOrg.customerId);
      }

      // Generate new tokens without the organization ID present
      const user = await userDAL.findById(userId, tx);
      const { access: accessToken, refresh: refreshToken } = await loginService.generateUserTokens(
        {
          user,
          authMethod: decodedToken.authMethod,
          ip: ipAddress,
          userAgent: userAgentHeader,
          isMfaVerified: decodedToken.isMfaVerified,
          mfaMethod: decodedToken.mfaMethod
        },
        tx
      );

      return {
        organization: deletedOrg,
        tokens: {
          accessToken,
          refreshToken
        }
      };
    });

    return response;
  };
  /*
   * Org membership management
   * Not another service because it has close ties with how an org works doesn't make sense to seperate them
   * */
  const updateOrgMembership = async ({
    role,
    isActive,
    orgId,
    userId,
    membershipId,
    actorAuthMethod,
    actorOrgId,
    metadata
  }: TUpdateOrgMembershipDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Member);

    const foundMembership = await membershipUserDAL.findOne({
      id: membershipId,
      scope: AccessScope.Organization,
      scopeOrgId: actorOrgId
    });
    if (!foundMembership)
      throw new NotFoundError({ message: `Organization membership with ID ${membershipId} not found` });
    if (foundMembership.scopeOrgId !== orgId)
      throw new UnauthorizedError({ message: "Updated org member doesn't belong to the organization" });
    if (foundMembership.actorUserId === userId)
      throw new UnauthorizedError({ message: "Cannot update own organization membership" });

    const isCustomRole = !Object.values(OrgMembershipRole).includes(role as OrgMembershipRole);
    let userRole = role;
    let userRoleId: string | null = null;
    if (role && isCustomRole) {
      const customRole = await roleDAL.findOne({ slug: role, orgId });
      if (!customRole) throw new BadRequestError({ name: "UpdateMembership", message: "Organization role not found" });

      const plan = await licenseService.getPlan(orgId);
      if (!plan?.rbac)
        throw new BadRequestError({
          message: "Failed to assign custom role due to RBAC restriction. Upgrade plan to assign custom role to member."
        });

      userRole = OrgMembershipRole.Custom;
      userRoleId = customRole.id;
    }
    const membership = await orgDAL.transaction(async (tx) => {
      // this is because if isActive is undefined then this would fail due to knexjs error
      const [updatedOrgMembership] =
        typeof isActive === "undefined"
          ? [foundMembership]
          : await orgDAL.updateMembership(
              { id: membershipId, scopeOrgId: orgId, scope: AccessScope.Organization },
              { isActive },
              tx
            );
      if (userRole) {
        await membershipRoleDAL.delete({ membershipId }, tx);
        await membershipRoleDAL.create(
          {
            membershipId,
            role: userRole,
            customRoleId: userRoleId
          },
          tx
        );
      }

      if (metadata) {
        await identityMetadataDAL.delete({ userId: updatedOrgMembership.actorUserId, orgId }, tx);
        if (metadata.length) {
          await identityMetadataDAL.insertMany(
            metadata.map(({ key, value }) => ({
              userId: updatedOrgMembership.actorUserId as string,
              orgId,
              key,
              value
            })),
            tx
          );
        }
      }
      return updatedOrgMembership;
    });
    return membership;
  };

  const resendOrgMemberInvitation = async ({
    orgId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    membershipId
  }: TResendOrgMemberInvitationDTO) => {
    const appCfg = getConfig();
    const { permission } = await permissionService.getOrgPermission({
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.ParentOrganization
    });

    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Member);

    const invitingUser = await userDAL.findOne({ id: actorId });

    const org = await orgDAL.findOrgById(orgId);

    const [inviteeOrgMembership] = await orgDAL.findMembership({
      [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId,
      [`${TableName.Membership}.scope` as "scope"]: AccessScope.Organization,
      [`${TableName.Membership}.id` as "id"]: membershipId
    });

    if (inviteeOrgMembership.status !== OrgMembershipStatus.Invited) {
      throw new BadRequestError({
        message: "Organization invitation already accepted"
      });
    }

    const token = await tokenService.createTokenForUser({
      type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
      userId: inviteeOrgMembership.actorUserId as string,
      orgId
    });

    if (!appCfg.isSmtpConfigured) {
      return {
        signupToken: {
          email: inviteeOrgMembership.email as string,
          link: `${appCfg.SITE_URL}/signupinvite?token=${token}&to=${inviteeOrgMembership.email}&organization_id=${org?.id}`
        }
      };
    }

    await smtpService.sendMail({
      template: SmtpTemplates.OrgInvite,
      subjectLine: "Infisical organization invitation",
      recipients: [inviteeOrgMembership.email as string],
      substitutions: {
        inviterFirstName: invitingUser.firstName,
        inviterUsername: invitingUser.email,
        organizationName: org?.name,
        email: inviteeOrgMembership.email,
        organizationId: org?.id.toString(),
        token,
        callback_url: `${appCfg.SITE_URL}/signupinvite`
      }
    });

    await membershipUserDAL.updateById(inviteeOrgMembership.id, {
      lastInvitedAt: new Date()
    });

    return { signupToken: undefined };
  };

  /**
   * Organization invitation step 2: Verify that code [code] was sent to email [email] as part of
   * magic link and issue a temporary signup token for user to complete setting up their account
   */
  const verifyUserToOrg = async ({ orgId, email, code }: TVerifyUserToOrgDTO) => {
    const usersByUsername = await userDAL.findUserByUsername(email);
    const user =
      usersByUsername?.length > 1 ? usersByUsername.find((el) => el.username === email) : usersByUsername?.[0];
    if (!user) {
      throw new NotFoundError({ message: "User not found" });
    }

    const [orgMembership] = await orgDAL.findMembership({
      [`${TableName.Membership}.actorUserId` as "actorUserId"]: user.id,
      scope: AccessScope.Organization,
      status: OrgMembershipStatus.Invited,
      [`${TableName.Membership}.scopeOrgId` as "scopeOrgId"]: orgId
    });

    if (!orgMembership)
      throw new NotFoundError({
        message: "No pending invitation found"
      });

    const organization = await orgDAL.findById(orgId);

    await tokenService.validateTokenForUser({
      type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
      userId: user.id,
      orgId: orgMembership.scopeOrgId,
      code
    });

    await userDAL.updateById(user.id, {
      isEmailVerified: true
    });

    if (user.isAccepted) {
      // this means user has already completed signup process
      // isAccepted is set true when keys are exchanged
      await orgDAL.updateMembershipById(orgMembership.id, {
        scopeOrgId: orgId,
        status: OrgMembershipStatus.Accepted
      });
      await licenseService.updateSubscriptionOrgMemberCount(orgId);
      return { user };
    }

    const membershipRole = await membershipRoleDAL.findOne({ membershipId: orgMembership.id });
    if (
      organization.authEnforced &&
      !(organization.bypassOrgAuthEnabled && membershipRole.role === OrgMembershipRole.Admin)
    ) {
      return { user };
    }

    const appCfg = getConfig();
    const token = crypto.jwt().sign(
      {
        authTokenType: AuthTokenType.SIGNUP_TOKEN,
        userId: user.id
      },
      appCfg.AUTH_SECRET,
      {
        expiresIn: appCfg.JWT_SIGNUP_LIFETIME
      }
    );

    return { token, user };
  };

  const getOrgMembership = async ({
    membershipId,
    orgId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TGetOrgMembershipDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const membership = await orgMembershipDAL.findOrgMembershipById(membershipId);
    if (!membership) {
      throw new NotFoundError({ message: `Organization membership with ID '${membershipId}' not found` });
    }
    if (membership.orgId !== orgId) {
      throw new ForbiddenRequestError({ message: "Membership does not belong to organization" });
    }

    return membership;
  };

  const deleteOrgMembership = async ({
    orgId,
    userId,
    membershipId,
    actorAuthMethod,
    actorOrgId
  }: TDeleteOrgMembershipDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Member);

    const [deletedMembership] = await deleteOrgMembershipsFn({
      orgMembershipIds: [membershipId],
      orgId,
      orgDAL,
      projectKeyDAL,
      userAliasDAL,
      licenseService,
      userId,
      membershipUserDAL,
      membershipRoleDAL,
      userGroupMembershipDAL,
      additionalPrivilegeDAL
    });

    return deletedMembership;
  };

  const bulkDeleteOrgMemberships = async ({
    orgId,
    userId,
    membershipIds,
    actorAuthMethod,
    actorOrgId
  }: TDeleteOrgMembershipsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.Member);

    if (membershipIds.includes(userId)) {
      throw new BadRequestError({ message: "You cannot delete your own organization membership" });
    }

    const deletedMemberships = await deleteOrgMembershipsFn({
      orgMembershipIds: membershipIds,
      orgId,
      orgDAL,
      projectKeyDAL,
      userAliasDAL,
      licenseService,
      userId,
      membershipUserDAL,
      membershipRoleDAL,
      userGroupMembershipDAL,
      additionalPrivilegeDAL
    });

    return deletedMemberships;
  };

  const listProjectMembershipsByOrgMembershipId = async ({
    orgMembershipId,
    orgId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId
  }: TListProjectMembershipsByOrgMembershipIdDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      scope: OrganizationActionScope.Any,
      actor,
      actorId,
      orgId,
      actorAuthMethod,
      actorOrgId
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Member);

    const membership = await orgMembershipDAL.findOrgMembershipById(orgMembershipId);
    if (!membership) {
      throw new NotFoundError({ message: `Organization membership with ID '${orgMembershipId}' not found` });
    }
    if (membership.orgId !== orgId) throw new NotFoundError({ message: "Failed to find organization membership" });

    const projectMemberships = await projectMembershipDAL.findProjectMembershipsByUserId(orgId, membership.user.id);

    return projectMemberships;
  };

  /*
   * CRUD operations of incident contacts
   * */
  const findIncidentContacts = async (
    userId: string,
    orgId: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.Any
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.IncidentAccount);
    const incidentContacts = await incidentContactDAL.findByOrgId(orgId);
    return incidentContacts;
  };

  const createIncidentContact = async (
    userId: string,
    orgId: string,
    email: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.IncidentAccount);
    const doesIncidentContactExist = await incidentContactDAL.findOne(orgId, { email });
    if (doesIncidentContactExist) {
      throw new BadRequestError({
        message: "Incident contact already exists",
        name: "Incident contact exist"
      });
    }

    const incidentContact = await incidentContactDAL.create(orgId, email);
    return incidentContact;
  };

  const deleteIncidentContact = async (
    userId: string,
    orgId: string,
    id: string,
    actorAuthMethod: ActorAuthMethod,
    actorOrgId: string
  ) => {
    const { permission } = await permissionService.getOrgPermission({
      actor: ActorType.USER,
      actorId: userId,
      orgId,
      actorAuthMethod,
      actorOrgId,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Delete, OrgPermissionSubjects.IncidentAccount);

    const incidentContact = await incidentContactDAL.deleteById(id, orgId);
    return incidentContact;
  };

  /**
   * Re-send emails to users who haven't accepted an invite yet
   */
  const notifyInvitedUsers = async () => {
    logger.info(`${QueueName.DailyResourceCleanUp}: notify invited users started`);

    const invitedUsers = await orgMembershipDAL.findRecentInvitedMemberships();
    const appCfg = getConfig();

    const orgCache: Record<string, { name: string; id: string } | undefined> = {};
    const notifiedUsers: string[] = [];

    await Promise.all(
      invitedUsers.map(async (invitedUser) => {
        let org = orgCache[invitedUser.scopeOrgId];
        if (!org) {
          org = await orgDAL.findById(invitedUser.scopeOrgId);
          orgCache[invitedUser.scopeOrgId] = org;
        }

        if (!org || !invitedUser.actorUserId) return;

        const token = await tokenService.createTokenForUser({
          type: TokenType.TOKEN_EMAIL_ORG_INVITATION,
          userId: invitedUser.actorUserId,
          orgId: org.id
        });

        if (invitedUser.inviteEmail) {
          await delayMs(Math.max(0, applyJitter(0, 2000)));

          try {
            await smtpService.sendMail({
              template: SmtpTemplates.OrgInvite,
              subjectLine: `Reminder: You have been invited to ${org.name} on Infisical`,
              recipients: [invitedUser.inviteEmail],
              substitutions: {
                organizationName: org.name,
                email: invitedUser.inviteEmail,
                organizationId: org.id.toString(),
                token,
                callback_url: `${appCfg.SITE_URL}/signupinvite`
              }
            });
            notifiedUsers.push(invitedUser.id);
          } catch (err) {
            logger.error(err, `${QueueName.DailyResourceCleanUp}: notify invited users failed to send email`);
          }
        }
      })
    );

    await orgMembershipDAL.updateLastInvitedAtByIds(notifiedUsers);

    logger.info(`${QueueName.DailyResourceCleanUp}: notify invited users completed`);
  };

  return {
    findOrganizationById,
    findAllOrgMembers,
    findAllOrganizationOfUser,
    findIdentityOrganization,
    verifyUserToOrg,
    updateOrg,
    findOrgMembersByUsername,
    createOrganization,
    deleteOrganizationById,
    getOrgMembership,
    deleteOrgMembership,
    findAllWorkspaces,
    addGhostUser,
    updateOrgMembership,
    // incident contacts
    findIncidentContacts,
    createIncidentContact,
    deleteIncidentContact,
    getOrgGroups,
    listProjectMembershipsByOrgMembershipId,
    findOrgBySlug,
    resendOrgMemberInvitation,
    upgradePrivilegeSystem,
    notifyInvitedUsers,
    bulkDeleteOrgMemberships
  };
};
